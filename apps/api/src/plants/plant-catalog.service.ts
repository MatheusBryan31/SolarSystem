import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { metadata, json, readOverrides, project, Snapshot, telemetry } from './plant-domain';
import { recordSnapshot } from '../measurements/measurement-writer';

@Injectable()
export class PlantCatalogService {
  async apply(
    tx: Prisma.TransactionClient,
    integrationId: string,
    next: Snapshot,
    now: Date,
    importNew = false,
    actorId: string | null = null,
  ) {
    const key = { integrationId, externalId: next.externalId };
    const link = await tx.plantExternalLink.findUnique({
      where: { integrationId_externalId: key },
      include: { plant: true },
    });
    if (link?.state === 'DETACHED') return 'reserved' as const;
    if (link) {
      await this.updateLinked(tx, link, next, now);
      return 'updated' as const;
    }
    // Sem decisão explícita, toda identidade nova passa por descoberta. Isso também
    // evita supor que ausência de candidato por nome prova ausência de duplicatas.
    if (!importNew) {
      await tx.plantDiscovery.upsert({
        where: { integrationId_externalId: key },
        create: { ...key, snapshot: json(next), observedAt: now },
        update: { snapshot: json(next), observedAt: now, revision: { increment: 1 } },
      });
      return 'pending' as const;
    }
    const sample = telemetry(next, null);
    const plant = await tx.plant.create({
      data: {
        origin: 'IMPORTED',
        ...metadata(next),
        ...sample.fields,
        integrationId,
        externalId: next.externalId,
      },
    });
    const createdLink = await tx.plantExternalLink.create({
      data: {
        ...key,
        plantId: plant.id,
        remoteMetadata: json(metadata(next)),
        lastSample: sample.lastSample,
        observedAt: now,
      },
    });
    await recordSnapshot(tx, plant.id, createdLink.id, integrationId, next, now);
    await this.audit(tx, plant.id, actorId, 'IMPORT', { integrationId, linkId: createdLink.id });
    return 'imported' as const;
  }

  async updateLinked(
    tx: Prisma.TransactionClient,
    link: Prisma.PlantExternalLinkGetPayload<{ include: { plant: true } }>,
    next: Snapshot,
    now: Date,
  ) {
    const sample = telemetry(next, link.lastSample);
    await recordSnapshot(tx, link.plantId, link.id, link.integrationId, next, now);
    await tx.plantExternalLink.update({
      where: { id: link.id },
      data: {
        remoteMetadata: json(metadata(next)),
        lastSample: sample.lastSample,
        observedAt: now,
        revision: { increment: 1 },
      },
    });
    await tx.plant.update({
      where: { id: link.plantId },
      data: {
        ...project(metadata(next), readOverrides(link.plant.manualOverrides)),
        ...sample.fields,
        revision: { increment: 1 },
      },
    });
  }

  async link(
    tx: Prisma.TransactionClient,
    plantId: string,
    input: {
      integrationId: string;
      externalId: string;
      revision: number;
      discoveryRevision?: number;
    },
    actorId: string,
  ) {
    const plant = await tx.plant.findUnique({ where: { id: plantId } });
    if (!plant) throw new NotFoundException('Usina não encontrada');
    const integration = await tx.integration.findUnique({ where: { id: input.integrationId } });
    if (!integration || !integration.enabled || integration.archivedAt)
      throw new BadRequestException('Integração indisponível para vinculação');
    const key = { integrationId: input.integrationId, externalId: input.externalId };
    const existing = await tx.plantExternalLink.findUnique({ where: { integrationId_externalId: key } });
    if (existing && existing.plantId !== plantId)
      throw new ConflictException(
        'Identidade já pertence a outra usina. Conciliação administrativa necessária.',
      );
    if (existing?.state === 'ACTIVE') return; // Repetição idempotente, sem alterar cadastro.
    if (plant.revision !== input.revision)
      throw new ConflictException('Usina alterada. Recarregue antes de vincular.');
    if (await tx.plantExternalLink.findFirst({ where: { plantId, state: 'ACTIVE' } }))
      throw new ConflictException('Usina já possui uma fonte ativa');
    const discovery = await tx.plantDiscovery.findUnique({ where: { integrationId_externalId: key } });
    if (!existing && (!discovery || discovery.resolvedAt))
      throw new BadRequestException('Sincronize e selecione uma descoberta pendente');
    if (!existing && discovery!.revision !== input.discoveryRevision)
      throw new ConflictException('Descoberta alterada. Revise os dados atuais.');
    // Vincular não transforma uma leitura antiga em atual. Uma nova sincronização
    // fornecerá telemetria; na reconexão, conservamos apenas o snapshot histórico.
    const remote = existing
      ? metadata(existing.remoteMetadata as unknown as ReturnType<typeof metadata>)
      : metadata(discovery!.snapshot as unknown as ReturnType<typeof metadata>);
    let linkId: string;
    if (existing) {
      await tx.plantExternalLink.update({
        where: { id: existing.id },
        data: {
          state: 'ACTIVE',
          detachedAt: null,
          linkedAt: new Date(),
          revision: { increment: 1 },
        },
      });
      linkId = existing.id;
    } else {
      const created = await tx.plantExternalLink.create({
        data: {
          ...key,
          plantId,
          remoteMetadata: json(remote),
          observedAt: discovery!.observedAt,
        },
      });
      linkId = created.id;
    }
    await tx.plant.update({
      where: { id: plantId },
      data: {
        ...project(remote, readOverrides(plant.manualOverrides)),
        integrationId: key.integrationId,
        externalId: key.externalId,
        revision: { increment: 1 },
      },
    });
    if (discovery && !discovery.resolvedAt)
      await tx.plantDiscovery.update({
        where: { id: discovery.id },
        data: { resolvedAt: new Date(), plantId },
      });
    await tx.integration.update({ where: { id: key.integrationId }, data: { revision: { increment: 1 } } });
    await this.audit(tx, plantId, actorId, 'LINK', { integrationId: key.integrationId, linkId });
  }

  async audit(
    tx: Prisma.TransactionClient,
    plantId: string,
    actorId: string | null,
    operation: string,
    details: unknown,
  ) {
    await tx.plantAuditEvent.create({ data: { plantId, actorId, operation, details: json(details) } });
  }
}
