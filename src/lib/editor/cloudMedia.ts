/**
 * Cloud persistence for editor media (imported clips + exported videos).
 * Assets live under `editor-assets/<wallet>/<asset-id>/original.<ext>` in
 * Supabase Storage, with a matching row in `public.editor_assets`.
 *
 * Every read and write goes through the `editor-assets` edge function, which
 * takes the wallet from the verified DeHub token. The table and bucket are not
 * reachable from the browser directly.
 */
import { supabase } from "@/integrations/supabase/client";
import { ensureFreshToken } from "@/lib/api/dehub/core";
import type { MediaProvenance } from "@/lib/editor/mediaStore";

const BUCKET = "editor-assets";

export type CloudAssetKind = "video" | "audio" | "image" | "export";

export interface CloudAsset {
  id: string;
  name: string;
  kind: CloudAssetKind;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  thumbnail_path: string | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  preserved: boolean;
  posted_post_id: string | null;
  provenance: MediaProvenance | null;
  last_used_at: string;
  created_at: string;
}

function extForMime(mime: string, fallback = "bin"): string {
  if (!mime) return fallback;
  const map: Record<string, string> = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
    "audio/webm": "weba",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return map[mime] ?? mime.split("/")[1] ?? fallback;
}

async function call<T = Record<string, unknown>>(wallet: string, body: Record<string, unknown>): Promise<T> {
  const token = await ensureFreshToken();
  const { data, error } = await supabase.functions.invoke("editor-assets", {
    body,
    headers: { "x-dehub-token": token, "x-wallet-address": wallet.toLowerCase() },
  });
  if (error || data?.error) throw new Error(data?.error || error?.message || "Editor storage request failed");
  return data as T;
}

/** Signed URL cache so we don't re-hit the API on every render. */
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function getSignedAssetUrl(wallet: string, path: string): Promise<string> {
  const cacheKey = `${wallet.toLowerCase()}:${path}`;
  const cached = signedUrlCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt - 60_000 > now) return cached.url;
  const { urls, ttl } = await call<{ urls: Record<string, string>; ttl: number }>(wallet, { action: "sign", paths: [path] });
  const url = urls?.[path];
  if (!url) throw new Error("signed url failed");
  signedUrlCache.set(cacheKey, { url, expiresAt: now + (ttl ?? 3600) * 1000 });
  return url;
}

export interface UploadArgs {
  wallet: string;
  id?: string;
  name: string;
  kind: CloudAssetKind;
  blob: Blob;
  mimeType: string;
  duration?: number;
  width?: number;
  height?: number;
  thumbnail?: Blob;
  preserved?: boolean;
  postedPostId?: string | null;
  provenance?: MediaProvenance;
  onProgress?: (fraction: number) => void;
}

type Slot = { path: string; token: string };

export async function uploadEditorAsset(args: UploadArgs): Promise<CloudAsset> {
  const wallet = args.wallet.toLowerCase();
  const id = args.id ?? crypto.randomUUID();
  const ext = extForMime(args.mimeType, args.kind === "image" ? "jpg" : "bin").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "bin";
  const hasThumb = !!args.thumbnail && args.thumbnail.size > 0;
  const slots = await call<{ original: Slot; thumb: Slot | null }>(wallet, { action: "prepare", id, ext, thumbnail: hasThumb });
  const bucket = supabase.storage.from(BUCKET);

  const { error: upErr } = await bucket.uploadToSignedUrl(slots.original.path, slots.original.token, args.blob, {
    contentType: args.mimeType,
    cacheControl: "31536000",
  });
  if (upErr) throw upErr;
  args.onProgress?.(0.85);

  let thumbnailPath: string | null = null;
  if (hasThumb && slots.thumb) {
    const { error: thErr } = await bucket.uploadToSignedUrl(slots.thumb.path, slots.thumb.token, args.thumbnail!, {
      contentType: args.thumbnail!.type || "image/jpeg",
      cacheControl: "31536000",
    });
    if (thErr) console.warn("[editor] thumbnail upload failed", thErr);
    else thumbnailPath = slots.thumb.path;
  }
  args.onProgress?.(0.95);

  const row = {
    id,
    name: args.name,
    kind: args.kind,
    mime_type: args.mimeType,
    size_bytes: args.blob.size + (args.thumbnail?.size ?? 0),
    storage_path: slots.original.path,
    thumbnail_path: thumbnailPath,
    duration_seconds: args.duration ?? null,
    width: args.width ?? null,
    height: args.height ?? null,
    preserved: !!args.preserved,
    posted_post_id: args.postedPostId ?? null,
    provenance: args.provenance ?? null,
  };

  try {
    const { asset } = await call<{ asset: CloudAsset }>(wallet, { action: "commit", row });
    args.onProgress?.(1);
    return asset;
  } catch (e) {
    // best-effort cleanup on DB failure
    await call(wallet, { action: "discard", paths: [slots.original.path, thumbnailPath].filter(Boolean) }).catch(() => {});
    throw e;
  }
}

export async function listEditorAssets(wallet: string): Promise<CloudAsset[]> {
  const { assets } = await call<{ assets: CloudAsset[] }>(wallet, { action: "list" });
  return assets ?? [];
}

export async function deleteEditorAsset(wallet: string, asset: Pick<CloudAsset, "id" | "storage_path" | "thumbnail_path">): Promise<void> {
  await call(wallet, { action: "remove", id: asset.id });
}

/** Bump last_used_at so the 12-month unused clock resets. */
export async function touchEditorAsset(wallet: string, id: string): Promise<void> {
  try {
    await call(wallet, { action: "touch", id });
  } catch (e) {
    console.warn("[editor] touch failed", e);
  }
}

/** Mark a set of source assets as preserved because they're in a posted video. */
export async function preserveEditorAssets(wallet: string, ids: string[], postedPostId: string): Promise<void> {
  if (!ids.length) return;
  try {
    await call(wallet, { action: "preserve", ids, postedPostId });
  } catch (e) {
    console.warn("[editor] preserve failed", e);
  }
}

export async function getEditorStorageUsage(wallet: string): Promise<{ used_bytes: number; asset_count: number }> {
  try {
    return await call<{ used_bytes: number; asset_count: number }>(wallet, { action: "usage" });
  } catch (error) {
    console.warn("[editor] usage request failed", error);
    return { used_bytes: 0, asset_count: 0 };
  }
}
