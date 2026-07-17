/**
 * Cloud persistence for editor media (imported clips + exported videos).
 * Assets live under `editor-assets/<wallet>/<asset-id>/original.<ext>` in
 * Supabase Storage, with a matching row in `public.editor_assets`.
 */
import { supabase } from "@/integrations/supabase/client";
import { withWalletHeader } from "@/lib/supabase-wallet-client";

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

/** Signed URL cache so we don't re-hit the API on every render. */
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function getSignedAssetUrl(path: string, ttlSeconds = 60 * 60 * 4): Promise<string> {
  const cached = signedUrlCache.get(path);
  const now = Date.now();
  if (cached && cached.expiresAt - 60_000 > now) return cached.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) throw error ?? new Error("signed url failed");
  signedUrlCache.set(path, { url: data.signedUrl, expiresAt: now + ttlSeconds * 1000 });
  return data.signedUrl;
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
  onProgress?: (fraction: number) => void;
}

export async function uploadEditorAsset(args: UploadArgs): Promise<CloudAsset> {
  const wallet = args.wallet.toLowerCase();
  const id = args.id ?? crypto.randomUUID();
  const ext = extForMime(args.mimeType, args.kind === "image" ? "jpg" : "bin");
  const storagePath = `${wallet}/${id}/original.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, args.blob, {
      contentType: args.mimeType,
      cacheControl: "31536000",
      upsert: true,
    });
  if (upErr) throw upErr;
  args.onProgress?.(0.85);

  let thumbnailPath: string | null = null;
  if (args.thumbnail && args.thumbnail.size > 0) {
    thumbnailPath = `${wallet}/${id}/thumb.jpg`;
    const { error: thErr } = await supabase.storage
      .from(BUCKET)
      .upload(thumbnailPath, args.thumbnail, {
        contentType: args.thumbnail.type || "image/jpeg",
        cacheControl: "31536000",
        upsert: true,
      });
    if (thErr) {
      console.warn("[editor] thumbnail upload failed", thErr);
      thumbnailPath = null;
    }
  }
  args.onProgress?.(0.95);

  const row = {
    id,
    wallet_address: wallet,
    name: args.name,
    kind: args.kind,
    mime_type: args.mimeType,
    size_bytes: args.blob.size + (args.thumbnail?.size ?? 0),
    storage_path: storagePath,
    thumbnail_path: thumbnailPath,
    duration_seconds: args.duration ?? null,
    width: args.width ?? null,
    height: args.height ?? null,
    preserved: !!args.preserved,
    posted_post_id: args.postedPostId ?? null,
    last_used_at: new Date().toISOString(),
  };

  const { data, error } = await withWalletHeader(
    supabase.from("editor_assets").insert(row).select("*").single(),
    wallet,
  );
  if (error) {
    // best-effort cleanup on DB failure
    await supabase.storage.from(BUCKET).remove([storagePath, thumbnailPath].filter(Boolean) as string[]);
    throw error;
  }
  args.onProgress?.(1);
  return data as CloudAsset;
}

export async function listEditorAssets(wallet: string): Promise<CloudAsset[]> {
  const { data, error } = await withWalletHeader(
    supabase
      .from("editor_assets")
      .select("*")
      .eq("wallet_address", wallet.toLowerCase())
      .order("created_at", { ascending: false }),
    wallet,
  );
  if (error) throw error;
  return (data ?? []) as CloudAsset[];
}

export async function deleteEditorAsset(wallet: string, asset: Pick<CloudAsset, "id" | "storage_path" | "thumbnail_path">): Promise<void> {
  const paths = [asset.storage_path, asset.thumbnail_path].filter(Boolean) as string[];
  if (paths.length) {
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths);
    if (rmErr) console.warn("[editor] storage remove failed", rmErr);
  }
  const { error } = await withWalletHeader(
    supabase.from("editor_assets").delete().eq("id", asset.id),
    wallet,
  );
  if (error) throw error;
}

/** Bump last_used_at so the 12-month unused clock resets. */
export async function touchEditorAsset(wallet: string, id: string): Promise<void> {
  try {
    await withWalletHeader(
      supabase.from("editor_assets").update({ last_used_at: new Date().toISOString() }).eq("id", id),
      wallet,
    );
  } catch (e) {
    console.warn("[editor] touch failed", e);
  }
}

/** Mark a set of source assets as preserved because they're in a posted video. */
export async function preserveEditorAssets(wallet: string, ids: string[], postedPostId: string): Promise<void> {
  if (!ids.length) return;
  try {
    await withWalletHeader(
      supabase
        .from("editor_assets")
        .update({ preserved: true, posted_post_id: postedPostId, last_used_at: new Date().toISOString() })
        .in("id", ids),
      wallet,
    );
  } catch (e) {
    console.warn("[editor] preserve failed", e);
  }
}

export async function getEditorStorageUsage(wallet: string): Promise<{ used_bytes: number; asset_count: number }> {
  const { data, error } = await withWalletHeader(
    supabase.rpc("get_editor_storage_usage", { _wallet: wallet.toLowerCase() }),
    wallet,
  );
  if (error) {
    console.warn("[editor] usage rpc failed", error);
    return { used_bytes: 0, asset_count: 0 };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    used_bytes: Number(row?.used_bytes ?? 0),
    asset_count: Number(row?.asset_count ?? 0),
  };
}
