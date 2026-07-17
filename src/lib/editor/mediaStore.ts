/**
 * IndexedDB-backed media store for the in-browser editor.
 * Stores imported media Blobs + metadata so the library survives a refresh.
 * Architecture inspired by OpenCut (MIT) — see LICENSE-OpenCut.
 */
import { openDB, type IDBPDatabase } from "idb";

export type MediaKind = "video" | "audio" | "image";

export interface StoredMedia {
  id: string;
  name: string;
  kind: MediaKind;
  mimeType: string;
  size: number;
  duration?: number; // seconds (video/audio)
  width?: number;
  height?: number;
  thumbnail?: Blob; // small jpeg/png preview (videos + images)
  blob: Blob;
  createdAt: number;
}

export interface MediaMeta extends Omit<StoredMedia, "blob"> {}

const DB_NAME = "dehub-editor";
const DB_VERSION = 1;
const STORE = "media";

let dbPromise: Promise<IDBPDatabase> | null = null;
function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function putMedia(item: StoredMedia): Promise<void> {
  const db = await getDB();
  await db.put(STORE, item);
}

export async function getAllMedia(): Promise<StoredMedia[]> {
  const db = await getDB();
  const items = (await db.getAll(STORE)) as StoredMedia[];
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getMedia(id: string): Promise<StoredMedia | undefined> {
  const db = await getDB();
  return (await db.get(STORE, id)) as StoredMedia | undefined;
}

export async function deleteMedia(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, id);
}

/** Detect media kind from a File. */
export function detectKind(file: File): MediaKind | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  return null;
}

/** Read duration of an audio/video file by loading metadata in a hidden element. */
export function probeDuration(file: File, kind: "video" | "audio"): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(kind);
    el.preload = "metadata";
    el.muted = true;
    const cleanup = () => {
      URL.revokeObjectURL(url);
      el.remove();
    };
    el.onloadedmetadata = () => {
      const d = el.duration;
      cleanup();
      resolve(Number.isFinite(d) ? d : 0);
    };
    el.onerror = () => {
      cleanup();
      reject(new Error("Failed to read media metadata"));
    };
    el.src = url;
  });
}

/** Read image dimensions. */
export function probeImage(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const out = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to read image"));
    };
    img.src = url;
  });
}

/** Capture a frame from a video file to a Blob thumbnail. */
export function captureVideoThumbnail(
  file: File,
  atSeconds = 0.1,
  maxWidth = 320,
): Promise<{ thumbnail: Blob; width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.remove();
    };

    video.onloadedmetadata = () => {
      const seekTo = Math.min(atSeconds, Math.max(0, (video.duration || 1) - 0.05));
      video.currentTime = seekTo;
    };
    video.onseeked = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        const scale = Math.min(1, maxWidth / Math.max(1, w));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No canvas context");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              cleanup();
              reject(new Error("Failed to encode thumbnail"));
              return;
            }
            const result = { thumbnail: blob, width: w, height: h, duration: video.duration || 0 };
            cleanup();
            resolve(result);
          },
          "image/jpeg",
          0.8,
        );
      } catch (e) {
        cleanup();
        reject(e instanceof Error ? e : new Error("Thumbnail capture failed"));
      }
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("Failed to load video"));
    };
    video.src = url;
  });
}

/** Capture an image thumbnail. */
export function captureImageThumbnail(
  file: File,
  maxWidth = 320,
): Promise<{ thumbnail: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const scale = Math.min(1, maxWidth / Math.max(1, w));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No canvas context");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (!blob) return reject(new Error("Failed to encode thumbnail"));
            resolve({ thumbnail: blob, width: w, height: h });
          },
          "image/jpeg",
          0.85,
        );
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e instanceof Error ? e : new Error("Thumbnail capture failed"));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}
