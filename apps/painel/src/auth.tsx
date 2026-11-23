import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, quandoSessaoExpirar } from './api';
import type { RespostaLogin, Usuario } from './tipos';

/*
 * CONTEXTO DE AUTENTICAÇÃO: guarda "quem está logado" num lugar que QUALQUER
 * componente alcança com useAuth(), sem passar props de pai para filho.
 */
interface ValorAuth {
  usuario: Usuario | null;
  carregando: boolean; // true enquanto perguntamos à API se já existe sessão
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
}

const AuthContext = createContext<ValorAuth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  // Ao abrir o painel: o JavaScript não enxerga o cookie, então PERGUNTA à API "tem sessão?"
  useEffect(() => {
    quandoSessaoExpirar(() => setUsuario(null));
    api<Usuario>('/auth/me')
      .then(setUsuario)
      .catch(() => setUsuario(null)) // 401: ninguém logado
      .finally(() => setCarregando(false));
  }, []);

  const entrar = async (email: string, senha: string) => {
    const r = await api<RespostaLogin>('/auth/login', { metodo: 'POST', corpo: { email, senha } });
    setUsuario(r.usuario); // o cookie já foi gravado pelo navegador
  };

  // Só a API consegue apagar um cookie httpOnly: por isso o "sair" chama o servidor
  const sair = async () => {
    await api('/auth/logout', { metodo: 'POST' }).catch(() => {});
    setUsuario(null);
  };

  return (
    <AuthContext.Provider value={{ usuario, carregando, entrar, sair }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const valor = useContext(AuthContext);
  if (!valor) throw new Error('useAuth precisa estar dentro do <AuthProvider>');
  return valor;
}
