/**
 * Shared file-import helper. Imports OS files into the media library,
 * persists to IndexedDB, and adds them to the Zustand store.
 */
import { toast } from "sonner";
import {
  captureImageThumbnail,
  captureVideoThumbnail,
  detectKind,
  probeDuration,
  putMedia,
  type StoredMedia,
} from "@/lib/editor/mediaStore";
import { toMediaItem, useEditorStore } from "@/store/editorStore";

const MAX_BYTES = 500 * 1024 * 1024;

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `m_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Import a single file. Returns the media id when the import succeeded. */
export async function importOneFile(file: File): Promise<string | null> {
  const kind = detectKind(file);
  if (!kind) { toast.error(`Unsupported file: ${file.name}`); return null; }
  if (file.size > MAX_BYTES) { toast.error(`${file.name} is too large (max 500 MB).`); return null; }
  try {
    const id = makeId();
    let duration: number | undefined;
    let width: number | undefined;
    let height: number | undefined;
    let thumbnail: Blob | undefined;

    if (kind === "video") {
      try {
        const r = await captureVideoThumbnail(file);
        thumbnail = r.thumbnail; width = r.width; height = r.height; duration = r.duration;
      } catch {
        duration = await probeDuration(file, "video").catch(() => 0);
      }
    } else if (kind === "audio") {
      duration = await probeDuration(file, "audio");
    } else {
      const r = await captureImageThumbnail(file);
      thumbnail = r.thumbnail; width = r.width; height = r.height;
    }

    const row: StoredMedia = {
      id, name: file.name, kind,
      mimeType: file.type || "application/octet-stream",
      size: file.size, duration, width, height, thumbnail,
      blob: file, createdAt: Date.now(),
    };
    await putMedia(row);
    useEditorStore.getState().addMedia(toMediaItem(row));
    return id;
  } catch (e) {
    console.error("[editor] import failed", file.name, e);
    toast.error(`Failed to import ${file.name}`);
    return null;
  }
}

/** Import many files. Returns the list of created media ids (in the same order). */
export async function importFiles(files: FileList | File[]): Promise<string[]> {
  const list = Array.from(files);
  const ids: string[] = [];
  for (const f of list) {
    const id = await importOneFile(f);
    if (id) ids.push(id);
  }
  return ids;
}
