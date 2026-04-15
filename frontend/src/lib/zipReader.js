import JSZip from "jszip";

export async function readZipFile(file) {
  const zip = await JSZip.loadAsync(file);
  const entries = [];

  for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;

    entries.push({
      name: zipEntry.name.split("/").pop(),
      path: relativePath,
      extension: getExtension(zipEntry.name),
      isPdf: zipEntry.name.toLowerCase().endsWith(".pdf"),
      compressedSize: zipEntry._data?.compressedSize ?? null,
      uncompressedSize: zipEntry._data?.uncompressedSize ?? null
    });
  }

  return entries;
}

function getExtension(filename) {
  const parts = filename.split(".");
  if (parts.length < 2) return "";
  return parts.pop().toLowerCase();
}
