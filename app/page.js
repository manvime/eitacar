export default function Home() {
  return (
    <div style={{ fontFamily: "Arial, sans-serif" }}>
      <h2>Ocram</h2>
      <p>
        <a href="/login">Login</a> |{" "}
        <a href="/buscar">Buscar placa</a> |{" "}
        <a href="/admin">Admin</a>
      </p>
    </div>
  );
}
