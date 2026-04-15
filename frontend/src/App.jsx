import { useEffect, useState } from "react";

export default function App() {
  const [status, setStatus] = useState("cargando...");

  useEffect(() => {
    fetch(import.meta.env.VITE_API_URL + "/api/health")
      .then(res => res.json())
      .then(data => setStatus(data.status))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>ManualTeX v1</h1>
      <p>Backend: {status}</p>
    </div>
  );
}
