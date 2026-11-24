import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ErroDaApi } from '../api';
import { useAuth } from '../auth';
import { Icone, type NomeIcone } from '../componentes/Icone';
import { Logo } from '../componentes/Logo';

const destaques: { icone: NomeIcone; texto: string }[] = [
  { icone: 'plug', texto: 'Várias plataformas de inversores em um só lugar' },
  { icone: 'alerta', texto: 'Alertas automáticos quando uma usina para' },
  { icone: 'escudo', texto: 'Acesso por perfil: cada cliente vê só o que é dele' },
];

export function Login() {
  const { entrar } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [espera, setEspera] = useState<number>();

  useEffect(() => {
    if (espera === undefined) return;
    const timer = setTimeout(() => {
      setEspera(undefined);
      setErro('');
    }, espera * 1000);
    return () => clearTimeout(timer);
  }, [espera]);

  async function enviar(evento: FormEvent) {
    evento.preventDefault(); // impede o navegador de recarregar a página
    if (enviando || espera !== undefined) return;
    setErro('');
    setEnviando(true);
    try {
      await entrar(email, senha); // deu certo: o App percebe o usuário e troca para as telas internas
    } catch (e) {
      if (e instanceof ErroDaApi && e.status === 429) {
        setEspera(e.retryAfterSeconds);
        setErro(
          e.retryAfterSeconds
            ? `Muitas tentativas de login. Tente novamente em ${e.retryAfterSeconds} s.`
            : 'Muitas tentativas de login. Aguarde um momento e tente novamente.',
        );
      } else {
        setErro(e instanceof Error ? e.message : 'Não foi possível entrar');
      }
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <section className="login-hero">
        <Logo tamanho={34} />
        <div>
          <span className="selo">
            <Icone nome="sol" tamanho={16} /> Monitoramento fotovoltaico
          </span>
          <h1>
            Energia solar sob controle, <em>em tempo real.</em>
          </h1>
          <p>Geração, alertas e clientes de todas as suas usinas, reunidos e atualizados automaticamente.</p>
          <ul className="destaques">
            {destaques.map((d) => (
              <li key={d.icone}>
                <span>
                  <Icone nome={d.icone} tamanho={18} />
                </span>
                {d.texto}
              </li>
            ))}
          </ul>
        </div>
        <small>© {new Date().getFullYear()} SolarSystem · Vale do Jequitinhonha, MG</small>
      </section>

      <main className="login-lado">
        <form className="login-cartao" onSubmit={enviar}>
          <h2>Bem-vindo de volta</h2>
          <p className="sutil">Entre para acompanhar suas usinas.</p>

          <label>
            E-mail
            <span className="campo">
              <Icone nome="email" tamanho={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
                autoComplete="username"
                required
                autoFocus
              />
            </span>
          </label>
          <label>
            Senha
            <span className="campo">
              <Icone nome="cadeado" tamanho={18} />
              <input
                type={mostrarSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Sua senha"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="campo-botao"
                onClick={() => setMostrarSenha(!mostrarSenha)}
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              >
                <Icone nome={mostrarSenha ? 'olhoFechado' : 'olho'} tamanho={18} />
              </button>
            </span>
          </label>

          {erro && (
            <p className="erro" role="alert">
              {erro}
            </p>
          )}

          <button className="botao" type="submit" disabled={enviando || espera !== undefined}>
            {enviando ? 'Entrando...' : 'Entrar'} <Icone nome="seta" tamanho={18} />
          </button>

          <p className="seguranca">
            <Icone nome="escudo" tamanho={16} /> Sessão protegida por cookie httpOnly
          </p>
          <Link to="/recuperar-senha">Esqueci minha senha</Link>
        </form>
      </main>
    </div>
  );
}
