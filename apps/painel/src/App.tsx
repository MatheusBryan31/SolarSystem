import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useAuth } from './auth';
import { Layout } from './componentes/Layout';
import { Inicio } from './paginas/Inicio';
import { Login } from './paginas/Login';
import { FormularioSenha, RecuperarSenha } from './paginas/Senha';
import { Usinas } from './paginas/Usinas';
import { UsinaDetalhes } from './paginas/UsinaDetalhes';
import { Inversores } from './paginas/Inversores';
import { Cadastros } from './paginas/Cadastros';
import { Alarmes } from './paginas/Alarmes';
import { Relatorios } from './paginas/Relatorios';
import { Configuracoes } from './paginas/Configuracoes';

// O MAPA DO PAINEL: qual endereço mostra qual tela
export function App() {
  const { usuario, carregando, erroDeSessao, verificarSessao } = useAuth();
  const local = useLocation();

  if (carregando) return <div className="tela-cheia">Carregando...</div>;
  if (local.pathname === '/recuperar-senha') return <RecuperarSenha />;
  if (local.pathname === '/redefinir-senha') {
    return (
      <main className="tela-cheia">
        <FormularioSenha redefinir />
      </main>
    );
  }
  if (erroDeSessao) {
    return (
      <div className="tela-cheia">
        <div>
          <p role="alert">Não foi possível verificar sua sessão.</p>
          <button className="botao" type="button" onClick={verificarSessao}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // Deslogado: só existe a tela de login; qualquer outro endereço manda para ela
  if (!usuario) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="*"
          element={
            <Navigate to="/login" replace state={{ retorno: local.pathname + local.search + local.hash }} />
          }
        />
      </Routes>
    );
  }

  // Logado: as telas internas, todas dentro do Layout (menu lateral + topo)
  const retorno: unknown = local.state?.retorno;
  const destino =
    typeof retorno === 'string' &&
    /^\/(?:usinas(?:\/[a-zA-Z0-9-]+)?|inversores|clientes|usuarios|alarmes|relatorios|configuracoes|alterar-senha)?(?:[?#]|$)/.test(
      retorno,
    )
      ? retorno
      : '/';
  return (
    <Routes>
      <Route path="/login" element={<Navigate to={destino} replace />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Inicio />} />
        <Route path="/usinas" element={<Usinas />} />
        <Route path="/usinas/cadastro" element={<UsinaDetalhes nova />} />
        <Route path="/usinas/:id" element={<UsinaDetalhes />} />
        <Route path="/inversores" element={<Inversores />} />
        <Route path="/clientes" element={<Cadastros />} />
        <Route path="/usuarios" element={<Cadastros usuarios />} />
        <Route path="/alarmes" element={<Alarmes />} />
        <Route path="/relatorios" element={<Relatorios />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
        <Route path="/alterar-senha" element={<FormularioSenha />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
