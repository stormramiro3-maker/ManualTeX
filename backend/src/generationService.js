const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: parseInt(process.env.CLAUDE_TIMEOUT_MS || '300000', 10)
});

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = parseInt(process.env.CLAUDE_MAX_TOKENS || '7000', 10);

const skillPath = path.join(__dirname, 'SKILL.md');
const SKILL_TEXT = fs.existsSync(skillPath)
  ? fs.readFileSync(skillPath, 'utf8')
  : '';

function extractJson(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_) {}

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch (_) {}
  }

  return null;
}

async function callClaudeText(system, prompt, maxTokens = MAX_TOKENS) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    temperature: 0,
    system,
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  return {
    text,
    usage: {
      input_tokens: response.usage?.input_tokens || 0,
      output_tokens: response.usage?.output_tokens || 0
    }
  };
}

async function callClaudeJson(system, prompt, maxTokens = MAX_TOKENS) {
  const first = await callClaudeText(system, prompt, maxTokens);
  let json = extractJson(first.text);

  if (json) {
    return {
      json,
      usage: first.usage
    };
  }

  const repairSystem = `Sos un reparador estricto de JSON.
Convertí una salida inválida a JSON válido sin explicar nada.

Reglas:
- Respondé SOLO JSON válido
- No uses markdown
- No uses backticks
- No agregues texto fuera del JSON
- Conservá el contenido conceptual original`;

  const repairPrompt = `Convertí esto a JSON válido:

${first.text}`;

  const repaired = await callClaudeText(repairSystem, repairPrompt, 3000);
  json = extractJson(repaired.text);

  if (!json) {
    throw new Error('Claude devolvió JSON inválido en generación del manual');
  }

  return {
    json,
    usage: {
      input_tokens: (first.usage.input_tokens || 0) + (repaired.usage.input_tokens || 0),
      output_tokens: (first.usage.output_tokens || 0) + (repaired.usage.output_tokens || 0)
    }
  };
}

function trimDocText(text = '', maxChars = 18000) {
  if (!text) return '';
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}

function getDocsForChapter(corpus, chapter) {
  const names = new Set(chapter.source_documents || []);
  return corpus.documents.filter((doc) => names.has(doc.name));
}

function buildSystemPrompt() {
  return `Sos el motor editorial de ManualTeX.

Tu tarea es generar el contenido de un manual universitario siguiendo de manera estricta el protocolo editorial base.

REGLAS CRÍTICAS:
- El manual NO es un resumen. Reconstruye conocimiento.
- La prosa argumentativa es el vehículo principal.
- Cada sección debe tener introducción, desarrollo profundo e implicancias.
- No se permite listar contenido sin explicar.
- No inventes temas fuera del corpus.
- No cambies el alcance de la unidad.
- Si una fuente desarrolla un concepto en profundidad, el manual debe mantener o superar esa profundidad.
- Teoría y práctica deben integrarse según la estructura aprobada.
- No generes LaTeX.
- Respondé SOLO JSON válido.
- Priorizá robustez del formato JSON por encima de sofisticación estructural.
- Cada sección debe venir como texto corrido rico y bien desarrollado.

=== PROTOCOLO EDITORIAL BASE ===
${SKILL_TEXT || '(SKILL.md no disponible)'}`;
}

function cleanTitle(text = '', fallback = 'Sin título') {
  const stripped = String(text)
    .replace(/^\d+(\.\d+)*\s*/g, '')
    .trim();
  return stripped || fallback;
}

function normalizeChapterJson(chapterJson, fallbackTitle) {
  return {
    title: cleanTitle(chapterJson.title, fallbackTitle),
    intro: String(chapterJson.intro || '').trim(),
    sections: Array.isArray(chapterJson.sections)
      ? chapterJson.sections.map((section, idx) => ({
          title: cleanTitle(section.title, `Sección ${idx + 1}`),
          content: String(section.content || '').trim()
        }))
      : [],
    closing: String(chapterJson.closing || '').trim(),
    glossary_terms: Array.isArray(chapterJson.glossary_terms)
      ? chapterJson.glossary_terms
          .filter((x) => x && x.term && x.definition)
          .map((x) => ({
            term: String(x.term).trim(),
            definition: String(x.definition).trim()
          }))
      : []
  };
}

async function generateChapterContent(corpus, chapter, chapterIndex) {
  const sourceDocs = getDocsForChapter(corpus, chapter);

  const reducedDocs = sourceDocs.map((doc) => ({
    name: doc.name,
    pages: doc.pages,
    chars: doc.chars,
    preliminary_category: doc.preliminary_category,
    text: trimDocText(doc.text, 18000)
  }));

  const system = buildSystemPrompt();

  const prompt = `Desarrollá el capítulo ${chapterIndex + 1} de un manual universitario.

METADATA:
${JSON.stringify(corpus.metadata, null, 2)}

ESTRUCTURA DEL CAPÍTULO:
${JSON.stringify(chapter, null, 2)}

FUENTES DISPONIBLES PARA ESTE CAPÍTULO:
${JSON.stringify(reducedDocs, null, 2)}

OBJETIVO:
- Redactar un capítulo sólido, profundo, útil para estudiar.
- Mantener la densidad académica.
- Respetar el alcance del corpus.
- Desarrollar cada sección con prosa continua y buena conexión conceptual.
- Si el capítulo es práctico, explicar la lógica de los ejercicios y su sentido conceptual.

IMPORTANTE:
- No uses bloques complejos.
- No uses arrays innecesarios.
- Hacé el JSON robusto y simple.

Respondé EXACTAMENTE con este esquema JSON:
{
  "title": "string",
  "intro": "string",
  "sections": [
    {
      "title": "string",
      "content": "string"
    }
  ],
  "closing": "string",
  "glossary_terms": [
    {
      "term": "string",
      "definition": "string"
    }
  ]
}`;

  const result = await callClaudeJson(system, prompt, 5200);

  return {
    json: normalizeChapterJson(
      result.json,
      chapter.title || `Capítulo ${chapterIndex + 1}`
    ),
    usage: result.usage
  };
}

function dedupeGlossary(allTerms) {
  const seen = new Map();

  for (const item of allTerms) {
    if (!item || !item.term || !item.definition) continue;
    const key = item.term.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, {
        term: item.term.trim(),
        definition: item.definition.trim()
      });
    }
  }

  return Array.from(seen.values()).sort((a, b) =>
    a.term.localeCompare(b.term, 'es')
  );
}

async function generateManualContent(corpus, structure) {
  const chapters = structure.chapters || [];
  const generatedChapters = [];
  const glossaryTerms = [];
  let totalInput = 0;
  let totalOutput = 0;

  for (let i = 0; i < chapters.length; i++) {
    const result = await generateChapterContent(corpus, chapters[i], i);
    generatedChapters.push(result.json);

    if (Array.isArray(result.json.glossary_terms)) {
      glossaryTerms.push(...result.json.glossary_terms);
    }

    totalInput += result.usage.input_tokens;
    totalOutput += result.usage.output_tokens;
  }

  return {
    chapters: generatedChapters,
    glossary: dedupeGlossary(glossaryTerms),
    usage: {
      input_tokens: totalInput,
      output_tokens: totalOutput
    }
  };
}

module.exports = {
  generateManualContent
};
