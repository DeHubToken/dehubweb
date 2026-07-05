import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Trash2, Film, Music, Image as ImageIcon, Plus, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEditorStore, toMediaItem, type MediaItem } from "@/store/editorStore";
import {
  captureImageThumbnail,
  captureVideoThumbnail,
  detectKind,
  deleteMedia,
  getAllMedia,
  probeDuration,
  putMedia,
  type StoredMedia,
} from "@/lib/editor/mediaStore";
import { TEXT_DRAG_MIME, TEXT_PRESETS, type TextPreset } from "@/lib/editor/textPresets";

const MAX_BYTES = 500 * 1024 * 1024;

function formatDuration(s?: number) {
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
  const setMedia = useEditorStore((s) => s.setMedia);
  const addMedia = useEditorStore((s) => s.addMedia);
  const removeMediaFromStore = useEditorStore((s) => s.removeMedia);
  const addClipFromMedia = useEditorStore((s) => s.addClipFromMedia);
  const addTextClip = useEditorStore((s) => s.addTextClip);
  const updateTextClip = useEditorStore((s) => s.updateTextClip);

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

  useEffect(() => {
    let revokeOnUnmount: MediaItem[] = [];
    (async () => {
      try {
        const rows = await getAllMedia();
        const items = rows.map(toMediaItem);
        revokeOnUnmount = items;
        setMedia(items);
      } catch (e) {
        console.error("[editor] failed to load media", e);
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

  const importFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    try {
      for (const file of list) {
        const kind = detectKind(file);
        if (!kind) { toast.error(`Unsupported file: ${file.name}`); continue; }
        if (file.size > MAX_BYTES) { toast.error(`${file.name} is too large (max 500 MB).`); continue; }
        try {
          const id =
            (typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `m_${Date.now()}_${Math.random().toString(36).slice(2)}`);

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
          addMedia(toMediaItem(row));
        } catch (e) {
          console.error("[editor] import failed", file.name, e);
          toast.error(`Failed to import ${file.name}`);
        }
      }
    } finally {
      setBusy(false);
    }
  }, [addMedia]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer?.files?.length) void importFiles(e.dataTransfer.files);
    },
    [importFiles],
  );

  const handleRemove = useCallback(async (id: string) => {
    try { await deleteMedia(id); removeMediaFromStore(id); }
    catch (e) { console.error(e); toast.error("Failed to remove media"); }
  }, [removeMediaFromStore]);

  return (
    <aside className="flex h-full w-full flex-col border-r border-white/10 bg-black/60 backdrop-blur-[24px]">
      <div className="flex items-center justify-between px-3 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-white/70">Media</h2>
        <Button size="sm" variant="ghost"
          className="h-7 rounded-md px-2 text-white/80 hover:bg-white/10 hover:text-white"
          onClick={() => inputRef.current?.click()} disabled={busy}>
          <Upload className="mr-1 h-3.5 w-3.5" /> Import
        </Button>
        <input ref={inputRef} type="file" accept="video/*,audio/*,image/*" multiple hidden
          onChange={(e) => { if (e.target.files) void importFiles(e.target.files); e.target.value = ""; }} />
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
              return (
                <li key={m.id}>
                  <div
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "copy";
                      e.dataTransfer.setData(
                        "application/x-dehub-media",
                        JSON.stringify({ mediaId: m.id }),
                      );
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
