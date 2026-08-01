import { useCallback, useMemo, useRef, useState } from "react";
import { Upload, Trash2, Film, Music, Image as ImageIcon, Plus, HardDrive, Lock, ExternalLink, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEditorStore, type MediaItem } from "@/store/editorStore";
import { useEditorMediaStore } from "@/store/editorMediaStore";
import { deleteMedia } from "@/lib/editor/mediaStore";
import { importFiles as importFilesShared } from "@/lib/editor/importFiles";
import { useEditorQuota } from "@/hooks/use-editor-quota";
import { formatBytes } from "@/lib/editor/quota";
import { deleteEditorAsset } from "@/lib/editor/cloudMedia";

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

export function MediaPanel() {
  const media = useEditorStore((s) => s.media);
  const removeMediaFromStore = useEditorStore((s) => s.removeMedia);
  const addClipFromMedia = useEditorStore((s) => s.addClipFromMedia);

  const cloudAssets = useEditorMediaStore((s) => s.cloudAssets);
  const removeCloudAsset = useEditorMediaStore((s) => s.removeCloudAsset);
  const hydrated = useEditorMediaStore((s) => s.hydrated);

  const quota = useEditorQuota();

  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  // Hydration and object-URL lifetime belong to MediaLibraryLoader, which is
  // mounted for as long as the editor is. Doing it here meant switching away
  // from this tab revoked URLs the canvas and exporter were still using.

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
      removeCloudAsset(id);
      window.dispatchEvent(new CustomEvent("editor:storage-usage-changed"));
    } catch (e) {
      console.error(e);
      const { toast } = await import("sonner");
      toast.error("Failed to remove media");
    }
  }, [removeMediaFromStore, removeCloudAsset, cloudAssets, quota.walletAddress]);

  const percentUsed = useMemo(() => {
    if (!quota.quota.bytes) return 0;
    return Math.min(100, Math.round((quota.usedBytes / quota.quota.bytes) * 100));
  }, [quota]);

  const preservedIds = useMemo(() => {
    const s = new Set<string>();
    for (const id of Object.keys(cloudAssets)) if (cloudAssets[id].preserved) s.add(id);
    return s;
  }, [cloudAssets]);

  const requiredCredits = useMemo(() => {
    return Array.from(new Set(media.flatMap((item) =>
      item.provenance?.attributionRequired ? [item.provenance.attributionText] : [],
    )));
  }, [media]);

  const copyCredits = useCallback(async () => {
    if (!requiredCredits.length) return;
    try {
      await navigator.clipboard.writeText(requiredCredits.join("\n"));
      const { toast } = await import("sonner");
      toast.success("Asset credits copied.");
    } catch {
      const { toast } = await import("sonner");
      toast.error("Could not copy asset credits.");
    }
  }, [requiredCredits]);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between px-3 py-2.5">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Your files</h2>
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
          <p className="px-2 py-6 text-center text-xs text-white/50">
            {hydrated ? "No media yet. Import to get started." : "Loading your media…"}
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
                      {m.provenance ? (
                        <a
                          href={m.provenance.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          title={m.provenance.attributionText}
                          className="mt-0.5 inline-flex max-w-full items-center gap-0.5 text-[9px] text-white/35 hover:text-white hover:underline"
                        >
                          <span className="truncate">{m.provenance.source} / {m.provenance.license}</span>
                          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                        </a>
                      ) : null}
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

      <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2 text-[10px] text-white/40">
        <span className="min-w-0 flex-1">Drag, double-click, or hit <kbd className="rounded bg-white/10 px-1">+</kbd> to add.</span>
        {requiredCredits.length ? (
          <button
            type="button"
            onClick={() => void copyCredits()}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/15 bg-white/[0.06] px-2 py-1 text-[9px] font-medium text-white/65 transition hover:bg-white/12 hover:text-white"
          >
            <Copy className="h-3 w-3" /> Copy credits
          </button>
        ) : null}
      </div>
    </div>
  );
}
