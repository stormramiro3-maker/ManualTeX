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

class ManualGenerationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ManualGenerationError';
    this.details = details;
  }
}

function safeSnippet(text, max = 1200) {
  const raw = String(text || '').replace(/\u0000/g, '');
  return raw.length <= max ? raw : `${raw.slice(0, max)}…[truncated]`;
}

function analyzeJsonText(text) {
  const raw = String(text || '');
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  const hasBraces = firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace;

  return {
    length: raw.length,
    hasBraces,
    firstBrace,
    lastBrace,
    startsWithFence: raw.trimStart().startsWith('```'),
    startsWithBracket: raw.trimStart().startsWith('['),
    snippet: safeSnippet(raw, 1500)
  };
}

function tryParseJson(text) {
  const raw = String(text || '');

  try {
    return {
      ok: true,
      method: 'full_text',
      value: JSON.parse(raw)
    };
  } catch (err) {
    const fullTextError = err;
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = raw.slice(firstBrace, lastBrace + 1);
      try {
        return {
          ok: true,
          method: 'brace_slice',
          value: JSON.parse(candidate)
        };
      } catch (sliceErr) {
        return {
          ok: false,
          error: {
            stage: 'brace_slice',
            full_text_error: String(fullTextError.message || fullTextError),
            brace_slice_error: String(sliceErr.message || sliceErr),
            candidate_snippet: safeSnippet(candidate, 1500)
          }
        };
      }
    }

    return {
      ok: false,
      error: {
        stage: 'full_text_no_braces',
        full_text_error: String(fullTextError.message || fullTextError)
      }
    };
  }
}

function validateChapterJsonShape(obj) {
  const errors = [];

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return {
      ok: false,
      errors: ['La raíz no es un objeto JSON']
    };
  }

  if (typeof obj.title !== 'string') errors.push('Falta o no es string: title');
  if (typeof obj.intro !== 'string') errors.push('Falta o no es string: intro');
  if (typeof obj.closing !== 'string') errors.push('Falta o no es string: closing');

  if (!Array.isArray(obj.sections)) {
    errors.push('Falta o no es array: sections');
  } else {
    obj.sections.forEach((section, i) => {
      if (!section || typeof section !== 'object' || Array.isArray(section)) {
        errors.push(`sections[${i}] no es objeto`);
        return;
      }
      if (typeof section.title !== 'string') {
        errors.push(`sections[${i}].title falta o no es string`);
      }
      if (!Array.isArray(section.paragraphs)) {
        errors.push(`sections[${i}].paragraphs falta o no es array`);
      } else {
        section.paragraphs.forEach((p, j) => {
          if (typeof p !== 'string') {
            errors.push(`sections[${i}].paragraphs[${j}] no es string`);
          }
        });
      }
    });
  }

  if (!Array.isArray(obj.glossary_terms)) {
    errors.push('Falta o no es array: glossary_terms');
  } else {
    obj.glossary_terms.forEach((item, i) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        errors.push(`glossary_terms[${i}] no es objeto`);
        return;
      }
      if (typeof item.term !== 'string') {
        errors.push(`glossary_terms[${i}].term falta o no es string`);
      }
      if (typeof item.definition !== 'string') {
        errors.push(`glossary_terms[${i}].definition falta o no es string`);
      }
    });
  }

  return {
    ok: errors.length === 0,
    errors
  };
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
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  return {
    text,
    usage: {
      input_tokens: response.usage?.input_tokens || 0,
      output_tokens: response.usage?.output_tokens || 0
    },
    stop_reason: response.stop_reason || null,
    model: MODEL
  };
}

async function callClaudeJson(system, prompt, maxTokens = MAX_TOKENS, context = {}) {
  const first = await callClaudeText(system, prompt, maxTokens);
  const firstAnalysis = analyzeJsonText(first.text);
  const firstParse = tryParseJson(first.text);

  if (firstParse.ok) {
    const shape = validateChapterJsonShape(firstParse.value);
    if (shape.ok) {
      return {
        json: firstParse.value,
        usage: first.usage,
        debug: {
          parsed_on: 'first_pass',
          parse_method: firstParse.method,
          stop_reason: first.stop_reason
        }
      };
    }
  }

  const repairSystem = `
Sos un parser estricto de JSON.

Convertí el contenido recibido a JSON válido respetando EXACTAMENTE este esquema:

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
- SOLO reorganizar y sanear formato
- SI falta algo, usar string vacío o []
- RESPONDER SOLO JSON
- NO usar markdown
- NO usar backticks
`;

  const repairPrompt = `
Convertí este contenido a JSON válido.

Si hay texto fuera del JSON, descartalo.
Si el JSON está incompleto, completá SOLO con strings vacíos o arrays vacíos.

CONTENIDO:
${first.text}
`.trim();

  const repaired = await callClaudeText(repairSystem, repairPrompt, 3000);
  const repairedAnalysis = analyzeJsonText(repaired.text);
  const repairedParse = tryParseJson(repaired.text);

  if (repairedParse.ok) {
    const shape = validateChapterJsonShape(repairedParse.value);
    if (shape.ok) {
      return {
        json: repairedParse.value,
        usage: {
          input_tokens:
            (first.usage.input_tokens || 0) +
            (repaired.usage.input_tokens || 0),
          output_tokens:
            (first.usage.output_tokens || 0) +
            (repaired.usage.output_tokens || 0)
        },
        debug: {
          parsed_on: 'repair_pass',
          parse_method: repairedParse.method,
          stop_reason_first: first.stop_reason,
          stop_reason_repair: repaired.stop_reason
        }
      };
    }

    throw new ManualGenerationError(
      `Claude devolvió JSON parseable pero con esquema inválido en generación del manual`,
      {
        ...context,
        stage: 'schema_validation_after_repair',
        first_pass: {
          analysis: firstAnalysis,
          parse_error: firstParse.ok ? null : firstParse.error
        },
        repair_pass: {
          analysis: repairedAnalysis,
          parse_method: repairedParse.method,
          schema_errors: shape.errors,
          raw_snippet: safeSnippet(repaired.text, 2000)
        }
      }
    );
  }

  throw new ManualGenerationError(
    `Claude devolvió JSON inválido en generación del manual`,
    {
      ...context,
      stage: 'json_parse_failed_after_repair',
      first_pass: {
        analysis: firstAnalysis,
        parse_error: firstParse.ok ? null : firstParse.error,
        raw_snippet: safeSnippet(first.text, 2000),
        stop_reason: first.stop_reason
      },
      repair_pass: {
        analysis: repairedAnalysis,
        parse_error: repairedParse.ok ? null : repairedParse.error,
        raw_snippet: safeSnippet(repaired.text, 2000),
        stop_reason: repaired.stop_reason
      }
    }
  );
}

function trimDocText(text = '', maxChars = 6000) {
  if (!text) return '';
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}

function getDocsForChapter(corpus, chapter) {
  const names = new Set(chapter.source_documents || []);
  return corpus.documents.filter((doc) => names.has(doc.name));
}

function buildSystemPrompt() {
  return `Sos el motor editorial de ManualTeX.

Reglas críticas:
- No resumís: reconstruís conocimiento
- La prosa académica domina
- No inventar contenido fuera del corpus
- No generar LaTeX
- Priorizá JSON válido y esquema correcto

Protocolo editorial base:
${SKILL_TEXT.slice(0, 6000)}`;
}

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
    preliminary_category: doc.preliminary_category,
    pages: doc.pages,
    chars: doc.chars,
    text: trimDocText(doc.text, 6000)
  }));

  const system = buildSystemPrompt();

  const prompt = `
Desarrollá el capítulo ${chapterIndex + 1} de un manual universitario.

METADATA:
${JSON.stringify(corpus.metadata || {})}

ESTRUCTURA DEL CAPÍTULO:
${JSON.stringify(chapter || {})}

FUENTES DISPONIBLES:
${JSON.stringify(reducedDocs)}

Respondé SOLO con JSON válido bajo este esquema exacto:

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

Reglas:
- Cada párrafo debe ser un string distinto dentro de paragraphs
- No usar markdown
- No usar backticks
- No usar texto fuera del JSON
- No inventar contenido fuera de las fuentes
- Si un dato no aplica, usar string vacío o []
`.trim();

  const result = await callClaudeJson(system, prompt, 5000, {
    chapter_index: chapterIndex,
    chapter_title: chapter?.title || `Capítulo ${chapterIndex + 1}`,
    source_documents: (chapter?.source_documents || []).slice(0, 20),
    source_doc_count: reducedDocs.length,
    model: MODEL
  });

  return {
    json: normalizeChapterJson(
      result.json,
      chapter.title || `Capítulo ${chapterIndex + 1}`
    ),
    usage: result.usage,
    debug: result.debug
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
  const debugChapters = [];

  for (let i = 0; i < chapters.length; i++) {
    try {
      const result = await generateChapterContent(corpus, chapters[i], i);
      generatedChapters.push(result.json);

      if (Array.isArray(result.json.glossary_terms)) {
        glossaryTerms.push(...result.json.glossary_terms);
      }

      totalInput += result.usage.input_tokens;
      totalOutput += result.usage.output_tokens;

      debugChapters.push({
        chapter_index: i,
        chapter_title: chapters[i]?.title || `Capítulo ${i + 1}`,
        ok: true,
        debug: result.debug
      });
    } catch (err) {
      if (err instanceof ManualGenerationError) {
        err.details = {
          ...(err.details || {}),
          completed_chapters: generatedChapters.length,
          debug_chapters
        };
      }
      throw err;
    }
  }

  return {
    chapters: generatedChapters,
    glossary: dedupeGlossary(glossaryTerms),
    usage: {
      input_tokens: totalInput,
      output_tokens: totalOutput
    },
    debug: {
      chapters: debugChapters
    }
  };
}

module.exports = {
  generateManualContent,
  ManualGenerationError
};
