import { useAuth } from '../auth';

export function Inicio() {
  const { usuario } = useAuth();
  return (
    <>
      <h1>Olá, {usuario?.nome.split(' ')[0]}!</h1>
      <p className="sutil">O painel está conectado à API.</p>
    </>
  );
}
