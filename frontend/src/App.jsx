import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import * as pdfjsLib from "pdfjs-dist";
import TaskProgressOverlay from "./components/TaskProgressOverlay";
import useTaskProgress from "./hooks/useTaskProgress";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function App() {
  const [backendStatus, setBackendStatus] = useState("checking...");
  const [error, setError] = useState("");
  const [errorDetails, setErrorDetails] = useState(null);

  const [loading, setLoading] = useState(false);
  const [zipName, setZipName] = useState("");
  const [files, setFiles] = useState([]);
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

  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfBase64, setPdfBase64] = useState("");
  const [compileLog, setCompileLog] = useState("");

  const zipRef = useRef(null);
  const { progressProps, start, advanceTo, fail, finish, reset, close } = useTaskProgress();

  useEffect(() => {
    checkHealth();
  }, []);

  async function checkHealth() {
    try {
      const res = await fetch(`${API_URL}/api/health`);
      const data = await res.json();
      setBackendStatus(data.status || "unknown");
    } catch (err) {
      console.error(err);
      setBackendStatus("offline");
    }
  }

  async function extractPdfText(zip, relativePath) {
    const fileData = await zip.file(relativePath).async("uint8array");
    const pdf = await pdfjsLib.getDocument({ data: fileData }).promise;

    let fullText = "";

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const text = content.items.map((item) => item.str).join(" ");
      fullText += text + "\n\n";
    }

    return {
      pages: pdf.numPages,
      text: fullText
    };
  }

  async function handleZipChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError("");
    setErrorDetails(null);
    reset();

    setFiles([]);
    setProcessedDocs([]);
    setProcessingLog([]);
    setStructureResult(null);
    setFeedbackText("");
    setApprovalMessage("");
    setGeneratedTex("");
    setTexUsage(null);
    setPdfBase64("");
    setCompileLog("");

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

      setZipName(file.name);
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
    setErrorDetails(null);
    setProcessedDocs([]);
    setProcessingLog([]);
    setStructureResult(null);
    setFeedbackText("");
    setApprovalMessage("");
    setGeneratedTex("");
    setTexUsage(null);
    setPdfBase64("");
    setCompileLog("");

    start({
      profile: "processPdfs",
      title: "Procesando PDFs",
      detail: "Se está construyendo el corpus local a partir del ZIP"
    });

    try {
      const pdfFiles = files.filter((f) => f.isPdf);
      const results = [];
      const logs = [];

      advanceTo(10, "Abriendo archivos PDF");

      for (let index = 0; index < pdfFiles.length; index++) {
        const file = pdfFiles[index];
        const progress = 20 + Math.round((index / Math.max(pdfFiles.length, 1)) * 50);

        logs.push(`Procesando: ${file.name}`);
        setProcessingLog([...logs]);
        advanceTo(progress, `Extrayendo texto de ${index + 1} de ${pdfFiles.length}`);

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

      advanceTo(92, "Consolidando corpus");
      setProcessedDocs(results);
      finish("PDFs procesados");
    } catch (err) {
      console.error(err);
      setError(`Error procesando PDFs: ${err.message}`);
      fail(err.message);
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
    setErrorDetails(null);
    setStructureResult(null);
    setApprovalMessage("");
    setGeneratedTex("");
    setTexUsage(null);
    setPdfBase64("");
    setCompileLog("");

    start({
      profile: "structure",
      title: "Generando estructura",
      detail: "La IA está analizando el corpus y proponiendo la estructura del manual"
    });

    try {
      advanceTo(12, "Preparando corpus");

      const res = await fetch(`${API_URL}/api/structure`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ corpus })
      });

      advanceTo(86, "Procesando respuesta");

      const data = await res.json();

      if (!res.ok) {
        throw buildFrontendError(data, "Error generando estructura");
      }

      setStructureResult({
        version: data.structureVersion || 1,
        structure: data.structure,
        issues: data.issues,
        usage: data.usage
      });

      finish("Estructura lista");
    } catch (err) {
      console.error(err);
      setError(err.message);
      setErrorDetails(err.details || null);
      fail(buildReadableError(err));
    } finally {
      setStructureLoading(false);
    }
  }

  async function handleReviseStructure() {
    if (!structureResult || !feedbackText.trim()) return;

    setStructureLoading(true);
    setError("");
    setErrorDetails(null);
    setApprovalMessage("");
    setGeneratedTex("");
    setTexUsage(null);
    setPdfBase64("");
    setCompileLog("");

    start({
      profile: "revise",
      title: "Rehaciendo estructura",
      detail: "La IA está revisando la estructura con tu feedback"
    });

    try {
      advanceTo(12, "Preparando feedback");

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

      advanceTo(86, "Procesando respuesta");

      const data = await res.json();

      if (!res.ok) {
        throw buildFrontendError(data, "Error rehaciendo estructura");
      }

      setStructureResult((prev) => ({
        version: (prev?.version || 1) + 1,
        structure: data.structure,
        issues: data.issues,
        usage: data.usage
      }));

      setFeedbackText("");
      setApprovalMessage("Se generó una nueva versión de la estructura con tu feedback.");
      finish("Estructura revisada");
    } catch (err) {
      console.error(err);
      setError(err.message);
      setErrorDetails(err.details || null);
      fail(buildReadableError(err));
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
    setErrorDetails(null);
    setGeneratedTex("");
    setTexUsage(null);
    setPdfBase64("");
    setCompileLog("");

    start({
      profile: "generateTex",
      title: "Generando .tex",
      detail: "La IA está redactando el manual y el backend está armando el archivo LaTeX"
    });

    try {
      advanceTo(12, "Preparando datos");

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

      advanceTo(88, "Procesando respuesta del backend");

      const data = await res.json();

      if (!res.ok) {
        throw buildFrontendError(data, "Error generando .tex");
      }

      setGeneratedTex(data.tex || "");
      setTexUsage(data.usage || null);
      finish("Archivo .tex listo");
    } catch (err) {
      console.error(err);
      setError(err.message);
      setErrorDetails(err.details || null);
      fail(buildReadableError(err));
    } finally {
      setTexLoading(false);
    }
  }

  async function handleCompilePdf() {
    if (!generatedTex) return;

    setPdfLoading(true);
    setError("");
    setErrorDetails(null);
    setPdfBase64("");
    setCompileLog("");

    start({
      profile: "compilePdf",
      title: "Compilando PDF",
      detail: "El backend está ejecutando LaTeX y validando el PDF"
    });

    try {
      advanceTo(14, "Enviando .tex al compilador");

      const res = await fetch(`${API_URL}/api/compile-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ tex: generatedTex })
      });

      advanceTo(88, "Recibiendo resultado de compilación");

      const data = await res.json();

      if (!res.ok) {
        setCompileLog(data.compile_log || "");
        throw buildFrontendError(data, "Error compilando PDF");
      }

      setPdfBase64(data.pdf_base64 || "");
      setCompileLog(data.compile_log || "");
      finish("PDF listo");
    } catch (err) {
      console.error(err);
      setError(err.message);
      setErrorDetails(err.details || null);
      fail(buildReadableError(err));
    } finally {
      setPdfLoading(false);
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

  function downloadPdf() {
    if (!pdfBase64) return;

    const byteChars = atob(pdfBase64);
    const byteNumbers = new Array(byteChars.length);

    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "manualtex-output.pdf";
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
      <TaskProgressOverlay {...progressProps} onClose={close} />

      <h1>ManualTeX v1</h1>
      <p>Backend: <strong>{backendStatus}</strong></p>

      <div style={card}>
        <h2>Cargar ZIP</h2>
        <input type="file" accept=".zip" onChange={handleZipChange} />
        {zipName && <p><strong>ZIP:</strong> {zipName}</p>}
        {loading && <p>Leyendo...</p>}
        {error && <p style={{ color: "crimson", whiteSpace: "pre-wrap" }}>{error}</p>}
      </div>

      {errorDetails && (
        <div style={errorCard}>
          <h3 style={{ marginTop: 0 }}>Detalles del error</h3>
          <pre style={jsonBox}>{JSON.stringify(errorDetails, null, 2)}</pre>
        </div>
      )}

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
          <button onClick={processPdfs} style={button} disabled={loading}>
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
                  <summary style={{ cursor: "pointer", marginBottom: 8 }}>Ver preview</summary>
                  <div style={previewBox}>
                    {doc.preview || "(sin texto extraído)"}
                  </div>
                </details>
              </div>
            ))}
          </div>

          <div style={card}>
            <h2>Estructura</h2>
            <button onClick={handleGenerateStructure} style={button} disabled={structureLoading}>
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
                  {chapter.source_documents.map((src, i) => <li key={i}>{src}</li>)}
                </ul>

                <p><strong>Secciones:</strong></p>
                <ul>
                  {chapter.sections.map((section, i) => (
                    <li key={i}><strong>{section.title}</strong>: {section.descriptor}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div style={card}>
            <h2>Issues detectados</h2>

            <div style={{ marginBottom: 12 }}>
              <strong>Vacíos</strong>
              <ul>{(structureResult.issues?.vacios || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>

            <div style={{ marginBottom: 12 }}>
              <strong>Contradicciones</strong>
              <ul>{(structureResult.issues?.contradicciones || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>

            <div>
              <strong>Observaciones</strong>
              <ul>{(structureResult.issues?.observaciones || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          </div>

          <div style={feedbackCard}>
            <h2 style={{ marginTop: 0 }}>Revisión de estructura</h2>
            <p style={feedbackLead}>
              Indicá qué querés cambiar antes de aprobar. Si pedís rehacer, la IA genera una nueva versión.
              Si validás y registrás, el feedback queda guardado para mejorar iteraciones futuras.
            </p>

            <textarea
              style={feedbackTextarea}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Ej: Separar teoría y práctica con más claridad, o dar más entidad a cierto tema."
            />

            <div style={buttonRow}>
              <button
                onClick={handleReviseStructure}
                style={primaryButton}
                disabled={structureLoading || !feedbackText.trim()}
              >
                {structureLoading ? "Rehaciendo..." : "Rehacer estructura con feedback"}
              </button>

              <button onClick={handleApproveAndRegister} style={secondaryButton} disabled={structureLoading}>
                Validar estructura y registrar feedback
              </button>

              <button onClick={handleApproveWithoutFeedback} style={ghostButton} disabled={structureLoading}>
                Validar sin feedback
              </button>
            </div>

            {approvalMessage && <div style={successBox}>{approvalMessage}</div>}
          </div>

          <div style={card}>
            <h2>Generación de .tex</h2>
            <div style={buttonRow}>
              <button onClick={handleGenerateTex} style={primaryButton} disabled={texLoading}>
                {texLoading ? "Generando .tex..." : "Generar .tex"}
              </button>

              {generatedTex && (
                <button onClick={downloadTex} style={secondaryButton}>
                  Descargar .tex
                </button>
              )}

              {generatedTex && (
                <button onClick={handleCompilePdf} style={ghostButton} disabled={pdfLoading}>
                  {pdfLoading ? "Compilando PDF..." : "Compilar PDF"}
                </button>
              )}

              {pdfBase64 && (
                <button onClick={downloadPdf} style={secondaryButton}>
                  Descargar PDF
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

          {compileLog && (
            <div style={card}>
              <h2>Log de compilación</h2>
              <pre style={jsonBox}>{compileLog}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function buildFrontendError(data, fallbackMessage) {
  const message = data?.error || fallbackMessage || "Error inesperado";
  const err = new Error(message);
  err.details = data?.details || null;
  err.compile_log = data?.compile_log || "";

  if (err.compile_log && !err.details) {
    err.details = {
      stage: "backend_error_with_compile_log",
      compile_log_snippet: String(err.compile_log).slice(0, 3000)
    };
  }

  return err;
}

function buildReadableError(err) {
  const base = err?.message || "Ocurrió un error";
  const d = err?.details;

  if (!d) return base;

  const parts = [base];

  if (typeof d.chapter_index === "number") {
    parts.push(`Capítulo: ${d.chapter_index + 1}`);
  }

  if (d.chapter_title) {
    parts.push(`Título: ${d.chapter_title}`);
  }

  if (typeof d.section_index === "number") {
    parts.push(`Sección: ${d.section_index + 1}`);
  }

  if (d.section_title) {
    parts.push(`Título de sección: ${d.section_title}`);
  }

  if (d.stage) {
    parts.push(`Etapa: ${d.stage}`);
  }

  const firstStop = d.first_pass?.stop_reason || d.stop_reason_first;
  const repairStop = d.repair_pass?.stop_reason || d.stop_reason_repair;

  if (firstStop) {
    parts.push(`Stop reason inicial: ${firstStop}`);
  }

  if (repairStop) {
    parts.push(`Stop reason repair: ${repairStop}`);
  }

  const firstParseError =
    d.first_pass?.parse_error?.brace_slice_error ||
    d.first_pass?.parse_error?.full_text_error;

  if (firstParseError) {
    parts.push(`Parse inicial: ${firstParseError}`);
  }

  const repairParseError =
    d.repair_pass?.parse_error?.brace_slice_error ||
    d.repair_pass?.parse_error?.full_text_error;

  if (repairParseError) {
    parts.push(`Parse repair: ${repairParseError}`);
  }

  if (d.compile_log_snippet) {
    parts.push("Hay log de compilación disponible en detalles.");
  }

  return parts.join("\n");
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

const errorCard = {
  marginTop: 20,
  padding: 16,
  border: "1px solid #f3b0b0",
  borderRadius: 10,
  background: "#fff5f5"
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
  gap: 8,
  fontWeight: 600
};

const labelSmall = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13
};

const input = {
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ccc",
  fontSize: 14
};

const docCard = {
  padding: 14,
  border: "1px solid #e5e5e5",
  borderRadius: 10,
  marginTop: 12,
  background: "#fafafa"
};

const docHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap"
};

const muted = {
  color: "#666",
  fontSize: 14,
  marginTop: 4
};

const previewBox = {
  background: "#fff",
  border: "1px solid #e3e3e3",
  borderRadius: 8,
  padding: 12,
  whiteSpace: "pre-wrap",
  lineHeight: 1.45,
  color: "#333"
};

const jsonBox = {
  background: "#0f172a",
  color: "#e2e8f0",
  padding: 16,
  borderRadius: 10,
  overflowX: "auto",
  whiteSpace: "pre-wrap",
  lineHeight: 1.45,
  fontSize: 13
};
