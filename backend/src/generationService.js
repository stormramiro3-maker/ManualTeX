const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

// x3 respecto del default anterior de 300000 ms
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: parseInt(process.env.CLAUDE_TIMEOUT_MS || '900000', 10)
});

// x10 respecto del default anterior de 4000 tokens
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = parseInt(process.env.CLAUDE_MAX_TOKENS || '40000', 10);

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

function validateObjectShape(obj, shapeName) {
  const errors = [];

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return {
      ok: false,
      errors: [`La raíz de ${shapeName} no es un objeto JSON`]
    };
  }

  if (shapeName === 'chapter_meta') {
    if (typeof obj.intro !== 'string') errors.push('Falta o no es string: intro');
    if (typeof obj.closing !== 'string') errors.push('Falta o no es string: closing');

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
  }

  if (shapeName === 'section_content') {
    if (typeof obj.title !== 'string') errors.push('Falta o no es string: title');

    if (!Array.isArray(obj.paragraphs)) {
      errors.push('Falta o no es array: paragraphs');
    } else {
      obj.paragraphs.forEach((p, i) => {
        if (typeof p !== 'string') {
          errors.push(`paragraphs[${i}] no es string`);
        }
      });
    }
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

async function callClaudeJson(system, prompt, schemaName, maxTokens = MAX_TOKENS, context = {}) {
  const first = await callClaudeText(system, prompt, maxTokens);
  const firstAnalysis = analyzeJsonText(first.text);
  const firstParse = tryParseJson(first.text);

  if (firstParse.ok) {
    const shape = validateObjectShape(firstParse.value, schemaName);
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

  const repairSchemaDescription =
    schemaName === 'chapter_meta'
      ? `{
  "intro": "string",
  "closing": "string",
  "glossary_terms": [
    {
      "term": "string",
      "definition": "string"
    }
  ]
}`
      : `{
  "title": "string",
  "paragraphs": ["string"]
}`;

  const repairSystem = `
Sos un parser estricto de JSON.

Convertí el contenido recibido a JSON válido respetando EXACTAMENTE este esquema:

${repairSchemaDescription}

Reglas:
- NO inventar contenido
- SOLO reorganizar y sanear formato
- SI falta algo, usar string vacío o []
- RESPONDER SOLO JSON
- NO usar markdown
- NO usar backticks
`.trim();

  const repaired = await callClaudeText(repairSystem, first.text, 4000);
  const repairedAnalysis = analyzeJsonText(repaired.text);
  const repairedParse = tryParseJson(repaired.text);

  if (repairedParse.ok) {
    const shape = validateObjectShape(repairedParse.value, schemaName);
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
      'Claude devolvió JSON parseable pero con esquema inválido en generación del manual',
      {
        ...context,
        schema_name: schemaName,
        stage: 'schema_validation_after_repair',
        first_pass: {
          analysis: firstAnalysis,
          parse_error: firstParse.ok ? null : firstParse.error,
          stop_reason: first.stop_reason
        },
        repair_pass: {
          analysis: repairedAnalysis,
          parse_method: repairedParse.method,
          schema_errors: shape.errors,
          raw_snippet: safeSnippet(repaired.text, 2000),
          stop_reason: repaired.stop_reason
        }
      }
    );
  }

  const tokenTruncationLikely =
    first.stop_reason === 'max_tokens' ||
    repaired.stop_reason === 'max_tokens';

  throw new ManualGenerationError(
    tokenTruncationLikely
      ? 'Claude truncó la salida por límite de tokens durante la generación del manual'
      : 'Claude devolvió JSON inválido en generación del manual',
    {
      ...context,
      schema_name: schemaName,
      stage: tokenTruncationLikely
        ? 'json_truncated_by_max_tokens'
        : 'json_parse_failed_after_repair',
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

function trimDocText(text = '', maxChars = 5000) {
  if (!text) return '';
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}

function cleanTitle(text = '', fallback = 'Sin título') {
  const stripped = String(text)
    .replace(/^\d+(\.\d+)*\s*/g, '')
    .trim();
  return stripped || fallback;
}

function getDocsForChapter(corpus, chapter) {
  const names = new Set(chapter.source_documents || []);
  return (corpus.documents || []).filter((doc) => names.has(doc.name));
}

function buildSystemPrompt() {
  return `Sos el motor editorial de ManualTeX.

Reglas críticas:
- No resumís: reconstruís conocimiento
- La prosa académica domina
- No inventar contenido fuera del corpus
- No generar LaTeX
- Priorizá JSON válido y esquema correcto
- No usar fences de markdown
- No abrir con \`\`\`json

Protocolo editorial base:
${SKILL_TEXT.slice(0, 5000)}`;
}

function buildReducedDocsForChapter(sourceDocs) {
  return sourceDocs.map((doc) => ({
    name: doc.name,
    preliminary_category: doc.preliminary_category,
    pages: doc.pages,
    chars: doc.chars,
    text: trimDocText(doc.text, 5000)
  }));
}

function normalizeGlossaryTerms(items) {
  return Array.isArray(items)
    ? items
        .filter((x) => x && x.term && x.definition)
        .map((x) => ({
          term: String(x.term).trim(),
          definition: String(x.definition).trim()
        }))
    : [];
}

function normalizeSectionJson(sectionJson, fallbackTitle) {
  return {
    title: cleanTitle(sectionJson.title, fallbackTitle),
    paragraphs: Array.isArray(sectionJson.paragraphs)
      ? sectionJson.paragraphs
          .map((p) => String(p || '').trim())
          .filter(Boolean)
      : []
  };
}

async function generateChapterMeta(corpus, chapter, chapterIndex, reducedDocs) {
  const system = buildSystemPrompt();

  const prompt = `
Desarrollá SOLO el marco general del capítulo ${chapterIndex + 1} de un manual universitario.

METADATA:
${JSON.stringify(corpus.metadata || {})}

CAPÍTULO:
${JSON.stringify({
  title: chapter.title,
  purpose: chapter.purpose || '',
  sections: (chapter.sections || []).map((s) => ({
    title: s.title,
    descriptor: s.descriptor || ''
  }))
})}

FUENTES DISPONIBLES:
${JSON.stringify(reducedDocs)}

Objetivo:
- Redactar una introducción rica y académica del capítulo
- Redactar un cierre sólido del capítulo
- Proponer términos de glosario útiles y pertinentes al capítulo
- No redactar todavía el contenido de las secciones

Respondé SOLO con JSON válido con este esquema exacto:

{
  "intro": "string",
  "closing": "string",
  "glossary_terms": [
    {
      "term": "string",
      "definition": "string"
    }
  ]
}

Reglas:
- No usar markdown
- No usar backticks
- No abrir con \`\`\`json
- No usar texto fuera del JSON
- No inventar contenido fuera de las fuentes
- Si un dato no aplica, usar string vacío o []
`.trim();

  const result = await callClaudeJson(system, prompt, 'chapter_meta', 6000, {
    chunk_type: 'chapter_meta',
    chapter_index: chapterIndex,
    chapter_title: chapter?.title || `Capítulo ${chapterIndex + 1}`,
    source_documents: (chapter?.source_documents || []).slice(0, 20),
    source_doc_count: reducedDocs.length,
    model: MODEL
  });

  return {
    json: {
      intro: String(result.json.intro || '').trim(),
      closing: String(result.json.closing || '').trim(),
      glossary_terms: normalizeGlossaryTerms(result.json.glossary_terms)
    },
    usage: result.usage,
    debug: result.debug
  };
}

async function generateSectionContent(corpus, chapter, section, chapterIndex, sectionIndex, reducedDocs) {
  const system = buildSystemPrompt();

  const prompt = `
Desarrollá SOLO una sección de un manual universitario.

METADATA:
${JSON.stringify(corpus.metadata || {})}

CAPÍTULO:
${JSON.stringify({
  title: chapter.title,
  purpose: chapter.purpose || ''
})}

SECCIÓN A DESARROLLAR:
${JSON.stringify({
  title: section.title,
  descriptor: section.descriptor || ''
})}

SECCIONES HERMANAS DEL MISMO CAPÍTULO:
${JSON.stringify((chapter.sections || []).map((s, i) => ({
  index: i,
  title: s.title,
  descriptor: s.descriptor || ''
})))}

FUENTES DISPONIBLES:
${JSON.stringify(reducedDocs)}

Objetivo:
- Redactar esta sección con prosa académica desarrollada
- Cada párrafo debe ser un string independiente
- Mantener profundidad, no hacer resumen pobre
- No redactar intro general del capítulo ni cierre general del capítulo
- No duplicar secciones hermanas, concentrarse en esta sección

Respondé SOLO con JSON válido con este esquema exacto:

{
  "title": "string",
  "paragraphs": ["string", "string"]
}

Reglas:
- No usar markdown
- No usar backticks
- No abrir con \`\`\`json
- No usar texto fuera del JSON
- No inventar contenido fuera de las fuentes
- Cada párrafo debe ser autosuficiente y bien redactado
- La cantidad de párrafos puede ser amplia si la sección lo necesita
`.trim();

  const result = await callClaudeJson(system, prompt, 'section_content', MAX_TOKENS, {
    chunk_type: 'section_content',
    chapter_index: chapterIndex,
    chapter_title: chapter?.title || `Capítulo ${chapterIndex + 1}`,
    section_index: sectionIndex,
    section_title: section?.title || `Sección ${sectionIndex + 1}`,
    source_documents: (chapter?.source_documents || []).slice(0, 20),
    source_doc_count: reducedDocs.length,
    model: MODEL
  });

  return {
    json: normalizeSectionJson(
      result.json,
      section.title || `Sección ${sectionIndex + 1}`
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

async function generateChapterContent(corpus, chapter, chapterIndex) {
  const sourceDocs = getDocsForChapter(corpus, chapter);
  const reducedDocs = buildReducedDocsForChapter(sourceDocs);

  const debugChunks = [];
  let totalInput = 0;
  let totalOutput = 0;

  const metaResult = await generateChapterMeta(
    corpus,
    chapter,
    chapterIndex,
    reducedDocs
  );

  totalInput += metaResult.usage.input_tokens || 0;
  totalOutput += metaResult.usage.output_tokens || 0;

  debugChunks.push({
    chunk_type: 'chapter_meta',
    ok: true,
    debug: metaResult.debug
  });

  const sections = [];

  for (let i = 0; i < (chapter.sections || []).length; i++) {
    const section = chapter.sections[i];

    try {
      const sectionResult = await generateSectionContent(
        corpus,
        chapter,
        section,
        chapterIndex,
        i,
        reducedDocs
      );

      sections.push(sectionResult.json);

      totalInput += sectionResult.usage.input_tokens || 0;
      totalOutput += sectionResult.usage.output_tokens || 0;

      debugChunks.push({
        chunk_type: 'section_content',
        section_index: i,
        section_title: section?.title || `Sección ${i + 1}`,
        ok: true,
        debug: sectionResult.debug
      });
    } catch (err) {
      if (err instanceof ManualGenerationError) {
        err.details = {
          ...(err.details || {}),
          chapter_index: chapterIndex,
          chapter_title: chapter?.title || `Capítulo ${chapterIndex + 1}`,
          section_index: i,
          section_title: section?.title || `Sección ${i + 1}`,
          completed_sections: sections.length,
          debug_chunks: debugChunks
        };
      }
      throw err;
    }
  }

  return {
    json: {
      title: cleanTitle(chapter.title, `Capítulo ${chapterIndex + 1}`),
      intro: metaResult.json.intro,
      sections,
      closing: metaResult.json.closing,
      glossary_terms: metaResult.json.glossary_terms
    },
    usage: {
      input_tokens: totalInput,
      output_tokens: totalOutput
    },
    debug: {
      chunks: debugChunks
    }
  };
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

      totalInput += result.usage.input_tokens || 0;
      totalOutput += result.usage.output_tokens || 0;

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
          debug_chapters: debugChapters
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
