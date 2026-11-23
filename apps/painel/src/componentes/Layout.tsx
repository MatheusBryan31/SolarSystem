import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth';
import type { Perfil } from '../tipos';

const nomeDoPerfil: Record<Perfil, string> = {
  ADMIN: 'Administrador',
  OPERATOR: 'Operador',
  CLIENT: 'Cliente',
};

// A "moldura" das telas internas: menu à esquerda, topo, e o <Outlet/> (onde entra a tela da vez)
export function Layout() {
  const { usuario, sair } = useAuth();
  if (!usuario) return null;

  return (
    <div className="app">
      <nav className="menu">
        <div className="logo">
          <span className="logo-sol" aria-hidden="true" />
          <span>
            Solar<b>System</b>
          </span>
        </div>
        <NavLink to="/" end>
          Visão geral
        </NavLink>
        {/* As próximas aulas acrescentam aqui: Usinas, Alertas, Clientes, Usuários */}
      </nav>

      <div className="conteudo">
        <header className="topo">
          <div className="quem">
            <span className="avatar" aria-hidden="true">
              {usuario.nome.charAt(0).toUpperCase()}
            </span>
            <div>
              <strong>{usuario.nome}</strong>
              <span className="sutil">{nomeDoPerfil[usuario.role]}</span>
            </div>
          </div>
          <button className="botao-secundario" onClick={sair}>
            Sair
          </button>
        </header>
        <main className="pagina">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
