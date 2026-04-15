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

function renderManualToTex(corpus, structure, manualContent, template) {
  let tex = template;

  // === PORTADA ===
  tex = tex.replace(
    '\\manualtitle{Materia}{Unidad N: Título}{Cátedra}',
    `\\manualtitle{${esc(corpus.metadata.materia)}}{${esc(
      corpus.metadata.unidad
    )}}{${esc(corpus.metadata.catedra)}}`
  );

  let body = '';

  for (const chapter of manualContent.chapters) {
    body += `\\unidad{${esc(chapter.title)}}\n\n`;

    body += esc(chapter.intro) + '\n\n';

    for (const section of chapter.sections) {
      body += `\\seccion{${esc(section.title)}}\n\n`;

      for (const paragraph of section.paragraphs) {
        body += esc(paragraph) + '\n\n';
      }
    }

    if (chapter.closing) {
      body += `\\begin{nota}\n${esc(chapter.closing)}\n\\end{nota}\n\n`;
    }
  }

  // === GLOSARIO BÁSICO ===
  body += `\\glosario\n\n`;
  body += `\\glsentry{Manual}{Documento académico generado automáticamente.}\n`;

  tex = tex.replace('% CONTENIDO_AQUI', body);

  return tex;
}

module.exports = {
  renderManualToTex
};
