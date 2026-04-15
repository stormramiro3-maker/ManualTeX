const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: parseInt(process.env.CLAUDE_TIMEOUT_MS || '300000', 10)
});

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = 3500;

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

async function callClaudeJson(system, prompt, maxTokens = MAX_TOKENS) {
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

  const json = extractJson(text);

  if (!json) {
    throw new Error('Claude devolvió JSON inválido en generación de capítulo');
  }

  return {
    json,
    usage: {
      input_tokens: response.usage?.input_tokens || 0,
      output_tokens: response.usage?.output_tokens || 0
    }
  };
}

function getDocsForChapter(corpus, chapter) {
  const names = new Set(chapter.source_documents || []);
  return corpus.documents.filter((doc) => names.has(doc.name));
}

async function generateChapterContent(corpus, chapter, chapterIndex) {
  const sourceDocs = getDocsForChapter(corpus, chapter);

  const reducedDocs = sourceDocs.map((doc) => ({
    name: doc.name,
    pages: doc.pages,
    chars: doc.chars,
    preliminary_category: doc.preliminary_category,
    text: doc.text
  }));

  const system = `Sos un redactor académico experto. 
Tu tarea es desarrollar UN capítulo de un manual universitario.
Reglas:
- Respondé SOLO JSON válido.
- No uses markdown.
- No uses backticks.
- No inventes contenido fuera de las fuentes.
- Redactá claro, formal y explicativo.
- No resuelvas ejercicios paso a paso salvo que el capítulo sea práctico y haga falta una breve aplicación.`;

  const prompt = `Desarrollá el capítulo ${chapterIndex + 1} del manual.

METADATA:
${JSON.stringify(corpus.metadata, null, 2)}

CAPÍTULO A DESARROLLAR:
${JSON.stringify(chapter, null, 2)}

FUENTES DISPONIBLES PARA ESTE CAPÍTULO:
${JSON.stringify(reducedDocs, null, 2)}

Respondé EXACTAMENTE con este esquema:
{
  "title": string,
  "intro": string,
  "sections": [
    {
      "title": string,
      "paragraphs": [string, string, string]
    }
  ],
  "closing": string
}`;

  return await callClaudeJson(system, prompt, 3200);
}

async function generateManualContent(corpus, structure) {
  const chapters = structure.chapters || [];
  const generatedChapters = [];
  let totalInput = 0;
  let totalOutput = 0;

  for (let i = 0; i < chapters.length; i++) {
    const result = await generateChapterContent(corpus, chapters[i], i);
    generatedChapters.push(result.json);
    totalInput += result.usage.input_tokens;
    totalOutput += result.usage.output_tokens;
  }

  return {
    chapters: generatedChapters,
    usage: {
      input_tokens: totalInput,
      output_tokens: totalOutput
    }
  };
}

module.exports = {
  generateManualContent
};
