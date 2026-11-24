import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { useAuth } from '../auth';

export function RecuperarSenha() {
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const email = new FormData(evento.currentTarget).get('email');
    setEnviando(true);
    setErro('');
    try {
      const resposta = await api<{ message: string }>('/auth/password/forgot', {
        metodo: 'POST',
        corpo: { email },
      });
      setMensagem(resposta.message);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível enviar a solicitação.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="tela-cheia">
      <form className="login-cartao" onSubmit={enviar}>
        <h1>Recuperar senha</h1>
        {mensagem ? (
          <p role="status">{mensagem}</p>
        ) : (
          <>
            <label>
              E-mail
              <span className="campo">
                <input name="email" type="email" autoComplete="username" required />
              </span>
            </label>
            {erro && (
              <p role="alert" className="erro">
                {erro}
              </p>
            )}
            <button type="submit" className="botao" disabled={enviando}>
              Enviar instruções
            </button>
          </>
        )}
        <Link to="/login">Voltar ao login</Link>
      </form>
    </main>
  );
}

export function FormularioSenha({ redefinir = false }: { redefinir?: boolean }) {
  const auth = useAuth();
  const [token] = useState(() =>
    redefinir ? new URLSearchParams(window.location.hash.slice(1)).get('token') : null,
  );
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  useEffect(() => {
    if (redefinir && window.location.hash) {
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      );
    }
  }, [redefinir]);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const novaSenha = String(dados.get('novaSenha'));
    if (novaSenha !== dados.get('confirmacao')) {
      setErro('As senhas não coincidem.');
      return;
    }
    if (new TextEncoder().encode(novaSenha).length > 72) {
      setErro('Use no máximo 72 bytes na senha.');
      return;
    }
    setErro('');
    setEnviando(true);
    try {
      if (token) await auth.redefinirSenha(token, novaSenha);
      else await auth.alterarSenha(String(dados.get('senhaAtual')), novaSenha);
      setConcluido(true);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível atualizar a senha.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="login-cartao" onSubmit={enviar}>
      <h1>{redefinir ? 'Redefinir senha' : 'Alterar senha'}</h1>
      {concluido ? (
        <>
          <p role="status">Senha atualizada. Entre com a nova senha.</p>
          <Link to="/login">Ir para o login</Link>
        </>
      ) : redefinir && !token ? (
        <>
          <p role="alert">Link inválido ou expirado.</p>
          <Link to="/recuperar-senha">Solicitar um novo link</Link>
        </>
      ) : (
        <>
          {!redefinir && (
            <label>
              Senha atual
              <span className="campo">
                <input name="senhaAtual" type="password" autoComplete="current-password" required />
              </span>
            </label>
          )}
          <label>
            Nova senha
            <span className="campo">
              <input name="novaSenha" type="password" autoComplete="new-password" minLength={10} required />
            </span>
          </label>
          <label>
            Confirmar nova senha
            <span className="campo">
              <input name="confirmacao" type="password" autoComplete="new-password" minLength={10} required />
            </span>
          </label>
          {erro && (
            <p role="alert" className="erro">
              {erro}
            </p>
          )}
          <button type="submit" className="botao" disabled={enviando}>
            Salvar senha
          </button>
          {redefinir && <Link to="/recuperar-senha">Solicitar um novo link</Link>}
        </>
      )}
    </form>
  );
}
