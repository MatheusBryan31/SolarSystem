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
  accessToken: string;
  usuario: Usuario;
}
