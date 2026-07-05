import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, Trash2, Film, Music, Image as ImageIcon, Plus, Type, HardDrive, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEditorStore, toMediaItem, type MediaItem } from "@/store/editorStore";
import {
  deleteMedia,
  getAllMedia,
  type MediaKind,
} from "@/lib/editor/mediaStore";
import { importFiles as importFilesShared } from "@/lib/editor/importFiles";
import { TEXT_DRAG_MIME, TEXT_PRESETS, type TextPreset } from "@/lib/editor/textPresets";
import { useEditorQuota } from "@/hooks/use-editor-quota";
import { formatBytes } from "@/lib/editor/quota";
import {
  deleteEditorAsset,
  getSignedAssetUrl,
  listEditorAssets,
  type CloudAsset,
} from "@/lib/editor/cloudMedia";
import { GeneratePanel } from "./GeneratePanel";

function formatDuration(s?: number | null) {
  if (!s || !Number.isFinite(s)) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function kindIcon(k: MediaItem["kind"]) {
  if (k === "video") return Film;
  if (k === "audio") return Music;
  return ImageIcon;
}

async function cloudAssetToMediaItem(a: CloudAsset): Promise<MediaItem | null> {
  try {
    const url = await getSignedAssetUrl(a.storage_path);
    const thumbnailUrl = a.thumbnail_path ? await getSignedAssetUrl(a.thumbnail_path) : undefined;
    return {
      id: a.id,
      name: a.name,
      kind: (a.kind === "export" ? "video" : a.kind) as MediaKind,
      mimeType: a.mime_type,
      size: Number(a.size_bytes) || 0,
      duration: a.duration_seconds ?? undefined,
      width: a.width ?? undefined,
      height: a.height ?? undefined,
      thumbnail: undefined,
      createdAt: new Date(a.created_at).getTime(),
      url,
      thumbnailUrl,
    };
  } catch (e) {
    console.warn("[editor] failed to hydrate cloud asset", a.id, e);
    return null;
  }
}

export function MediaPanel() {
  const media = useEditorStore((s) => s.media);
  const setMedia = useEditorStore((s) => s.setMedia);
  const removeMediaFromStore = useEditorStore((s) => s.removeMedia);
  const addMediaToStore = useEditorStore((s) => s.addMedia);
  const addClipFromMedia = useEditorStore((s) => s.addClipFromMedia);
  const addTextClip = useEditorStore((s) => s.addTextClip);
  const updateTextClip = useEditorStore((s) => s.updateTextClip);

  const quota = useEditorQuota();

  const insertTextPreset = useCallback((p: TextPreset) => {
    const id = addTextClip();
    updateTextClip(id, {
      text: p.text,
      fontSize: p.fontSize,
      fontWeight: p.fontWeight,
    });
  }, [addTextClip, updateTextClip]);

  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cloudAssets, setCloudAssets] = useState<Record<string, CloudAsset>>({});

  // Load: local IDB first (fast), then merge cloud (source of truth across devices).
  useEffect(() => {
    let revokeOnUnmount: MediaItem[] = [];
    (async () => {
      try {
        const rows = await getAllMedia();
        const items = rows.map(toMediaItem);
        revokeOnUnmount = items;
        setMedia(items);
      } catch (e) {
        console.error("[editor] failed to load local media", e);
      }
    })();
    return () => {
      for (const it of revokeOnUnmount) {
        try { URL.revokeObjectURL(it.url); } catch { /* noop */ }
        if (it.thumbnailUrl) try { URL.revokeObjectURL(it.thumbnailUrl); } catch { /* noop */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hydrate cloud-only items into the panel whenever the wallet changes.
  useEffect(() => {
    if (!quota.walletAddress) return;
    let cancelled = false;
    (async () => {
      try {
        const cloud = await listEditorAssets(quota.walletAddress!);
        if (cancelled) return;
        const byId: Record<string, CloudAsset> = {};
        for (const a of cloud) byId[a.id] = a;
        setCloudAssets(byId);
        const localIds = new Set(useEditorStore.getState().media.map((m) => m.id));
        const missing = cloud.filter((a) => !localIds.has(a.id));
        for (const a of missing) {
          const item = await cloudAssetToMediaItem(a);
          if (item && !cancelled) addMediaToStore(item);
        }
      } catch (e) {
        console.warn("[editor] cloud hydration failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [quota.walletAddress, addMediaToStore]);

  // Refetch usage on cross-tab / import events.
  useEffect(() => {
    const onChange = () => { void quota.refetchUsage(); };
    window.addEventListener("editor:storage-usage-changed", onChange);
    return () => window.removeEventListener("editor:storage-usage-changed", onChange);
  }, [quota]);

  const importFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    try {
      await importFilesShared(list, {
        wallet: quota.walletAddress,
        badgeBalance: undefined, // quota check inside importFiles uses its own lookup
        username: null,
      });
      await quota.refetchUsage();
    } finally {
      setBusy(false);
    }
  }, [quota]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer?.files?.length) void importFiles(e.dataTransfer.files);
    },
    [importFiles],
  );

  const handleRemove = useCallback(async (id: string) => {
    try {
      await deleteMedia(id).catch(() => { /* not in local IDB */ });
      const cloud = cloudAssets[id];
      if (cloud && quota.walletAddress) {
        await deleteEditorAsset(quota.walletAddress, cloud);
      }
      removeMediaFromStore(id);
      window.dispatchEvent(new CustomEvent("editor:storage-usage-changed"));
    } catch (e) {
      console.error(e);
      const { toast } = await import("sonner");
      toast.error("Failed to remove media");
    }
  }, [removeMediaFromStore, cloudAssets, quota.walletAddress]);

  const percentUsed = useMemo(() => {
    if (!quota.quota.bytes) return 0;
    return Math.min(100, Math.round((quota.usedBytes / quota.quota.bytes) * 100));
  }, [quota]);

  const preservedIds = useMemo(() => {
    const s = new Set<string>();
    for (const id of Object.keys(cloudAssets)) if (cloudAssets[id].preserved) s.add(id);
    return s;
  }, [cloudAssets]);

  return (
    <aside className="flex h-full w-full flex-col border-r border-white/10 bg-black/60 backdrop-blur-[24px]">
      <div className="flex items-center justify-between px-3 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-white/70">Media</h2>
        <Button size="sm" variant="ghost"
          className="h-7 rounded-md px-2 text-white/80 hover:bg-white/10 hover:text-white"
          onClick={() => inputRef.current?.click()} disabled={busy || quota.overQuota}>
          <Upload className="mr-1 h-3.5 w-3.5" /> Import
        </Button>
        <input ref={inputRef} type="file" accept="video/*,audio/*,image/*" multiple hidden
          onChange={(e) => { if (e.target.files) void importFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {/* Storage quota bar */}
      {quota.isAuthenticated ? (
        <div className="mx-3 mb-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <div className="flex items-center justify-between text-[10px] text-white/70">
            <span className="inline-flex items-center gap-1.5">
              <HardDrive className="h-3 w-3" />
              <span className="font-medium text-white/85">{quota.quota.tierName}</span>
              <span className="text-white/40">tier</span>
            </span>
            <span className="tabular-nums">
              {formatBytes(quota.usedBytes)} / {formatBytes(quota.quota.bytes)}
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                percentUsed > 90 ? "bg-white" : "bg-white/70",
              )}
              style={{ width: `${percentUsed}%` }}
            />
          </div>
          {quota.overQuota ? (
            <p className="mt-1 text-[10px] text-white/60">Storage full — stake more DHB for a bigger tier, or remove unused assets.</p>
          ) : (
            <p className="mt-1 text-[10px] text-white/40">Assets unused for 12 months auto-delete unless posted.</p>
          )}
        </div>
      ) : (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] text-white/60">
          <Lock className="h-3 w-3" />
          Sign in to store media in the cloud across devices.
        </div>
      )}

      <div className="mx-3 mb-2 rounded-xl border border-white/10 bg-white/[0.02] p-2">
        <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-white/50">
          <Type className="h-3 w-3" /> Text
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {TEXT_PRESETS.map((p) => (
            <div
              key={p.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "copy";
                e.dataTransfer.setData(TEXT_DRAG_MIME, JSON.stringify(p));
              }}
              onDoubleClick={() => insertTextPreset(p)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") insertTextPreset(p); }}
              className="group flex cursor-grab flex-col items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-white/80 transition hover:border-white/25 hover:bg-white/10 hover:text-white active:cursor-grabbing"
              title={`Drag onto the canvas or timeline — ${p.label}`}
            >
              <span
                className="leading-none"
                style={{ fontWeight: p.fontWeight, fontSize: p.previewSize }}
              >
                Aa
              </span>
              <span className="text-[9px] uppercase tracking-wide text-white/50 group-hover:text-white/70">
                {p.label}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-1.5 px-1 text-[9px] leading-tight text-white/40">
          Drag onto the canvas to place, or the timeline to schedule.
        </p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cn(
          "mx-3 mb-2 rounded-xl border border-dashed border-white/15 px-3 py-3 text-center text-xs text-white/60 transition",
          isDragging && "border-white/40 bg-white/5 text-white",
        )}
      >
        Drop files here to import
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {media.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-white/40">
            No media yet. Import to get started.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {media.map((m) => {
              const Icon = kindIcon(m.kind);
              const isPreserved = preservedIds.has(m.id);
              return (
                <li key={m.id}>
                  <div
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "copy";
                      const payload = JSON.stringify({ type: "dehub-media", mediaId: m.id });
                      e.dataTransfer.setData("application/x-dehub-media", payload);
                      e.dataTransfer.setData("text/plain", payload);
                    }}
                    onDoubleClick={() => addClipFromMedia(m.id)}
                    className="group flex cursor-grab items-center gap-2 rounded-lg border border-transparent p-1.5 transition hover:bg-white/5 active:cursor-grabbing"
                  >
                    <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md bg-white/5">
                      {m.thumbnailUrl ? (
                        <img src={m.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Icon className="h-4 w-4 text-white/60" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-white" title={m.name}>{m.name}</p>
                      <p className="text-[10px] uppercase tracking-wide text-white/40">
                        {m.kind} · {formatDuration(m.duration)}
                        {isPreserved && <span className="ml-1.5 rounded-sm bg-white/10 px-1 py-[1px] text-[8px] uppercase tracking-wide text-white/80">Preserved</span>}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Add ${m.name} to timeline`}
                      onClick={(e) => { e.stopPropagation(); addClipFromMedia(m.id); }}
                      className="rounded-md p-1 text-white/40 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${m.name}`}
                      onClick={(e) => { e.stopPropagation(); void handleRemove(m.id); }}
                      className="rounded-md p-1 text-white/40 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-white/10 px-3 py-2 text-[10px] text-white/40">
        Drag a clip onto the timeline, double-click, or hit <kbd className="rounded bg-white/10 px-1">+</kbd>.
      </div>
    </aside>
  );
}
