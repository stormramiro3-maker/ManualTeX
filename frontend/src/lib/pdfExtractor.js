import * as pdfjsLib from "pdfjs-dist";

// necesario para que funcione en browser
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

export async function extractPdfText(zip, filePath) {
  const fileData = await zip.file(filePath).async("arraybuffer");
  const pdf = await pdfjsLib.getDocument({ data: fileData }).promise;

  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    const pageText = content.items.map(item => item.str).join(" ");
    fullText += pageText + "\n";
  }

  return {
    text: fullText,
    pages: pdf.numPages,
    chars: fullText.length
  };
}
