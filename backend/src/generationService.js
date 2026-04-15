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

function trimDocText(text = '', maxChars = 16000) {
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
- Cuando corresponda, incluir definiciones, fórmulas, ejemplos, derivaciones, notas e importantes, pero siempre subordinados a la prosa.
- No generes LaTeX.
- Respondé SOLO JSON válido.

=== PROTOCOLO EDITORIAL BASE ===
${SKILL_TEXT || '(SKILL.md no disponible)'}`;
}

function sanitizeSectionTitle(title = '') {
  return String(title)
    .replace(/^\d+(\.\d+)*\s*/g, '')
    .trim();
}

async function generateChapterContent(corpus, chapter, chapterIndex) {
  const sourceDocs = getDocsForChapter(corpus, chapter);

  const reducedDocs = sourceDocs.map((doc) => ({
    name: doc.name,
    pages: doc.pages,
    chars: doc.chars,
    preliminary_category: doc.preliminary_category,
    text: trimDocText(doc.text, 16000)
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
- Escribir un capítulo académicamente sólido y editorialmente rico.
- Respetar la estructura aprobada.
- Priorizar prosa narrativa profunda.
- Usar bloques editoriales cuando aporten valor pedagógico real.
- Mantener alcance estricto del corpus.

Respondé EXACTAMENTE con este esquema JSON:
{
  "title": "string",
  "intro_paragraphs": ["string", "string"],
  "sections": [
    {
      "title": "string",
      "opening_paragraphs": ["string", "string"],
      "blocks": [
        {
          "type": "paragraph",
          "text": "string"
        },
        {
          "type": "definicion",
          "title": "string",
          "text": "string"
        },
        {
          "type": "nota",
          "title": "string",
          "text": "string"
        },
        {
          "type": "importante",
          "title": "string",
          "text": "string"
        },
        {
          "type": "formula",
          "title": "string",
          "intro": "string",
          "latex": "string",
          "outro": "string"
        },
        {
          "type": "ejemplo",
          "title": "string",
          "text": "string"
        },
        {
          "type": "derivacion",
          "title": "string",
          "intro": "string",
          "steps": ["string", "string"],
          "outro": "string"
        }
      ],
      "closing_paragraphs": ["string", "string"]
    }
  ],
  "chapter_closing_paragraphs": ["string"],
  "glossary_terms": [
    {
      "term": "string",
      "definition": "string"
    }
  ]
}`;

  const result = await callClaudeJson(system, prompt, 5200);

  const chapterJson = result.json;

  return {
    json: {
      title: sanitizeSectionTitle(chapterJson.title || chapter.title || `Capítulo ${chapterIndex + 1}`),
      intro_paragraphs: Array.isArray(chapterJson.intro_paragraphs) ? chapterJson.intro_paragraphs : [],
      sections: Array.isArray(chapterJson.sections) ? chapterJson.sections.map((s) => ({
        title: sanitizeSectionTitle(s.title || ''),
        opening_paragraphs: Array.isArray(s.opening_paragraphs) ? s.opening_paragraphs : [],
        blocks: Array.isArray(s.blocks) ? s.blocks : [],
        closing_paragraphs: Array.isArray(s.closing_paragraphs) ? s.closing_paragraphs : []
      })) : [],
      chapter_closing_paragraphs: Array.isArray(chapterJson.chapter_closing_paragraphs)
        ? chapterJson.chapter_closing_paragraphs
        : [],
      glossary_terms: Array.isArray(chapterJson.glossary_terms) ? chapterJson.glossary_terms : []
    },
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
