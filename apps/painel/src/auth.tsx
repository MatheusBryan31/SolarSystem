import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ErroDaApi, quandoSessaoExpirar } from './api';
import type { RespostaLogin, Usuario } from './tipos';

/*
 * CONTEXTO DE AUTENTICAÇÃO: guarda "quem está logado" num lugar que QUALQUER
 * componente alcança com useAuth(), sem passar props de pai para filho.
 */
interface ValorAuth {
  usuario: Usuario | null;
  carregando: boolean; // true enquanto perguntamos à API se já existe sessão
  erroDeSessao: boolean;
  verificarSessao: () => void;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  redefinirSenha: (token: string, novaSenha: string) => Promise<void>;
  alterarSenha: (senhaAtual: string, novaSenha: string) => Promise<void>;
}

const AuthContext = createContext<ValorAuth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroDeSessao, setErroDeSessao] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const logout = useRef<{ expirou: boolean } | null>(null);

  // Ao abrir o painel: o JavaScript não enxerga o cookie, então PERGUNTA à API "tem sessão?"
  useEffect(() => {
    let ativo = true;
    const cancelarInscricao = quandoSessaoExpirar(() => {
      // Aguarda o servidor terminar de manipular o cookie antes de liberar outro login.
      if (logout.current) logout.current.expirou = true;
      else setUsuario(null);
    });
    api<Usuario>('/auth/me')
      .then((atual) => {
        if (ativo) setUsuario(atual);
      })
      .catch((erro: unknown) => {
        if (ativo && !(erro instanceof ErroDaApi && erro.status === 401)) setErroDeSessao(true);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
      cancelarInscricao();
    };
  }, [tentativa]);

  const verificarSessao = () => {
    setErroDeSessao(false);
    setCarregando(true);
    setTentativa((anterior) => anterior + 1);
  };

  const entrar = async (email: string, senha: string) => {
    const r = await api<RespostaLogin>('/auth/login', { metodo: 'POST', corpo: { email, senha } });
    setUsuario(r.usuario); // o cookie já foi gravado pelo navegador
  };

  // Só a API consegue apagar um cookie httpOnly: por isso o "sair" chama o servidor
  const sair = async () => {
    const operacao = { expirou: false };
    logout.current = operacao;
    try {
      await api('/auth/logout', { metodo: 'POST' });
      setUsuario(null);
    } finally {
      if (operacao.expirou) setUsuario(null);
      logout.current = null;
    }
  };

  const redefinirSenha = async (token: string, novaSenha: string) => {
    await api('/auth/password/reset', { metodo: 'POST', corpo: { token, novaSenha } });
    setUsuario(null);
  };

  const alterarSenha = async (senhaAtual: string, novaSenha: string) => {
    await api('/auth/password/change', { metodo: 'POST', corpo: { senhaAtual, novaSenha } });
    setUsuario(null);
  };

  return (
    <AuthContext.Provider
      value={{
        usuario,
        carregando,
        erroDeSessao,
        verificarSessao,
        entrar,
        sair,
        redefinirSenha,
        alterarSenha,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const valor = useContext(AuthContext);
  if (!valor) throw new Error('useAuth precisa estar dentro do <AuthProvider>');
  return valor;
}
