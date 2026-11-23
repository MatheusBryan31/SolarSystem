import { Navigate, Route, Routes } from 'react-router';
import { useAuth } from './auth';
import { Layout } from './componentes/Layout';
import { Inicio } from './paginas/Inicio';
import { Login } from './paginas/Login';

// O MAPA DO PAINEL: qual endereço mostra qual tela
export function App() {
  const { usuario, carregando } = useAuth();

  if (carregando) return <div className="tela-cheia">Carregando...</div>;

  // Deslogado: só existe a tela de login; qualquer outro endereço manda para ela
  if (!usuario) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Logado: as telas internas, todas dentro do Layout (menu lateral + topo)
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Inicio />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
