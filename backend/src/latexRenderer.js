function esc(text = '') {
  return String(text)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

function escOpt(text = '') {
  return esc(String(text)).replace(/\n+/g, ' ').trim();
}

function cleanTitle(text = '', max = 65) {
  const stripped = String(text)
    .replace(/^\d+(\.\d+)*\s*/g, '')
    .trim();
  return stripped.length <= max ? stripped : stripped.slice(0, max).trim();
}

function renderParagraphs(paragraphs = []) {
  return (paragraphs || [])
    .filter(Boolean)
    .map((p) => `${esc(p)}\n`)
    .join('\n');
}

function renderBlock(block) {
  if (!block || !block.type) return '';

  switch (block.type) {
    case 'paragraph':
      return `${esc(block.text || '')}\n`;

    case 'definicion': {
      const title = block.title?.trim()
        ? `[title={${escOpt(block.title)}}]`
        : '';
      return `\\begin{definicion}${title}\n${esc(block.text || '')}\n\\end{definicion}\n`;
    }

    case 'nota': {
      const title = block.title?.trim()
        ? `[title={${escOpt(block.title)}}]`
        : '';
      return `\\begin{nota}${title}\n${esc(block.text || '')}\n\\end{nota}\n`;
    }

    case 'importante': {
      const title = block.title?.trim()
        ? `[title={${escOpt(block.title)}}]`
        : '';
      return `\\begin{importante}${title}\n${esc(block.text || '')}\n\\end{importante}\n`;
    }

    case 'ejemplo': {
      const title = block.title?.trim()
        ? `[title={${escOpt(block.title)}}]`
        : '';
      return `\\begin{ejemplo}${title}\n${esc(block.text || '')}\n\\end{ejemplo}\n`;
    }

    case 'formula': {
      const title = block.title?.trim()
        ? `[title={${escOpt(block.title)}}]`
        : '';
      const intro = block.intro ? `${esc(block.intro)}\n\n` : '';
      const outro = block.outro ? `\n\n${esc(block.outro)}` : '';
      const latex = String(block.latex || '').trim() || 'x = y';
      return `\\begin{formula}${title}\n${intro}\\[\n${latex}\n\\]${outro}\n\\end{formula}\n`;
    }

    case 'derivacion': {
      const title = block.title?.trim()
        ? `[title={${escOpt(block.title)}}]`
        : '';
      const intro = block.intro ? `${esc(block.intro)}\n\n` : '';
      const steps = (block.steps || [])
        .filter(Boolean)
        .map((step) => esc(step))
        .join('\n\n');
      const outro = block.outro ? `\n\n${esc(block.outro)}` : '';
      return `\\begin{derivacion}${title}\n${intro}${steps}${outro}\n\\end{derivacion}\n`;
    }

    default:
      return '';
  }
}

function renderChapter(chapter) {
  let out = '';

  out += `\\unidad{${esc(cleanTitle(chapter.title, 45))}}\n\n`;

  out += renderParagraphs(chapter.intro_paragraphs);

  for (const section of chapter.sections || []) {
    out += `\\seccion{${esc(cleanTitle(section.title, 65))}}\n\n`;
    out += renderParagraphs(section.opening_paragraphs);

    for (const block of section.blocks || []) {
      out += renderBlock(block) + '\n';
    }

    out += renderParagraphs(section.closing_paragraphs);
  }

  out += renderParagraphs(chapter.chapter_closing_paragraphs);

  return out;
}

function renderGlossary(glossary = []) {
  let out = `\\glosario\n\n`;

  for (const item of glossary) {
    out += `\\glsentry{${esc(item.term)}}{${esc(item.definition)}}\n`;
  }

  return out;
}

function renderManualToTex({ corpus, approvedStructure, manualContent, template }) {
  const metadata = corpus.metadata || {};
  const titleMateria = metadata.materia || 'Materia';
  const titleUnidad =
    metadata.unidad || approvedStructure.title || 'Unidad';
  const catedra = metadata.catedra || 'Cátedra';

  const marker = '\\begin{document}';
  const idx = template.indexOf(marker);

  if (idx === -1) {
    throw new Error('template_v1.tex no contiene \\begin{document}');
  }

  const preamble = template.slice(0, idx + marker.length);

  let body = '\n\n';
  body += `\\manualtitle{${esc(titleMateria)}}{${esc(titleUnidad)}}{${esc(catedra)}}\n\n`;
  body += `\\tocpar\n\n`;

  for (const chapter of manualContent.chapters || []) {
    body += renderChapter(chapter);
    body += '\n';
  }

  body += renderGlossary(manualContent.glossary || []);
  body += '\n\\end{document}\n';

  return preamble + body;
}

module.exports = {
  renderManualToTex
};
