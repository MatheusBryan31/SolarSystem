import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { transacaoComAuditoria } from '../common/audit-transaction';
import { PasswordMailer } from './password-mailer';
import type { AlterarSenhaDto, RedefinirSenhaDto } from './password.schema';

const VALIDADE_MS = 15 * 60 * 1000;
const RESET_LIMPO = { passwordResetDigest: null, passwordResetExpiresAt: null };
const digerir = (token: string) => createHash('sha256').update(token).digest('hex');
const linkInvalido = () => new BadRequestException('Link inválido, expirado ou já utilizado');

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: PasswordMailer,
    private readonly config: ConfigService,
  ) {}

  solicitar(email: string) {
    // Mantém o caminho HTTP idêntico para todos os e-mails, inclusive se o SMTP estiver lento.
    setImmediate(() => {
      void this.emitir(email).catch(() => this.logger.warn('Falha ao processar recuperação de senha'));
    });
  }

  async emitir(email: string) {
    if (!this.mailer.habilitado) return;
    const token = randomBytes(32).toString('base64url');
    const digest = digerir(token);
    const agora = new Date();
    const { count } = await this.prisma.user.updateMany({
      where: {
        email,
        active: true,
        OR: [{ passwordResetExpiresAt: null }, { passwordResetExpiresAt: { lte: agora } }],
      },
      data: { passwordResetDigest: digest, passwordResetExpiresAt: new Date(agora.getTime() + VALIDADE_MS) },
    });
    if (!count) return;

    const link = new URL('/redefinir-senha', this.config.getOrThrow<string>('WEB_ORIGIN'));
    link.hash = new URLSearchParams({ token }).toString();
    try {
      await this.mailer.enviar(email, link.href);
    } catch {
      await this.prisma.user.updateMany({ where: { passwordResetDigest: digest }, data: RESET_LIMPO });
      throw new Error('Falha no envio da recuperação de senha');
    }
  }

  async redefinir({ token, novaSenha }: RedefinirSenhaDto) {
    const digest = digerir(token);
    const where = () => ({
      passwordResetDigest: digest,
      active: true,
      passwordResetExpiresAt: { gt: new Date() },
    });
    const usuario = await this.prisma.user.findFirst({ where: where(), select: { id: true } });
    if (!usuario) throw linkInvalido();
    const passwordHash = await hash(novaSenha, 12);
    // A mesma atualização consome o token e escreve a senha. Só um concorrente pode ter sucesso.
    const { count } = await transacaoComAuditoria(this.prisma, (tx) =>
      tx.user.updateMany({
        where: { ...where(), id: usuario.id },
        data: { ...RESET_LIMPO, passwordHash, sessionVersion: { increment: 1 } },
      }),
    );
    if (!count) throw linkInvalido();
  }

  async alterar(id: string, { senhaAtual, novaSenha }: AlterarSenhaDto) {
    const usuario = await this.prisma.user.findUnique({
      where: { id },
      select: { active: true, passwordHash: true },
    });
    if (!usuario?.active || !(await compare(senhaAtual, usuario.passwordHash))) {
      throw new BadRequestException('Senha atual incorreta');
    }
    const passwordHash = await hash(novaSenha, 12);
    const { count } = await transacaoComAuditoria(this.prisma, (tx) =>
      tx.user.updateMany({
        where: { id, active: true, passwordHash: usuario.passwordHash },
        data: { ...RESET_LIMPO, passwordHash, sessionVersion: { increment: 1 } },
      }),
    );
    if (!count) throw new BadRequestException('A senha mudou. Entre novamente e tente de novo.');
  }
}
