import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';

export function Login() {
  const { entrar } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault(); // impede o navegador de recarregar a página
    setErro('');
    setEnviando(true);
    try {
      await entrar(email, senha); // deu certo: o App percebe o usuário e troca para as telas internas
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível entrar');
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <aside className="login-marca">
        <div className="logo">
          <span className="logo-sol" aria-hidden="true" />
          <span>
            Solar<b>System</b>
          </span>
        </div>
        <div>
          <h1>Todas as suas usinas solares em um só painel.</h1>
          <p>
            Geração, alertas e clientes de várias plataformas de inversores, reunidos e atualizados sozinhos.
          </p>
        </div>
        <small>Vale do Jequitinhonha · MG</small>
      </aside>

      <main className="login-area">
        <form className="cartao login-form" onSubmit={enviar}>
          <h2>Entrar</h2>
          <p className="sutil">Use o e-mail e a senha cadastrados pelo administrador.</p>

          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {erro && (
            <p className="erro" role="alert">
              {erro}
            </p>
          )}

          <button className="botao" type="submit" disabled={enviando}>
            {enviando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </main>
    </div>
  );
}
