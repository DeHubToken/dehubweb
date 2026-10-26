/**
 * Shared file-import helper. Imports OS files into the media library,
 * persists to IndexedDB (fast local cache) AND uploads to cloud storage
 * so the library survives across devices, subject to badge-tier quotas.
 */
import { toast } from "sonner";
import i18n from "@/i18n";
import { translateCopy } from "@/i18n/copy";
import {
  captureImageThumbnail,
  captureVideoThumbnail,
  deleteMedia,
  detectKind,
  probeDuration,
  putMedia,
  type StoredMedia,
  type MediaProvenance,
} from "@/lib/editor/mediaStore";
import { toMediaItem, useEditorStore } from "@/store/editorStore";
import { uploadEditorAsset } from "@/lib/editor/cloudMedia";
import { getQuotaForBadge, formatBytes } from "@/lib/editor/quota";
import { getEditorStorageUsage } from "@/lib/editor/cloudMedia";
import { MAX_EDITOR_MEDIA_BYTES } from "./mediaLimits";

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `m_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export interface ImportContext {
  /** Measured recorder duration when a streamed container has no duration metadata. */
  duration?: number;
  /** Signed-in wallet address; if omitted, only IndexedDB is used (no cloud). */
  wallet?: string | null;
  /** Optional badge balance to enforce a quota before importing. */
  badgeBalance?: number | null;
  /** Optional username override for badge overrides. */
  username?: string | null;
  /** Optional source and licence details for stock-library imports. */
  provenance?: MediaProvenance;
  signal?: AbortSignal;
}

/** Import a single file. Returns the media id when the import succeeded. */
export async function importOneFile(file: File, ctx: ImportContext = {}): Promise<string | null> {
  if (ctx.signal?.aborted) return null;
  const kind = detectKind(file);
  if (!kind) { toast.error(translateCopy("copy.9344a49b2b83", { defaultValue: "Unsupported file: {{name}}", name: file.name })); return null; }
  if (file.size > MAX_EDITOR_MEDIA_BYTES) { toast.error(translateCopy("copy.d77ed09d4007", { defaultValue: "{{name}} is too large (max 500 MB).", name: file.name })); return null; }

  // Cloud quota check (best-effort — fail open if the check itself errors)
  if (ctx.wallet) {
    try {
      const quota = getQuotaForBadge(ctx.badgeBalance ?? 0, ctx.username ?? null);
      const usage = await getEditorStorageUsage(ctx.wallet);
      if (ctx.signal?.aborted) return null;
      if (usage.used_bytes + file.size > quota.bytes) {
        toast.error(
          i18n.t("editor.storageFullImport", {
            used: formatBytes(usage.used_bytes),
            total: formatBytes(quota.bytes),
            tier: quota.tierName,
          }),
        );
        return null;
      }
    } catch (e) {
      console.warn("[editor] quota check failed, allowing import", e);
    }
  }

  if (ctx.signal?.aborted) return null;
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

    if (ctx.signal?.aborted) return null;
    if (kind !== "image" && Number.isFinite(ctx.duration) && (ctx.duration ?? 0) > 0) duration = ctx.duration;
    const row: StoredMedia = {
      id, name: file.name, kind,
      mimeType: file.type || "application/octet-stream",
      size: file.size, duration, width, height, thumbnail,
      blob: file, createdAt: Date.now(),
      provenance: ctx.provenance,
    };
    await putMedia(row);
    if (ctx.signal?.aborted) { await deleteMedia(id); return null; }
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
        provenance: ctx.provenance,
      })
        .then(() => {
          window.dispatchEvent(new CustomEvent("editor:storage-usage-changed"));
        })
        .catch((e) => {
          console.error("[editor] cloud upload failed", e);
          toast.error(translateCopy("copy.f6b9549bd36a", { defaultValue: "Cloud sync failed for {{name}}. Kept locally on this device.", name: file.name }));
        });
    }
    return id;
  } catch (e) {
    if (ctx.signal?.aborted) return null;
    console.error("[editor] import failed", file.name, e);
    toast.error(translateCopy("copy.de36a8b9fcb2", { defaultValue: "Failed to import {{name}}", name: file.name }));
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
