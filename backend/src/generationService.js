const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: parseInt(process.env.CLAUDE_TIMEOUT_MS || '300000', 10)
});

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = parseInt(process.env.CLAUDE_MAX_TOKENS || '6000', 10);

const skillPath = path.join(__dirname, 'SKILL.md');
const SKILL_TEXT = fs.existsSync(skillPath)
  ? fs.readFileSync(skillPath, 'utf8')
  : '';

/* =========================
   JSON EXTRACTION ROBUSTA
========================= */
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

/* =========================
   CLAUDE TEXT CALL
========================= */
async function callClaudeText(system, prompt, maxTokens = MAX_TOKENS) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    temperature: 0,
    system,
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
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

/* =========================
   CLAUDE JSON + REPAIR
========================= */
async function callClaudeJson(system, prompt, maxTokens = MAX_TOKENS) {
  const first = await callClaudeText(system, prompt, maxTokens);
  let json = extractJson(first.text);

  if (json) {
    return { json, usage: first.usage };
  }

  // 🔴 REPAIR ESTRICTO
  const repairSystem = `
Sos un parser estricto de JSON.

Convertí el siguiente contenido a JSON válido respetando EXACTAMENTE este esquema:

{
  "title": "string",
  "intro": "string",
  "sections": [
    {
      "title": "string",
      "paragraphs": ["string"]
    }
  ],
  "closing": "string",
  "glossary_terms": [
    {
      "term": "string",
      "definition": "string"
    }
  ]
}

Reglas:
- NO inventar contenido
- SOLO reorganizar
- SI falta algo → usar string vacío o []
- NO explicar nada
- RESPONDER SOLO JSON
`;

  const repairPrompt = first.text;

  const repaired = await callClaudeText(repairSystem, repairPrompt, 3000);
  json = extractJson(repaired.text);

  if (!json) {
    throw new Error('Claude devolvió JSON inválido en generación del manual');
  }

  return {
    json,
    usage: {
      input_tokens:
        (first.usage.input_tokens || 0) +
        (repaired.usage.input_tokens || 0),
      output_tokens:
        (first.usage.output_tokens || 0) +
        (repaired.usage.output_tokens || 0)
    }
  };
}

/* =========================
   HELPERS
========================= */
function trimDocText(text = '', maxChars = 8000) {
  if (!text) return '';
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}

function getDocsForChapter(corpus, chapter) {
  const names = new Set(chapter.source_documents || []);
  return corpus.documents.filter((doc) => names.has(doc.name));
}

/* =========================
   SYSTEM PROMPT REDUCIDO
========================= */
function buildSystemPrompt() {
  return `Sos el motor editorial de ManualTeX.

Reglas:
- No resumís: reconstruís conocimiento
- Prosa académica obligatoria
- No inventar contenido fuera del corpus
- No generar LaTeX
- Priorizar JSON válido por sobre complejidad

PROTOCOLO:
${SKILL_TEXT.slice(0, 8000)}`;
}

/* =========================
   NORMALIZACIÓN
========================= */
function cleanTitle(text = '', fallback = 'Sin título') {
  const stripped = String(text)
    .replace(/^\d+(\.\d+)*\s*/g, '')
    .trim();
  return stripped || fallback;
}

function normalizeChapterJson(json, fallbackTitle) {
  return {
    title: cleanTitle(json.title, fallbackTitle),
    intro: String(json.intro || '').trim(),
    sections: Array.isArray(json.sections)
      ? json.sections.map((s, i) => ({
          title: cleanTitle(s.title, `Sección ${i + 1}`),
          paragraphs: Array.isArray(s.paragraphs)
            ? s.paragraphs.map((p) => String(p).trim()).filter(Boolean)
            : []
        }))
      : [],
    closing: String(json.closing || '').trim(),
    glossary_terms: Array.isArray(json.glossary_terms)
      ? json.glossary_terms
          .filter((x) => x?.term && x?.definition)
          .map((x) => ({
            term: String(x.term).trim(),
            definition: String(x.definition).trim()
          }))
      : []
  };
}

/* =========================
   GENERACIÓN DE CAPÍTULO
========================= */
async function generateChapterContent(corpus, chapter, idx) {
  const docs = getDocsForChapter(corpus, chapter);

  const reducedDocs = docs.map((d) => ({
    name: d.name,
    category: d.preliminary_category,
    text: trimDocText(d.text)
  }));

  const system = buildSystemPrompt();

  const prompt = `
Generá el capítulo ${idx + 1}.

ESTRUCTURA:
${JSON.stringify(chapter)}

FUENTES:
${JSON.stringify(reducedDocs)}

FORMATO OBLIGATORIO:

{
  "title": "string",
  "intro": "string",
  "sections": [
    {
      "title": "string",
      "paragraphs": ["string", "string"]
    }
  ],
  "closing": "string",
  "glossary_terms": [
    {
      "term": "string",
      "definition": "string"
    }
  ]
}

REGLAS:
- Cada párrafo es un string separado
- No usar saltos de línea dentro de strings
- No usar comillas internas
- JSON válido obligatorio
`;

  const result = await callClaudeJson(system, prompt, 5000);

  return {
    json: normalizeChapterJson(result.json, chapter.title),
    usage: result.usage
  };
}

/* =========================
   MANUAL COMPLETO
========================= */
function dedupeGlossary(allTerms) {
  const seen = new Map();

  for (const item of allTerms) {
    if (!item?.term || !item?.definition) continue;
    const key = item.term.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }

  return Array.from(seen.values());
}

async function generateManualContent(corpus, structure) {
  const chapters = structure.chapters || [];

  const generated = [];
  const glossary = [];

  let input = 0;
  let output = 0;

  for (let i = 0; i < chapters.length; i++) {
    const res = await generateChapterContent(corpus, chapters[i], i);

    generated.push(res.json);
    glossary.push(...res.json.glossary_terms);

    input += res.usage.input_tokens;
    output += res.usage.output_tokens;
  }

  return {
    chapters: generated,
    glossary: dedupeGlossary(glossary),
    usage: {
      input_tokens: input,
      output_tokens: output
    }
  };
}

module.exports = {
  generateManualContent
};
