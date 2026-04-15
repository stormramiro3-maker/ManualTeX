import { useState, useRef, useMemo } from "react";
import JSZip from "jszip";
import { extractPdfText } from "./lib/pdfExtractor";

const API_URL = import.meta.env.VITE_API_URL;

export default function App() {
  const [backendStatus] = useState("ok");

  const [zipName, setZipName] = useState("");
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [processedDocs, setProcessedDocs] = useState([]);
  const [processingLog, setProcessingLog] = useState([]);

  const [metadata, setMetadata] = useState({
    materia: "",
    unidad: "",
    catedra: "",
    tipo: ""
  });

  const [structureResult, setStructureResult] = useState(null);
  const [structureLoading, setStructureLoading] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");

  const zipRef = useRef(null);

  async function handleZipChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError("");
    setFiles([]);
    setProcessedDocs([]);
    setProcessingLog([]);
    setStructureResult(null);
    setFeedbackText("");
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
    setProcessedDocs([]);
    setProcessingLog([]);
    setStructureResult(null);
    setFeedbackText("");

    try {
      const pdfFiles = files.filter((f) => f.isPdf);
      const results = [];
      const logs = [];

      for (const file of pdfFiles) {
        logs.push(`Procesando: ${file.name}`);
        setProcessingLog([...logs]);

        try {
          const data = await extractPdfText(zipRef.current, file.path);
          const cleanText = (data.text || "").replace(/\s+\n/g, "\n").trim();

          results.push({
            name: file.name,
            path: file.path,
            pages: data.pages,
            chars: cleanText.length,
            text: cleanText,
            preview: cleanText.slice(0, 400),
            preliminary_category: "unknown"
          });

          logs.push(`OK: ${file.name} — ${data.pages} págs — ${cleanText.length} chars`);
          setProcessingLog([...logs]);
        } catch (err) {
          logs.push(`ERROR: ${file.name} — ${err.message}`);
          setProcessingLog([...logs]);
          throw err;
        }
      }

      setProcessedDocs(results);
    } catch (err) {
      console.error(err);
      setError(`Error procesando PDFs: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  function updateMetadata(field, value) {
    setMetadata((prev) => ({
      ...prev,
      [field]: value
    }));
  }

  function updateDocCategory(index, value) {
    setProcessedDocs((prev) =>
      prev.map((doc, i) =>
        i === index ? { ...doc, preliminary_category: value } : doc
      )
    );
  }

  const pdfFiles = files.filter((f) => f.isPdf);
  const otherFiles = files.filter((f) => !f.isPdf);

  const corpus = useMemo(() => {
    const pagesTotal = processedDocs.reduce((acc, doc) => acc + doc.pages, 0);
    const charsTotal = processedDocs.reduce((acc, doc) => acc + doc.chars, 0);

    return {
      metadata: { ...metadata },
      stats: {
        files_total: processedDocs.length,
        pages_total: pagesTotal,
        chars_total: charsTotal
      },
      documents: processedDocs
    };
  }, [metadata, processedDocs]);

  async function handleGenerateStructure() {
    setStructureLoading(true);
    setError("");
    setStructureResult(null);

    try {
      const res = await fetch(`${API_URL}/api/structure`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ corpus })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error generando estructura");
      }

      setStructureResult({
        version: data.structureVersion || 1,
        structure: data.structure,
        issues: data.issues,
        usage: data.usage
      });
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setStructureLoading(false);
    }
  }

  async function handleReviseStructure() {
    if (!structureResult || !feedbackText.trim()) return;

    setStructureLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/api/structure/revise`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          corpus,
          previousStructure: structureResult.structure,
          feedbackText
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error rehaciendo estructura");
      }

      setStructureResult((prev) => ({
        version: (prev?.version || 1) + 1,
        structure: data.structure,
        issues: data.issues,
        usage: data.usage
      }));
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setStructureLoading(false);
    }
  }

  return (
    <div style={container}>
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
          <h3>Resumen del ZIP</h3>
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
            <div key={i} style={{ marginBottom: 6 }}>{line}</div>
          ))}
        </div>
      )}

      {processedDocs.length > 0 && (
        <>
          <div style={card}>
            <h2>Metadata del corpus</h2>
            <div style={formGrid}>
              <label style={label}>
                Materia
                <input
                  style={input}
                  value={metadata.materia}
                  onChange={(e) => updateMetadata("materia", e.target.value)}
                />
              </label>

              <label style={label}>
                Unidad
                <input
                  style={input}
                  value={metadata.unidad}
                  onChange={(e) => updateMetadata("unidad", e.target.value)}
                />
              </label>

              <label style={label}>
                Cátedra
                <input
                  style={input}
                  value={metadata.catedra}
                  onChange={(e) => updateMetadata("catedra", e.target.value)}
                />
              </label>

              <label style={label}>
                Tipo
                <select
                  style={input}
                  value={metadata.tipo}
                  onChange={(e) => updateMetadata("tipo", e.target.value)}
                >
                  <option value="">Seleccionar</option>
                  <option value="exacta">Exacta</option>
                  <option value="humanistica">Humanística</option>
                  <option value="contable">Contable</option>
                  <option value="mixta">Mixta</option>
                </select>
              </label>
            </div>
          </div>

          <div style={card}>
            <h2>Corpus construido</h2>
            <p>Documentos: <strong>{corpus.stats.files_total}</strong></p>
            <p>Páginas totales: <strong>{corpus.stats.pages_total}</strong></p>
            <p>Caracteres totales: <strong>{corpus.stats.chars_total}</strong></p>
          </div>

          <div style={card}>
            <h2>Documentos procesados</h2>
            {processedDocs.map((doc, i) => (
              <div key={doc.path} style={docCard}>
                <div style={docHeader}>
                  <div>
                    <strong>{doc.name}</strong>
                    <div style={muted}>
                      {doc.pages} páginas — {doc.chars} caracteres
                    </div>
                  </div>

                  <div>
                    <label style={labelSmall}>
                      Categoría preliminar
                      <select
                        style={input}
                        value={doc.preliminary_category}
                        onChange={(e) => updateDocCategory(i, e.target.value)}
                      >
                        <option value="unknown">unknown</option>
                        <option value="teoria">teoría</option>
                        <option value="practica">práctica</option>
                        <option value="mixto">mixto</option>
                        <option value="descartable">descartable</option>
                      </select>
                    </label>
                  </div>
                </div>

                <details>
                  <summary style={{ cursor: "pointer", marginBottom: 8 }}>
                    Ver preview
                  </summary>
                  <div style={previewBox}>
                    {doc.preview || "(sin texto extraído)"}
                  </div>
                </details>
              </div>
            ))}
          </div>

          <div style={card}>
            <h2>Vista JSON resumida del corpus</h2>
            <pre style={jsonBox}>
              {JSON.stringify(
                {
                  metadata: corpus.metadata,
                  stats: corpus.stats,
                  documents: corpus.documents.map((d) => ({
                    name: d.name,
                    path: d.path,
                    pages: d.pages,
                    chars: d.chars,
                    preliminary_category: d.preliminary_category,
                    preview: d.preview
                  }))
                },
                null,
                2
              )}
            </pre>
          </div>

          <div style={card}>
            <h2>Estructura</h2>
            <button
              onClick={handleGenerateStructure}
              style={button}
              disabled={structureLoading}
            >
              {structureLoading ? "Generando..." : "Generar estructura"}
            </button>
          </div>
        </>
      )}

      {structureResult && (
        <>
          <div style={card}>
            <h2>Estructura propuesta — v{structureResult.version}</h2>
            <p><strong>Título:</strong> {structureResult.structure.title}</p>

            {structureResult.structure.chapters.map((chapter, index) => (
              <div key={index} style={docCard}>
                <h3>{index + 1}. {chapter.title}</h3>
                <p><strong>Propósito:</strong> {chapter.purpose}</p>

                <p><strong>Fuentes:</strong></p>
                <ul>
                  {chapter.source_documents.map((src, i) => (
                    <li key={i}>{src}</li>
                  ))}
                </ul>

                <p><strong>Secciones:</strong></p>
                <ul>
                  {chapter.sections.map((section, i) => (
                    <li key={i}>
                      <strong>{section.title}</strong>: {section.descriptor}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div style={card}>
            <h2>Issues detectados</h2>
            <div>
              <strong>Vacíos</strong>
              <ul>
                {(structureResult.issues?.vacios || []).map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
            <div>
              <strong>Contradicciones</strong>
              <ul>
                {(structureResult.issues?.contradicciones || []).map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
            <div>
              <strong>Observaciones</strong>
              <ul>
                {(structureResult.issues?.observaciones || []).map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          </div>

          <div style={card}>
            <h2>Feedback sobre estructura</h2>
            <textarea
              style={textarea}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Ej: Quiero 5 capítulos en vez de 3, separar teoría de práctica y dar más entidad a modelos TDI."
            />
            <div style={{ marginTop: 12 }}>
              <button
                onClick={handleReviseStructure}
                style={button}
                disabled={structureLoading || !feedbackText.trim()}
              >
                {structureLoading ? "Rehaciendo..." : "Rehacer con feedback"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function getExtension(filename) {
  const parts = filename.split(".");
  if (parts.length < 2) return "";
  return parts.pop().toLowerCase();
}

const container = {
  padding: 24,
  fontFamily: "Arial, sans-serif",
  maxWidth: 1100,
  margin: "0 auto"
};

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

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16
};

const label = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontWeight: 600
};

const labelSmall = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 14
};

const input = {
  padding: 8,
  borderRadius: 8,
  border: "1px solid #ccc"
};

const textarea = {
  width: "100%",
  minHeight: 120,
  padding: 12,
  borderRadius: 8,
  border: "1px solid #ccc",
  resize: "vertical"
};

const docCard = {
  border: "1px solid #eee",
  borderRadius: 10,
  padding: 12,
  marginBottom: 12
};

const docHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 10
};

const muted = {
  color: "#666",
  fontSize: 14,
  marginTop: 4
};

const previewBox = {
  background: "#fafafa",
  border: "1px solid #eee",
  borderRadius: 8,
  padding: 12,
  whiteSpace: "pre-wrap",
  lineHeight: 1.4
};

const jsonBox = {
  background: "#111",
  color: "#eee",
  padding: 16,
  borderRadius: 10,
  overflowX: "auto",
  fontSize: 13,
  lineHeight: 1.4
};
