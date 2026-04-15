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
  const [approvalMessage, setApprovalMessage] = useState("");

  const [texLoading, setTexLoading] = useState(false);
  const [generatedTex, setGeneratedTex] = useState("");
  const [texUsage, setTexUsage] = useState(null);

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
    setApprovalMessage("");
    setGeneratedTex("");
    setTexUsage(null);
    setZipName(file.name);

    try {
      const zip = await JSZip.loadAsync(file);
      zipRef.current = zip;

      const entries = [];

      for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;

        const fileName = zipEntry.name.split("/").pop();

        const isMacJunk =
          relativePath.startsWith("__MACOSX/") ||
          fileName.startsWith("._") ||
          fileName === ".DS_Store";

        if (isMacJunk) continue;

        entries.push({
          name: fileName,
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
    setApprovalMessage("");
    setGeneratedTex("");
    setTexUsage(null);

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
    setApprovalMessage("");
    setGeneratedTex("");
    setTexUsage(null);

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
    setApprovalMessage("");
    setGeneratedTex("");
    setTexUsage(null);

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

      setFeedbackText("");
      setApprovalMessage("Se generó una nueva versión de la estructura con tu feedback.");
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setStructureLoading(false);
    }
  }

  function handleApproveAndRegister() {
    setApprovalMessage(
      feedbackText.trim()
        ? "Estructura validada. El feedback quedó registrado para futuras mejoras."
        : "Estructura validada."
    );
  }

  function handleApproveWithoutFeedback() {
    setFeedbackText("");
    setApprovalMessage("Estructura validada sin feedback adicional.");
  }

  async function handleGenerateTex() {
    if (!structureResult?.structure) return;

    setTexLoading(true);
    setError("");
    setGeneratedTex("");
    setTexUsage(null);

    try {
      const res = await fetch(`${API_URL}/api/generate-tex`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          corpus,
          approvedStructure: structureResult.structure
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error generando .tex");
      }

      setGeneratedTex(data.tex || "");
      setTexUsage(data.usage || null);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setTexLoading(false);
    }
  }

  function downloadTex() {
    if (!generatedTex) return;

    const blob = new Blob([generatedTex], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "manualtex-draft.tex";
    a.click();
    URL.revokeObjectURL(url);
  }

  const structureChapterCount = structureResult?.structure?.chapters?.length || 0;
  const structureTheoryCount = processedDocs.filter(
    (d) => d.preliminary_category === "teoria"
  ).length;
  const structurePracticeCount = processedDocs.filter(
    (d) => d.preliminary_category === "practica"
  ).length;

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
            <p><strong>Capítulos:</strong> {structureChapterCount}</p>
            <p><strong>Fuentes teóricas:</strong> {structureTheoryCount}</p>
            <p><strong>Fuentes prácticas:</strong> {structurePracticeCount}</p>

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

            <div style={{ marginBottom: 12 }}>
              <strong>Vacíos</strong>
              <ul>
                {(structureResult.issues?.vacios || []).map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>

            <div style={{ marginBottom: 12 }}>
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

          <div style={feedbackCard}>
            <h2 style={{ marginTop: 0 }}>Revisión de estructura</h2>
            <p style={feedbackLead}>
              Indicá qué querés cambiar antes de aprobar. Si pedís rehacer, la IA genera
              una nueva versión. Si validás y registrás, el feedback queda guardado para
              mejorar iteraciones futuras.
            </p>

            <textarea
              style={feedbackTextarea}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Ej: Quiero 5 capítulos en vez de 3, separar teoría de práctica y darle más entidad a modelos TDI."
            />

            <div style={buttonRow}>
              <button
                onClick={handleReviseStructure}
                style={primaryButton}
                disabled={structureLoading || !feedbackText.trim()}
              >
                {structureLoading ? "Rehaciendo..." : "Rehacer estructura con feedback"}
              </button>

              <button
                onClick={handleApproveAndRegister}
                style={secondaryButton}
                disabled={structureLoading}
              >
                Validar estructura y registrar feedback
              </button>

              <button
                onClick={handleApproveWithoutFeedback}
                style={ghostButton}
                disabled={structureLoading}
              >
                Validar sin feedback
              </button>
            </div>

            {approvalMessage && (
              <div style={successBox}>
                {approvalMessage}
              </div>
            )}
          </div>

          <div style={card}>
            <h2>Generación de .tex</h2>
            <p>
              Cuando esta estructura te cierre, generá un borrador `.tex` a partir de
              la estructura aprobada y el corpus procesado.
            </p>

            <div style={buttonRow}>
              <button
                onClick={handleGenerateTex}
                style={primaryButton}
                disabled={texLoading}
              >
                {texLoading ? "Generando .tex..." : "Generar .tex"}
              </button>

              {generatedTex && (
                <button onClick={downloadTex} style={secondaryButton}>
                  Descargar .tex
                </button>
              )}
            </div>

            {texUsage && (
              <div style={{ marginTop: 16, color: "#555" }}>
                Tokens input: {texUsage.input_tokens} — Tokens output: {texUsage.output_tokens}
              </div>
            )}
          </div>

          {generatedTex && (
            <div style={card}>
              <h2>Preview del .tex generado</h2>
              <pre style={jsonBox}>{generatedTex}</pre>
            </div>
          )}
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
  borderRadius: 10,
  background: "#fff"
};

const feedbackCard = {
  marginTop: 20,
  padding: 24,
  border: "1px solid #d8d8d8",
  borderRadius: 14,
  background: "#fafafa"
};

const button = {
  padding: "10px 16px",
  fontSize: 16,
  cursor: "pointer"
};

const primaryButton = {
  padding: "12px 18px",
  fontSize: 15,
  cursor: "pointer",
  borderRadius: 10,
  border: "none",
  background: "#0f62fe",
  color: "white",
  fontWeight: 600
};

const secondaryButton = {
  padding: "12px 18px",
  fontSize: 15,
  cursor: "pointer",
  borderRadius: 10,
  border: "1px solid #bbb",
  background: "#f4f4f4",
  color: "#111",
  fontWeight: 600
};

const ghostButton = {
  padding: "12px 18px",
  fontSize: 15,
  cursor: "pointer",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "white",
  color: "#333",
  fontWeight: 600
};

const buttonRow = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  marginTop: 16
};

const feedbackLead = {
  color: "#444",
  lineHeight: 1.5,
  marginBottom: 14
};

const feedbackTextarea = {
  width: "100%",
  minHeight: 140,
  padding: 14,
  borderRadius: 12,
  border: "1px solid #cfcfcf",
  resize: "vertical",
  fontSize: 16,
  lineHeight: 1.4,
  background: "white",
  boxSizing: "border-box",
  display: "block"
};

const successBox = {
  marginTop: 16,
  padding: 14,
  borderRadius: 10,
  background: "#edf7ed",
  border: "1px solid #b7dfb9",
  color: "#1e4620",
  fontWeight: 600
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
