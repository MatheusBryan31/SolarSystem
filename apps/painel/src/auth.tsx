import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, apagarToken, quandoSessaoExpirar, salvarToken, tokenSalvo } from './api';
import type { RespostaLogin, Usuario } from './tipos';

/*
 * CONTEXTO DE AUTENTICAÇÃO: guarda "quem está logado" num lugar que QUALQUER
 * componente alcança com useAuth(), sem passar props de pai para filho.
 */
interface ValorAuth {
  usuario: Usuario | null;
  carregando: boolean; // true enquanto conferimos se o token salvo ainda vale
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => void;
}

const AuthContext = createContext<ValorAuth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(() => tokenSalvo() !== null);

  const sair = () => {
    apagarToken();
    setUsuario(null);
  };

  // Ao abrir o painel: se há token salvo, pergunta à API "de quem é este token?"
  useEffect(() => {
    quandoSessaoExpirar(sair);
    if (!tokenSalvo()) return;
    api<Usuario>('/auth/me')
      .then(setUsuario)
      .catch(sair) // token vencido ou inválido: começa deslogado
      .finally(() => setCarregando(false));
  }, []);

  const entrar = async (email: string, senha: string) => {
    const r = await api<RespostaLogin>('/auth/login', { metodo: 'POST', corpo: { email, senha } });
    salvarToken(r.accessToken);
    setUsuario(r.usuario);
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
