import * as pdfjsLib from "pdfjs-dist";

// usar el worker de la misma versión instalada
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export async function extractPdfText(zip, filePath) {
  const entry = zip.file(filePath);

  if (!entry) {
    throw new Error(`No se encontró el archivo en el ZIP: ${filePath}`);
  }

  const fileData = await entry.async("uint8array");

  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({
      data: fileData,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true
    }).promise;
  } catch (err) {
    throw new Error(`No se pudo abrir el PDF "${filePath}": ${err.message}`);
  }

  let fullText = "";
  const pageSummaries = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      fullText += pageText + "\n";
      pageSummaries.push({
        page: i,
        chars: pageText.length
      });
    } catch (err) {
      console.warn(`Falló extracción en página ${i} de ${filePath}:`, err);
      pageSummaries.push({
        page: i,
        chars: 0,
        error: true
      });
    }
  }

  return {
    text: fullText.trim(),
    pages: pdf.numPages,
    chars: fullText.trim().length,
    pageSummaries
  };
}
