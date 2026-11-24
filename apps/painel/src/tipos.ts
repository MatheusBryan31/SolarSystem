// Os formatos que a API devolve. Espelham o back-end: se a API mudar, ajustamos aqui e o TypeScript aponta onde quebrou.

export type Perfil = 'ADMIN' | 'OPERATOR' | 'CLIENT';

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  role: Perfil;
  clientId?: string | null;
}

export interface RespostaLogin {
  usuario: Usuario; // o token não vem aqui: ele chega num cookie httpOnly
}

// Toda listagem da API vem nesse envelope
export interface Pagina<T> {
  itens: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

export type StatusUsina = 'ONLINE' | 'WARNING' | 'FAULT' | 'OFFLINE' | 'UNKNOWN';

export interface Usina {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  status: StatusUsina;
  capacityKwp: number | null;
  currentPowerKw: number | null;
  todayEnergyKwh: number | null;
  totalEnergyKwh: number | null;
  lastDataAt: string | null; // datas chegam como texto (JSON não tem tipo Date)
  client: { id: string; name: string } | null;
  clientId: string | null;
  origin: 'MANUAL' | 'IMPORTED';
  revision: number;
  integrationId: string | null;
  externalId: string | null;
  monitoring: 'UNLINKED' | 'PAUSED' | 'WAITING' | 'STALE' | 'ACTIVE';
  metadataSources: Record<'name' | 'city' | 'state' | 'capacityKwp', 'MANUAL' | 'REMOTE' | 'UNSET'>;
}

export interface Integracao {
  id: string;
  name: string;
  revision: number;
  enabled: boolean;
  archivedAt: string | null;
}
export interface Descoberta {
  id: string;
  integrationId: string;
  externalId: string;
  revision: number;
  observedAt: string;
  snapshot: { name: string; city: string | null; state: string | null; capacityKwp: number | null };
}

export interface Alerta {
  id: string;
  type: 'PLANT_OFFLINE' | 'PLANT_FAULT' | 'SYNC_FAILED';
  severity: 'WARNING' | 'CRITICAL';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  message: string;
  openedAt: string;
  plant: { id: string; name: string } | null;
}
