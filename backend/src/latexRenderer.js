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

function cleanTitle(text = '', max = 65) {
  const stripped = String(text)
    .replace(/^\d+(\.\d+)*\s*/g, '')
    .trim();
  return stripped.length <= max ? stripped : stripped.slice(0, max).trim();
}

function renderParagraphBlock(paragraphs = []) {
  return paragraphs
    .map((p) => `${esc(p)}\n`)
    .join('\n');
}

function renderChapter(chapter) {
  let out = '';

  out += `\\unidad{${esc(cleanTitle(chapter.title, 45))}}\n\n`;

  if (chapter.intro) {
    out += `${esc(chapter.intro)}\n\n`;
  }

  for (const section of chapter.sections || []) {
    out += `\\seccion{${esc(cleanTitle(section.title, 65))}}\n\n`;
    out += renderParagraphBlock(section.paragraphs || []);
    out += '\n';
  }

  if (chapter.closing) {
    out += `\\begin{nota}[title={Cierre del capítulo}]\n`;
    out += `${esc(chapter.closing)}\n`;
    out += `\\end{nota}\n\n`;
  }

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
