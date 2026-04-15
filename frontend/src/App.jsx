import { useState, useRef } from "react";
import JSZip from "jszip";
import { extractPdfText } from "./lib/pdfExtractor";

export default function App() {
  const [backendStatus] = useState("ok");

  const [zipName, setZipName] = useState("");
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [corpus, setCorpus] = useState([]);
  const [processingLog, setProcessingLog] = useState([]);

  const zipRef = useRef(null);

  async function handleZipChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError("");
    setFiles([]);
    setCorpus([]);
    setProcessingLog([]);
    setZipName(file.name);

    try {
      const zip = await JSZip.loadAsync(file);
      zipRef.current = zip;

      const entries = [];

      for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;

        entries.push({
          name: zipEntry.name.split("/").pop(),
          path: relativePath,
          extension: getExtension(zipEntry.name),
          isPdf: zipEntry.name.toLowerCase().endsWith(".pdf")
        });
      }

      setFiles(entries);
    } catch (err) {
      setError(`No se pudo leer el ZIP: ${err.message}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function processPdfs() {
    if (!zipRef.current) return;

    setLoading(true);
    setError("");
    setCorpus([]);
    setProcessingLog([]);

    try {
      const pdfFiles = files.filter((f) => f.isPdf);
      const results = [];
      const logs = [];

      for (const file of pdfFiles) {
        logs.push(`Procesando: ${file.name}`);
        setProcessingLog([...logs]);

        try {
          const data = await extractPdfText(zipRef.current, file.path);

          results.push({
            name: file.name,
            pages: data.pages,
            chars: data.chars
          });

          logs.push(`OK: ${file.name} — ${data.pages} págs — ${data.chars} chars`);
          setProcessingLog([...logs]);
        } catch (err) {
          logs.push(`ERROR: ${file.name} — ${err.message}`);
          setProcessingLog([...logs]);
          throw err;
        }
      }

      setCorpus(results);
    } catch (err) {
      console.error(err);
      setError(`Error procesando PDFs: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  const pdfFiles = files.filter((f) => f.isPdf);
  const otherFiles = files.filter((f) => !f.isPdf);

  return (
    <div style={{ padding: 24, fontFamily: "Arial", maxWidth: 1000, margin: "0 auto" }}>
      <h1>ManualTeX v1</h1>
      <p>Backend: <strong>{backendStatus}</strong></p>

      <div style={card}>
        <h2>Cargar ZIP</h2>
        <input type="file" accept=".zip" onChange={handleZipChange} />

        {zipName && <p><strong>ZIP:</strong> {zipName}</p>}
        {loading && <p>Leyendo...</p>}
        {error && <p style={{ color: "crimson" }}>{error}</p>}
      </div>

      {files.length > 0 && !loading && (
        <div style={card}>
          <h3>Resumen</h3>
          <p>Total de archivos: <strong>{files.length}</strong></p>
          <p>PDF detectados: <strong>{pdfFiles.length}</strong></p>
          <p>Otros archivos: <strong>{otherFiles.length}</strong></p>
        </div>
      )}

      {pdfFiles.length > 0 && (
        <div style={card}>
          <button onClick={processPdfs} style={button}>
            Procesar PDFs
          </button>
        </div>
      )}

      {processingLog.length > 0 && (
        <div style={card}>
          <h3>Log de procesamiento</h3>
          {processingLog.map((line, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              {line}
            </div>
          ))}
        </div>
      )}

      {pdfFiles.length > 0 && (
        <div style={card}>
          <h3>PDF detectados</h3>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Nombre</th>
                <th style={th}>Ruta</th>
                <th style={th}>Extensión</th>
              </tr>
            </thead>
            <tbody>
              {pdfFiles.map((file, i) => (
                <tr key={i}>
                  <td style={td}>{file.name}</td>
                  <td style={td}>{file.path}</td>
                  <td style={td}>{file.extension}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {otherFiles.length > 0 && (
        <div style={card}>
          <h3>Otros archivos</h3>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Nombre</th>
                <th style={th}>Ruta</th>
                <th style={th}>Extensión</th>
              </tr>
            </thead>
            <tbody>
              {otherFiles.map((file, i) => (
                <tr key={i}>
                  <td style={td}>{file.name}</td>
                  <td style={td}>{file.path}</td>
                  <td style={td}>{file.extension}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {corpus.length > 0 && (
        <div style={card}>
          <h3>Corpus procesado</h3>
          {corpus.map((doc, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <strong>{doc.name}</strong> — {doc.pages} páginas — {doc.chars} caracteres
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getExtension(filename) {
  const parts = filename.split(".");
  if (parts.length < 2) return "";
  return parts.pop().toLowerCase();
}

const card = {
  marginTop: 20,
  padding: 16,
  border: "1px solid #ddd",
  borderRadius: 10
};

const button = {
  padding: "10px 16px",
  fontSize: 16,
  cursor: "pointer"
};

const table = {
  width: "100%",
  borderCollapse: "collapse"
};

const th = {
  textAlign: "left",
  borderBottom: "1px solid #ddd",
  padding: "8px"
};

const td = {
  borderBottom: "1px solid #eee",
  padding: "8px"
};
