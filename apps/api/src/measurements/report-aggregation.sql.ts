import { Prisma, Role } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import type { AggregationQuery } from './measurements.schemas';

// Retorna apenas buckets, sem transportar todas as leituras para a memória do Node.
export function reportAggregationSql(plantId: string, input: AggregationQuery, user: UsuarioAutenticado) {
  const from = new Date(input.from),
    to = new Date(input.to);
  const fmt = input.period === 'day' ? 'YYYY-MM-DD' : input.period === 'month' ? 'YYYY-MM' : 'YYYY';
  const tenant = user.role === Role.CLIENT ? Prisma.sql`p.client_id=${user.clientId}` : Prisma.sql`true`;
  return Prisma.sql`
    WITH data AS (
      SELECT m.*,to_char(date_trunc(${input.period},m.measured_at AT TIME ZONE ${input.timeZone}),${fmt}) sample_bucket,
        to_char(date_trunc(${input.period},greatest(m.period_start_at,${from}) AT TIME ZONE ${input.timeZone}),${fmt}) period_bucket
      FROM measurements m JOIN plants p ON p.id=m.plant_id
      WHERE m.plant_id=${plantId} AND m.source_link_id=${input.sourceLinkId}
        AND m.inverter_id IS NOT DISTINCT FROM ${input.inverterId ?? null}::text
        AND (${input.includeSimulated} OR NOT m.is_simulated) AND ${tenant}
        AND ((m.measured_at>=${from} AND m.measured_at<${to}) OR (m.period_start_at<${to} AND m.measured_at>${from}))
    ), intervals AS (
      SELECT *,max(measured_at) OVER(ORDER BY period_start_at,measured_at,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) prev_end,
        lead(period_start_at) OVER(ORDER BY period_start_at,measured_at,id) next_start
      FROM data WHERE period_start_at IS NOT NULL AND period_energy_kwh IS NOT NULL
    ), evaluated AS (
      SELECT *,quality='VALID' AND period_start_at>=${from} AND measured_at<=${to}
        AND period_bucket=to_char(date_trunc(${input.period},(measured_at-interval '1 millisecond') AT TIME ZONE ${input.timeZone}),${fmt})
        AND (prev_end IS NULL OR prev_end<=period_start_at) AND (next_start IS NULL OR next_start>=measured_at) eligible
      FROM intervals
    ), samples AS (
      SELECT sample_bucket bucket,count(*)::int samples,count(*) FILTER(WHERE quality<>'INVALID')::int usable,
        max(power_kw) FILTER(WHERE quality<>'INVALID') peak,bool_or(is_simulated) simulated
      FROM data WHERE measured_at>=${from} AND measured_at<${to} GROUP BY sample_bucket
    ), periods AS (
      SELECT period_bucket bucket,sum(period_energy_kwh) FILTER(WHERE eligible) energy,
        count(*) FILTER(WHERE eligible)::int accepted,count(*) FILTER(WHERE NOT eligible)::int excluded,bool_or(is_simulated) simulated
      FROM evaluated GROUP BY period_bucket
    )
    SELECT coalesce(s.bucket,e.bucket) bucket,coalesce(s.samples,0) samples,coalesce(s.usable,0) "usableSamples",
      s.peak "peakPowerKw",e.energy "observedPeriodEnergyKwh",coalesce(e.accepted,0) "acceptedPeriods",coalesce(e.excluded,0) "excludedPeriods",
      (coalesce(s.simulated,false) OR coalesce(e.simulated,false)) simulated,'NOT_ESTABLISHED' coverage
    FROM samples s FULL JOIN periods e ON s.bucket=e.bucket ORDER BY coalesce(s.bucket,e.bucket)`;
}
