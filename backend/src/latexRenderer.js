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

function renderManualToTex(corpus, structure, manualContent) {
  const title =
    structure.title ||
    `Manual de Estudio: ${corpus.metadata?.materia || 'Manual'}`;

  const parts = [];

  parts.push(`\\documentclass[12pt]{article}`);
  parts.push(`\\usepackage[utf8]{inputenc}`);
  parts.push(`\\usepackage[T1]{fontenc}`);
  parts.push(`\\usepackage[spanish]{babel}`);
  parts.push(`\\usepackage[a4paper,margin=2.5cm]{geometry}`);
  parts.push(`\\usepackage{parskip}`);
  parts.push(`\\usepackage{hyperref}`);
  parts.push(`\\title{${esc(title)}}`);
  parts.push(`\\author{ManualTeX}`);
  parts.push(`\\date{}`);
  parts.push(`\\begin{document}`);
  parts.push(`\\maketitle`);
  parts.push(`\\tableofcontents`);
  parts.push(`\\newpage`);

  for (const chapter of manualContent.chapters || []) {
    parts.push(`\\section{${esc(chapter.title)}}`);

    if (chapter.intro) {
      parts.push(esc(chapter.intro));
    }

    for (const section of chapter.sections || []) {
      parts.push(`\\subsection{${esc(section.title)}}`);

      for (const paragraph of section.paragraphs || []) {
        parts.push(esc(paragraph));
      }
    }

    if (chapter.closing) {
      parts.push(`\\paragraph{Cierre}`);
      parts.push(esc(chapter.closing));
    }
  }

  parts.push(`\\end{document}`);

  return parts.join('\n\n');
}

module.exports = {
  renderManualToTex
};
