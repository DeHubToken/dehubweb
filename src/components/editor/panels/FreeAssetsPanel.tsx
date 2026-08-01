import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Clapperboard,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Loader2,
  Pause,
  Play,
  Plus,
  Search,
  Shapes,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editorStore";
import { useEditorQuota } from "@/hooks/use-editor-quota";
import { importOneFile } from "@/lib/editor/importFiles";
import {
  downloadFreeAsset,
  provenanceForAsset,
  searchFreeAssets,
  type FreeAsset,
  type FreeAssetKind,
  type FreeAssetOrientation,
} from "@/lib/editor/freeAssets";

const KINDS: Array<{ id: FreeAssetKind; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "photo", label: "Photos", icon: ImageIcon },
  { id: "video", label: "Videos", icon: Film },
  { id: "animation", label: "Motion", icon: Sparkles },
  { id: "graphic", label: "Graphics", icon: Shapes },
  { id: "gif", label: "GIFs", icon: Clapperboard },
  { id: "audio", label: "Audio", icon: AudioLines },
];

const SUGGESTIONS: Record<FreeAssetKind, string[]> = {
  photo: ["people", "travel", "food", "nature", "business", "texture"],
  video: ["aerial", "city", "ocean", "people", "technology", "light leaks"],
  animation: ["motion background", "particles", "abstract loop", "countdown", "space", "ink"],
  graphic: ["abstract", "botanical", "retro", "paper texture", "pattern", "science"],
  gif: ["funny", "loading", "celebration", "cute animal", "animated icon", "sparkle"],
  audio: ["whoosh", "impact", "applause", "ambient", "notification", "cinematic"],
};

const ORIENTATIONS: Array<{ id: FreeAssetOrientation; label: string }> = [
  { id: "all", label: "Any" },
  { id: "landscape", label: "Wide" },
  { id: "portrait", label: "Vertical" },
  { id: "square", label: "Square" },
];

function formatDuration(value?: number) {
  if (!value || !Number.isFinite(value)) return "";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function VisualAssetCard({ asset, adding, onAdd }: { asset: FreeAsset; adding: boolean; onAdd: () => void }) {
  return (
    <article className="group min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.035] transition hover:border-white/25 hover:bg-white/[0.07]">
      <div className="relative aspect-[4/3] overflow-hidden bg-white/[0.04]">
        {asset.thumbnailUrl ? (
          <img
            src={asset.thumbnailUrl}
            alt={asset.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.025] motion-reduce:transform-none"
          />
        ) : (
          <div className="flex h-full items-center justify-center"><ImageIcon className="h-5 w-5 text-white/25" /></div>
        )}
        {asset.duration ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-white">
            {formatDuration(asset.duration)}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onAdd}
          disabled={adding}
          aria-label={`Add ${asset.title} to the timeline`}
          className="absolute bottom-1.5 left-1.5 flex h-7 items-center gap-1 rounded-lg border border-white/25 bg-black/75 px-2 text-[10px] font-semibold text-white backdrop-blur transition hover:bg-white hover:text-black active:scale-[0.98] disabled:opacity-70"
        >
          {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          {adding ? "Adding" : "Add"}
        </button>
      </div>
      <AssetDetails asset={asset} />
    </article>
  );
}

function AssetDetails({ asset }: { asset: FreeAsset }) {
  return (
    <div className="min-w-0 px-2 py-2">
      <p className="truncate text-[11px] font-medium text-white/90" title={asset.title}>{asset.title}</p>
      <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[9px] text-white/45">
        <span className="truncate" title={asset.creator}>{asset.creator}</span>
        <span aria-hidden="true">/</span>
        <a
          href={asset.landingUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-0.5 text-white/65 hover:text-white hover:underline"
          title={`Open on ${asset.source}`}
        >
          {asset.source}<ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
      <p className="mt-1 truncate text-[9px] text-white/35" title={asset.license}>{asset.license}</p>
    </div>
  );
}

function AudioAssetCard({
  asset,
  adding,
  playing,
  onToggle,
  onAdd,
}: {
  asset: FreeAsset;
  adding: boolean;
  playing: boolean;
  onToggle: () => void;
  onAdd: () => void;
}) {
  return (
    <article className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] p-2 transition hover:border-white/25 hover:bg-white/[0.07]">
      <button
        type="button"
        onClick={onToggle}
        aria-label={`${playing ? "Pause" : "Preview"} ${asset.title}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white hover:text-black active:scale-[0.98]"
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-white/90" title={asset.title}>{asset.title}</p>
        <p className="truncate text-[9px] text-white/45">{asset.creator} {asset.duration ? ` / ${formatDuration(asset.duration)}` : ""}</p>
        <a href={asset.landingUrl} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] text-white/40 hover:text-white hover:underline">
          {asset.source} / {asset.license}<ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
      <button
        type="button"
        onClick={onAdd}
        disabled={adding}
        aria-label={`Add ${asset.title} to the timeline`}
        className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-2 text-[10px] font-semibold text-white transition hover:bg-white hover:text-black active:scale-[0.98] disabled:opacity-70"
      >
        {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        Add
      </button>
    </article>
  );
}

function ResultsSkeleton({ audio }: { audio: boolean }) {
  return (
    <div className={audio ? "space-y-2" : "grid grid-cols-2 gap-2"} aria-label="Loading free assets">
      {Array.from({ length: audio ? 6 : 8 }, (_, index) => (
        <div key={index} className={cn("animate-pulse rounded-xl border border-white/5 bg-white/[0.05]", audio ? "h-[58px]" : "aspect-[4/3]")} />
      ))}
    </div>
  );
}

export function FreeAssetsPanel() {
  const [kind, setKind] = useState<FreeAssetKind>("photo");
  const [query, setQuery] = useState("");
  const [settledQuery, setSettledQuery] = useState("");
  const [orientation, setOrientation] = useState<FreeAssetOrientation>("all");
  const [items, setItems] = useState<FreeAsset[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [providers, setProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const quota = useEditorQuota();
  const addClipFromMedia = useEditorStore((state) => state.addClipFromMedia);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettledQuery(query.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setOrientation("all");
    setPlayingId(null);
    audioRef.current?.pause();
  }, [kind]);

  const load = useCallback(async (nextPage: number, append: boolean, signal?: AbortSignal) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await searchFreeAssets({ kind, query: settledQuery, page: nextPage, orientation, signal });
      setItems((current) => append ? [...current, ...result.items.filter((asset) => !current.some((item) => item.id === asset.id))] : result.items);
      setPage(nextPage);
      setHasMore(result.hasMore);
      setProviders(result.providers);
    } catch (cause) {
      if (signal?.aborted) return;
      console.error("[editor] free asset search failed", cause);
      setError("The free library could not load. Check your connection and try again.");
      if (!append) setItems([]);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [kind, settledQuery, orientation]);

  useEffect(() => {
    const controller = new AbortController();
    void load(1, false, controller.signal);
    return () => controller.abort();
  }, [load]);

  const addAsset = useCallback(async (asset: FreeAsset) => {
    if (addingId) return;
    setAddingId(asset.id);
    try {
      const file = await downloadFreeAsset(asset);
      const id = await importOneFile(file, {
        wallet: quota.walletAddress,
        provenance: provenanceForAsset(asset),
      });
      if (!id) return;
      addClipFromMedia(id);
      await quota.refetchUsage();
      toast.success(`${asset.title} added to the timeline.`);
    } catch (cause) {
      console.error("[editor] free asset import failed", cause);
      toast.error("This asset could not be downloaded. Try another result.");
    } finally {
      setAddingId(null);
    }
  }, [addingId, addClipFromMedia, quota]);

  const toggleAudio = useCallback((asset: FreeAsset) => {
    if (playingId === asset.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(asset.previewUrl || asset.downloadUrl);
    audio.preload = "none";
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => {
      setPlayingId(null);
      toast.error("Audio preview is unavailable for this result.");
    };
    audioRef.current = audio;
    setPlayingId(asset.id);
    void audio.play().catch(() => setPlayingId(null));
  }, [playingId]);

  useEffect(() => () => audioRef.current?.pause(), []);

  const activeKind = useMemo(() => KINDS.find((item) => item.id === kind), [kind]);
  const isAudio = kind === "audio";
  const placeholder = `Search free ${activeKind?.label.toLowerCase() || "assets"}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-white/10 px-3 pb-2.5 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="h-9 w-full rounded-lg border border-white/12 bg-white/[0.055] pl-8 pr-8 text-[12px] text-white outline-none placeholder:text-white/30 focus:border-white/35 focus:bg-white/[0.08]"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-white/35 hover:bg-white/10 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div className="-mx-1 mt-2 flex gap-0.5 overflow-x-auto px-1 pb-0.5 scrollbar-none" role="tablist" aria-label="Asset type">
          {KINDS.map((item) => {
            const Icon = item.icon;
            const active = item.id === kind;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setKind(item.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-medium transition active:scale-[0.98]",
                  active ? "bg-white text-black" : "text-white/50 hover:bg-white/10 hover:text-white",
                )}
              >
                <Icon className="h-3 w-3" />{item.label}
              </button>
            );
          })}
        </div>

        {!isAudio ? (
          <div className="mt-2 flex items-center gap-1" aria-label="Orientation">
            {ORIENTATIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setOrientation(item.id)}
                aria-pressed={orientation === item.id}
                className={cn(
                  "rounded-md px-2 py-1 text-[9px] font-medium transition",
                  orientation === item.id ? "bg-white/15 text-white" : "text-white/35 hover:bg-white/[0.07] hover:text-white/70",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!settledQuery && !loading ? (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {SUGGESTIONS[kind].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setQuery(suggestion)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9px] text-white/55 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        {loading ? <ResultsSkeleton audio={isAudio} /> : error ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
            <p className="text-[11px] leading-relaxed text-white/55">{error}</p>
            <button type="button" onClick={() => void load(1, false)} className="mt-3 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-white/20">Try again</button>
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center">
            <Search className="mx-auto h-5 w-5 text-white/20" />
            <p className="mt-2 text-[12px] font-medium text-white/60">No matching assets</p>
            <p className="mt-1 text-[10px] text-white/35">Try a broader search or another format.</p>
          </div>
        ) : isAudio ? (
          <div className="space-y-2">
            {items.map((asset) => (
              <AudioAssetCard
                key={asset.id}
                asset={asset}
                adding={addingId === asset.id}
                playing={playingId === asset.id}
                onToggle={() => toggleAudio(asset)}
                onAdd={() => void addAsset(asset)}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {items.map((asset) => (
              <VisualAssetCard key={asset.id} asset={asset} adding={addingId === asset.id} onAdd={() => void addAsset(asset)} />
            ))}
          </div>
        )}

        {!loading && !error && hasMore ? (
          <button
            type="button"
            onClick={() => void load(page + 1, true)}
            disabled={loadingMore}
            className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] text-[10px] font-semibold text-white/70 transition hover:border-white/30 hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {loadingMore ? "Loading" : "Load more"}
          </button>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-white/10 px-3 py-2 text-[9px] leading-relaxed text-white/35">
        Free licences with source details included{providers.length ? `. Results from ${providers.join(", ")}.` : "."}
      </div>
    </div>
  );
}
