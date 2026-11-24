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
  const [alertasAtivos, setAlertasAtivos] = useState(0);

  // O sininho: quantos alertas precisam de atenção (atualiza a cada minuto)
  useEffect(() => {
    const contar = () =>
      api<Pagina<Alerta>>('/alerts?ativos=true&porPagina=1')
        .then((r) => setAlertasAtivos(r.total))
        .catch(() => {});
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
        <nav>
          <NavLink to="/" end>
            <Icone nome="painel" /> Visão geral
          </NavLink>
          <NavLink to="/usinas">
            <Icone nome="usina" /> Usinas
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
            <span className="sino" title={`${alertasAtivos} alerta(s) ativo(s)`}>
              <Icone nome="sino" />
              {alertasAtivos > 0 && <b>{alertasAtivos}</b>}
            </span>
            <span className="avatar pequeno">{inicial}</span>
            <button className="botao-sair" onClick={() => void sair()}>
              <Icone nome="sair" tamanho={18} /> Sair
            </button>
          </div>
        </header>
        <main className="pagina">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
