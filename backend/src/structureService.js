const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: parseInt(process.env.CLAUDE_TIMEOUT_MS || '300000', 10)
});

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = parseInt(process.env.CLAUDE_MAX_TOKENS || '4000', 10);

function buildReducedCorpus(corpus) {
  return {
    metadata: corpus.metadata,
    stats: corpus.stats,
    documents: corpus.documents.map((doc) => ({
      name: doc.name,
      path: doc.path,
      pages: doc.pages,
      chars: doc.chars,
      preliminary_category: doc.preliminary_category,
      preview: doc.preview
    }))
  };
}

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

async function callClaudeForJson(system, prompt) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0,
    system,
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  const json = extractJson(text);

  if (!json) {
    throw new Error('Claude devolvió JSON inválido para estructura');
  }

  return {
    raw: text,
    json,
    usage: {
      input_tokens: response.usage?.input_tokens || 0,
      output_tokens: response.usage?.output_tokens || 0
    }
  };
}

async function generateStructure(corpus) {
  const reducedCorpus = buildReducedCorpus(corpus);

  const system = `Sos un asistente experto en organización académica.
Tu tarea es proponer una estructura de manual de estudio clara, suficiente y razonable.

Reglas:
- Respondé SOLO JSON válido.
- No uses markdown.
- No uses backticks.
- No inventes temas que no aparezcan en los previews.
- Priorizá estructura útil para estudiar.
- Separá teoría y práctica cuando corresponda.
- Si una estructura demasiado compacta perjudica la claridad, dividí más capítulos.`;

  const prompt = `A partir de este corpus reducido, proponé la estructura inicial de un manual.

CORPUS:
${JSON.stringify(reducedCorpus, null, 2)}

Respondé EXACTAMENTE con este esquema JSON:
{
  "version": 1,
  "issues": {
    "vacios": [string],
    "contradicciones": [string],
    "observaciones": [string]
  },
  "structure": {
    "title": string,
    "chapters": [
      {
        "title": string,
        "purpose": string,
        "source_documents": [string],
        "sections": [
          {
            "title": string,
            "descriptor": string
          }
        ]
      }
    ]
  }
}`;

  const result = await callClaudeForJson(system, prompt);

  return {
    structureVersion: 1,
    structure: result.json.structure,
    issues: result.json.issues,
    usage: result.usage
  };
}

async function reviseStructure(corpus, previousStructure, feedbackText) {
  const reducedCorpus = buildReducedCorpus(corpus);

  const system = `Sos un asistente experto en organización académica.
Tu tarea es rehacer una estructura de manual según feedback humano.

Reglas:
- Respondé SOLO JSON válido.
- No uses markdown.
- No uses backticks.
- Debés tomar el feedback humano en serio.
- No inventes temas que no aparezcan en el corpus.
- Si el usuario pide más granularidad, aumentá capítulos o secciones de forma razonable.`;

  const prompt = `Rehacé esta estructura usando el corpus y este feedback humano.

CORPUS:
${JSON.stringify(reducedCorpus, null, 2)}

ESTRUCTURA ANTERIOR:
${JSON.stringify(previousStructure, null, 2)}

FEEDBACK HUMANO:
${feedbackText}

Respondé EXACTAMENTE con este esquema JSON:
{
  "issues": {
    "vacios": [string],
    "contradicciones": [string],
    "observaciones": [string]
  },
  "structure": {
    "title": string,
    "chapters": [
      {
        "title": string,
        "purpose": string,
        "source_documents": [string],
        "sections": [
          {
            "title": string,
            "descriptor": string
          }
        ]
      }
    ]
  }
}`;

  const result = await callClaudeForJson(system, prompt);

  return {
    structure: result.json.structure,
    issues: result.json.issues,
    usage: result.usage
  };
}

module.exports = {
  generateStructure,
  reviseStructure
};
