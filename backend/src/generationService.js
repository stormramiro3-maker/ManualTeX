const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: parseInt(process.env.CLAUDE_TIMEOUT_MS || '300000', 10)
});

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = parseInt(process.env.CLAUDE_MAX_TOKENS || '4000', 10);

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

  const repairSystem = `Sos un reparador de JSON.
Tu única tarea es convertir una salida inválida a JSON válido.
Reglas:
- Respondé SOLO JSON válido
- No uses markdown
- No uses backticks
- No agregues explicación
- Conservá el contenido conceptual original`;

  const repairPrompt = `Convertí esta salida en JSON válido, sin cambiar su sentido:

${first.text}`;

  const repaired = await callClaudeText(repairSystem, repairPrompt, 2500);
  json = extractJson(repaired.text);

  if (!json) {
    throw new Error('Claude devolvió JSON inválido en generación de capítulo');
  }

  return {
    json,
    usage: {
      input_tokens: (first.usage.input_tokens || 0) + (repaired.usage.input_tokens || 0),
      output_tokens: (first.usage.output_tokens || 0) + (repaired.usage.output_tokens || 0)
    }
  };
}

function getDocsForChapter(corpus, chapter) {
  const names = new Set(chapter.source_documents || []);
  return corpus.documents.filter((doc) => names.has(doc.name));
}

function trimDocText(text = '', maxChars = 14000) {
  if (!text) return '';
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}

function buildEditorialSystemPrompt() {
  const distilledRules = `
Aplicá estas reglas editoriales de forma estricta:
- El manual NO es un resumen: reconstruye conocimiento.
- La prosa narrativa es el vehículo principal del manual.
- Cada sección debe explicar, conectar, cerrar y no solo enumerar.
- No abrir secciones con cajas ni con fórmulas aisladas.
- La sección debe tener introducción, desarrollo y cierre conceptual.
- No comprimir demasiado: mantener profundidad.
- Separar teoría y práctica si la estructura lo indica.
- No inventar temas fuera del corpus.
- Todo debe ser útil para estudio universitario real.
- El tono debe ser académico, claro y autosuficiente.
- Evitá listas salvo cuando sean indispensables.
- Priorizá párrafos sustanciales y conectados entre sí.
- Si el capítulo es práctico, integrar aplicación guiada, no simple enunciado.`;

  return `Sos un redactor académico experto en manuales de estudio universitarios.

Tu tarea es desarrollar capítulos de un manual con calidad editorial alta, siguiendo un protocolo académico estricto.

${distilledRules}

A continuación se adjunta el protocolo editorial base de referencia. Seguilo en espíritu y prioridad, pero respondé únicamente en el formato JSON solicitado.

=== PROTOCOLO BASE ===
${SKILL_TEXT || '(SKILL.md no disponible en runtime)'}

=== RESTRICCIONES TÉCNICAS DE ESTA FASE ===
- No generes LaTeX.
- Respondé SOLO JSON válido.
- No uses markdown.
- No uses backticks.
- No generes tablas ni cajas como salida estructural todavía.
- La profundidad debe quedar reflejada en la prosa.
- Cada sección debe contener entre 3 y 5 párrafos sustanciales cuando el tema lo permita.
- Cada capítulo debe incluir:
  1. intro
  2. desarrollo por secciones
  3. cierre conceptual`;
}

async function generateChapterContent(corpus, chapter, chapterIndex) {
  const sourceDocs = getDocsForChapter(corpus, chapter);

  const reducedDocs = sourceDocs.map((doc) => ({
    name: doc.name,
    pages: doc.pages,
    chars: doc.chars,
    preliminary_category: doc.preliminary_category,
    text: trimDocText(doc.text, 14000)
  }));

  const system = buildEditorialSystemPrompt();

  const prompt = `Desarrollá el capítulo ${chapterIndex + 1} del manual.

METADATA DEL MANUAL:
${JSON.stringify(corpus.metadata, null, 2)}

CAPÍTULO A DESARROLLAR:
${JSON.stringify(chapter, null, 2)}

FUENTES DISPONIBLES PARA ESTE CAPÍTULO:
${JSON.stringify(reducedDocs, null, 2)}

OBJETIVO EDITORIAL:
- Escribir un capítulo con densidad explicativa real.
- No resumir en exceso.
- Construir comprensión, no solo listar información.
- Mantener coherencia con una unidad universitaria.
- Si el capítulo es práctico, explicar el sentido de los ejercicios y desarrollar su lógica.

Respondé EXACTAMENTE con este esquema JSON:
{
  "title": "string",
  "intro": "string",
  "sections": [
    {
      "title": "string",
      "paragraphs": ["string", "string", "string"]
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

  return await callClaudeJson(system, prompt, 3600);
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

    generatedChapters.push({
      title: result.json.title,
      intro: result.json.intro,
      sections: result.json.sections || [],
      closing: result.json.closing || ''
    });

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
