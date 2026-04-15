import { useState } from "react";
import { readZipFile } from "./lib/zipReader";

export default function App() {
  const [backendStatus, setBackendStatus] = useState("ok");
  const [zipName, setZipName] = useState("");
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleZipChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError("");
    setFiles([]);
    setZipName(file.name);

    try {
      const entries = await readZipFile(file);
      setFiles(entries);
    } catch (err) {
      setError("No se pudo leer el ZIP.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const pdfFiles = files.filter((f) => f.isPdf);
  const otherFiles = files.filter((f) => !f.isPdf);

  return (
    <div style={{ padding: 24, fontFamily: "Arial, sans-serif", maxWidth: 1000, margin: "0 auto" }}>
      <h1>ManualTeX v1</h1>
      <p>Backend: <strong>{backendStatus}</strong></p>

      <div style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
        <h2>Cargar ZIP</h2>
        <input type="file" accept=".zip" onChange={handleZipChange} />

        {zipName && <p style={{ marginTop: 12 }}><strong>ZIP:</strong> {zipName}</p>}
        {loading && <p>Leyendo ZIP...</p>}
        {error && <p style={{ color: "crimson" }}>{error}</p>}
      </div>

      {!loading && files.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 10, marginBottom: 16 }}>
            <h3>Resumen</h3>
            <p>Total de archivos: <strong>{files.length}</strong></p>
            <p>PDF detectados: <strong>{pdfFiles.length}</strong></p>
            <p>Otros archivos: <strong>{otherFiles.length}</strong></p>
          </div>

          <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 10, marginBottom: 16 }}>
            <h3>PDF detectados</h3>
            {pdfFiles.length === 0 ? (
              <p>No se detectaron PDFs.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Nombre</th>
                    <th style={th}>Ruta</th>
                    <th style={th}>Extensión</th>
                  </tr>
                </thead>
                <tbody>
                  {pdfFiles.map((file, idx) => (
                    <tr key={idx}>
                      <td style={td}>{file.name}</td>
                      <td style={td}>{file.path}</td>
                      <td style={td}>{file.extension}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
            <h3>Otros archivos</h3>
            {otherFiles.length === 0 ? (
              <p>No hay otros archivos.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Nombre</th>
                    <th style={th}>Ruta</th>
                    <th style={th}>Extensión</th>
                  </tr>
                </thead>
                <tbody>
                  {otherFiles.map((file, idx) => (
                    <tr key={idx}>
                      <td style={td}>{file.name}</td>
                      <td style={td}>{file.path}</td>
                      <td style={td}>{file.extension}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const th = {
  textAlign: "left",
  borderBottom: "1px solid #ddd",
  padding: "8px"
};

const td = {
  borderBottom: "1px solid #eee",
  padding: "8px",
  verticalAlign: "top"
};
