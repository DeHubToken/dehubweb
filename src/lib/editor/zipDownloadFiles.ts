import { writeZipArchive } from "./zipArchive";

export async function zipDownloadFiles(files: { name: string; blob: Blob }[], signal?: AbortSignal): Promise<Blob> {
  const parts: BlobPart[] = [];
  await writeZipArchive(files.map(file => ({
    name: file.name, size: file.blob.size,
    read: async (offset: number, length: number) => new Uint8Array(await file.blob.slice(offset, offset + length).arrayBuffer()),
  })), bytes => { parts.push(bytes.buffer as ArrayBuffer); }, signal);
  return new Blob(parts, { type: "application/zip" });
}
