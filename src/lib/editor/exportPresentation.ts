import { pageExportFrames, type PageExportScope } from "./pageExports";
import { pageDetails } from "./pageDetails";
import { presentationDocumentEntries, presentationSlideSize, PRESENTATION_IMAGE_LIMIT, PRESENTATION_MIME, type PresentationSlide } from "./presentationDocument";
import { writeZipArchive, type ZipEntry } from "./zipArchive";
import type { DesignPdfLink } from "./designLinks";
import type { ProjectSnapshot } from "./types";

export async function exportPresentation(snapshot: ProjectSnapshot, time: number, scope: PageExportScope,
  capture: (time: number) => Promise<{ blob: Blob; links: DesignPdfLink[] }>, signal?: AbortSignal, progress?: (fraction: number) => void): Promise<Blob> {
  const frames = pageExportFrames(snapshot, time, scope, "jpg"), images: ZipEntry[] = [], slides: PresentationSlide[] = [];
  presentationSlideSize(snapshot.settings.width, snapshot.settings.height);
  let total = 0;
  const check = () => { if (signal?.aborted) { const error = new Error("Export cancelled"); error.name = "AbortError"; throw error; } };
  for (const [index, frame] of frames.entries()) {
    check(); progress?.(index / frames.length * 0.8);
    const { blob, links } = await capture(frame.time); check();
    if (!blob.size || blob.type !== "image/jpeg") throw new Error("Presentation page capture failed");
    total += blob.size; if (total > PRESENTATION_IMAGE_LIMIT) throw new Error("This presentation exceeds 256 MiB. Export fewer pages or choose a smaller resolution");
    const details = pageDetails(snapshot, frame.index);
    slides.push({ index: frame.index, title: details.title, notes: details.notes, hidden: details.presentationHidden, links });
    images.push({ name: `ppt/media/image${index + 1}.jpg`, size: blob.size, read: async (offset, length) => new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()) });
  }
  const entries = [...presentationDocumentEntries(snapshot.settings.width, snapshot.settings.height, snapshot.title, slides), ...images];
  const size = entries.reduce((sum, entry) => sum + entry.size, 0), parts: ArrayBuffer[] = [];
  let written = 0;
  await writeZipArchive(entries, bytes => { parts.push(bytes.slice().buffer as ArrayBuffer); written += bytes.length; progress?.(Math.min(0.99, 0.8 + written / Math.max(1, size) * 0.19)); }, signal);
  check(); progress?.(1); return new Blob(parts, { type: PRESENTATION_MIME });
}
