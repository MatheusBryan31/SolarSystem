// A marca: "Solar" branco + "System" verde, como no front do Atos
export function Logo({ tamanho = 24 }: { tamanho?: number }) {
  return (
    <span className="logo" style={{ fontSize: tamanho }}>
      Solar<b>System</b>
    </span>
  );
}
