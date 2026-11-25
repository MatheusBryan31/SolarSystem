import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { api } from '../api';
import { useAuth } from '../auth';
import type { Alerta, Pagina, Perfil } from '../tipos';
import { Icone } from './Icone';
import { Logo } from './Logo';

const nomeDoPerfil: Record<Perfil, string> = {
  ADMIN: 'Administrador',
  OPERATOR: 'Operador',
  CLIENT: 'Cliente',
};

// A "moldura" das telas internas: menu à esquerda, topo, e o <Outlet/> (onde entra a tela da vez)
export function Layout() {
  const { usuario, sair } = useAuth();
  const [alertasAtivos, setAlertasAtivos] = useState<number | null>(null);
  const [saindo, setSaindo] = useState(false);
  const [erroAoSair, setErroAoSair] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);

  async function encerrarSessao() {
    setSaindo(true);
    setErroAoSair(false);
    try {
      await sair();
    } catch {
      setErroAoSair(true);
      setSaindo(false);
    }
  }

  // O sininho: quantos alertas precisam de atenção (atualiza a cada minuto)
  useEffect(() => {
    const contar = () =>
      api<Pagina<Alerta>>('/alerts?ativos=true&porPagina=1')
        .then((r) => setAlertasAtivos(r.total))
        .catch(() => setAlertasAtivos(null));
    void contar();
    const timer = setInterval(contar, 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!usuario) return null;
  const inicial = usuario.nome.charAt(0).toUpperCase();

  return (
    <div className="app">
      <aside className="menu">
        <Logo />
        <button
          className="menu-toggle"
          aria-expanded={menuAberto}
          aria-controls="navegacao-principal"
          onClick={() => setMenuAberto(!menuAberto)}
        >
          Menu
        </button>
        <nav
          id="navegacao-principal"
          aria-label="Principal"
          className={menuAberto ? 'menu-aberto' : 'menu-fechado'}
          onClick={() => setMenuAberto(false)}
        >
          <NavLink to="/" end>
            <Icone nome="painel" /> Visão geral
          </NavLink>
          <NavLink to="/usinas">
            <Icone nome="usina" /> Usinas
          </NavLink>
          {usuario.role !== 'CLIENT' && (
            <NavLink to="/usinas/cadastro">
              <Icone nome="usina" /> Cadastro
            </NavLink>
          )}
          <NavLink to="/inversores">
            <Icone nome="raio" /> Inversores
          </NavLink>
          <NavLink to="/clientes">
            <Icone nome="usina" /> Clientes
          </NavLink>
          {usuario.role === 'ADMIN' && (
            <NavLink to="/usuarios">
              <Icone nome="cadeado" /> Usuários
            </NavLink>
          )}
          <NavLink to="/alarmes">
            <Icone nome="alerta" /> Alarmes
          </NavLink>
          <NavLink to="/relatorios">
            <Icone nome="grafico" /> Relatórios
          </NavLink>
          <NavLink to="/configuracoes">
            <Icone nome="cadeado" /> Configurações
          </NavLink>
          <NavLink to="/alterar-senha">
            <Icone nome="cadeado" /> Alterar senha
          </NavLink>
        </nav>
        <div className="menu-usuario">
          <span className="avatar">{inicial}</span>
          <div>
            <strong>{usuario.nome}</strong>
            <small>{nomeDoPerfil[usuario.role]}</small>
          </div>
        </div>
      </aside>

      <div className="conteudo">
        <header className="topo">
          <span className="topo-titulo">Monitoramento de usinas solares</span>
          <div className="topo-acoes">
            <NavLink
              to="/alarmes"
              className="sino"
              aria-label={
                alertasAtivos === null ? 'Alarmes: contagem indisponível' : `${alertasAtivos} alarmes ativos`
              }
              title={alertasAtivos === null ? 'Contagem indisponível' : `${alertasAtivos} alerta(s) ativo(s)`}
            >
              <Icone nome="sino" />
              {(alertasAtivos ?? 0) > 0 && <b>{alertasAtivos}</b>}
            </NavLink>
            <span className="avatar pequeno">{inicial}</span>
            <button className="botao-sair" type="button" disabled={saindo} onClick={encerrarSessao}>
              <Icone nome="sair" tamanho={18} /> {saindo ? 'Saindo...' : 'Sair'}
            </button>
          </div>
        </header>
        <main className="pagina">
          {erroAoSair && <p role="alert">Não foi possível encerrar a sessão. Tente sair novamente.</p>}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
