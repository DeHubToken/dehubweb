/**
 * Shared file-import helper. Imports OS files into the media library,
 * persists to IndexedDB (fast local cache) AND uploads to Lovable Cloud
 * so the library survives across devices, subject to badge-tier quotas.
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
import { uploadEditorAsset } from "@/lib/editor/cloudMedia";
import { getQuotaForBadge, formatBytes } from "@/lib/editor/quota";
import { getEditorStorageUsage } from "@/lib/editor/cloudMedia";

const MAX_BYTES = 500 * 1024 * 1024;

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `m_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export interface ImportContext {
  /** Signed-in wallet address; if omitted, only IndexedDB is used (no cloud). */
  wallet?: string | null;
  /** Optional badge balance to enforce a quota before importing. */
  badgeBalance?: number | null;
  /** Optional username override for badge overrides. */
  username?: string | null;
}

/** Import a single file. Returns the media id when the import succeeded. */
export async function importOneFile(file: File, ctx: ImportContext = {}): Promise<string | null> {
  const kind = detectKind(file);
  if (!kind) { toast.error(`Unsupported file: ${file.name}`); return null; }
  if (file.size > MAX_BYTES) { toast.error(`${file.name} is too large (max 500 MB).`); return null; }

  // Cloud quota check (best-effort — fail open if the check itself errors)
  if (ctx.wallet) {
    try {
      const quota = getQuotaForBadge(ctx.badgeBalance ?? 0, ctx.username ?? null);
      const usage = await getEditorStorageUsage(ctx.wallet);
      if (usage.used_bytes + file.size > quota.bytes) {
        toast.error(
          `Storage full — ${formatBytes(usage.used_bytes)} / ${formatBytes(quota.bytes)} used on your ${quota.tierName} tier. Stake more DHB to unlock a bigger tier, or remove unused assets.`,
        );
        return null;
      }
    } catch (e) {
      console.warn("[editor] quota check failed, allowing import", e);
    }
  }

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

    // Fire-and-forget cloud upload so the library survives across devices.
    if (ctx.wallet) {
      void uploadEditorAsset({
        wallet: ctx.wallet,
        id,
        name: file.name,
        kind,
        blob: file,
        mimeType: file.type || "application/octet-stream",
        duration,
        width,
        height,
        thumbnail,
      })
        .then(() => {
          window.dispatchEvent(new CustomEvent("editor:storage-usage-changed"));
        })
        .catch((e) => {
          console.error("[editor] cloud upload failed", e);
          toast.error(`Cloud sync failed for ${file.name}. Kept locally on this device.`);
        });
    }
    return id;
  } catch (e) {
    console.error("[editor] import failed", file.name, e);
    toast.error(`Failed to import ${file.name}`);
    return null;
  }
}

/** Import many files. Returns the list of created media ids (in the same order). */
export async function importFiles(files: FileList | File[], ctx: ImportContext = {}): Promise<string[]> {
  const list = Array.from(files);
  const ids: string[] = [];
  for (const f of list) {
    const id = await importOneFile(f, ctx);
    if (id) ids.push(id);
  }
  return ids;
}
