import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Clapperboard,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Loader2,
  Play,
  Plus,
  Search,
  Shapes,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AppState } from "@/components/app/AppState";
import { useEditorStore } from "@/store/editorStore";
import { useEditorQuota } from "@/hooks/use-editor-quota";
import { importOneFile } from "@/lib/editor/importFiles";
import { projectTask } from "@/lib/editor/projectTask";
import { appendStockResults, createStockSearchSession } from "@/lib/editor/stockBrowser";
import { FreeAssetPreview } from "@/components/editor/FreeAssetPreview";
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

function VisualAssetCard({ asset, adding, onAdd, onPreview }: { asset: FreeAsset; adding: boolean; onAdd: () => void; onPreview: () => void }) {
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
        <button type="button" onClick={onPreview} aria-label={`Preview ${asset.title}`} className="absolute right-1.5 top-1.5 rounded-lg border border-white/25 bg-black/75 p-1.5 text-white hover:bg-white hover:text-black"><Play className="h-3.5 w-3.5" /></button>
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
        aria-label={`${playing ? "Close preview" : "Preview"} ${asset.title}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white hover:text-black active:scale-[0.98]"
      >
        {playing ? <X className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
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
  const [query, setQuery] = useSurfaceDraft("components/editor/panels/FreeAssetsPanel.tsx:query", "");
  const [settledQuery, setSettledQuery] = useState("");
  const [orientation, setOrientation] = useState<FreeAssetOrientation>("all");
  const [items, setItems] = useState<FreeAsset[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<FreeAsset | null>(null);
  const session = useRef(createStockSearchSession());
  const mounted = useRef(true);
  const importing = useRef<{ task: NonNullable<ReturnType<typeof projectTask>>; controller: AbortController } | null>(null);
  const quota = useEditorQuota();
  const wallet = useRef(quota.walletAddress); wallet.current = quota.walletAddress;
  const cancelImport = useCallback(() => {
    const owner = importing.current;
    if (!owner) return;
    importing.current = null; owner.controller.abort(); owner.task.release();
    if (mounted.current) setAddingId(null);
  }, []);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = useEditorStore.subscribe(() => { if (importing.current && !importing.current.task.isCurrent()) cancelImport(); });
    return () => { mounted.current = false; session.current.cancel(); unsubscribe(); cancelImport(); };
  }, [cancelImport]);
  useEffect(() => { if (importing.current && !importing.current.task.isCurrent()) cancelImport(); }, [quota.walletAddress, cancelImport]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettledQuery(query.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPreview(null);
  }, [kind]);

  const load = useCallback(async (nextPage: number, append: boolean) => {
    const ticket = session.current.begin();
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await searchFreeAssets({ kind, query: settledQuery, page: nextPage, orientation, signal: ticket.signal });
      if (!ticket.current()) return;
      setItems((current) => appendStockResults(append ? current : [], result.items));
      setPage(nextPage);
      setHasMore(result.hasMore);
    } catch (cause) {
      if (!ticket.current()) return;
      console.error("[editor] free asset search failed", cause);
      setError("The free library could not load. Check your connection and try again.");
      if (!append) setItems([]);
    } finally {
      if (ticket.current()) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [kind, settledQuery, orientation]);

  useEffect(() => {
    void load(1, false);
    return () => session.current.cancel();
  }, [load]);

  const addAsset = useCallback(async (asset: FreeAsset) => {
    if (importing.current) return;
    const anchor = useEditorStore.getState();
    const at = anchor.currentTime, projectId = anchor.projectId, scope = anchor.scopeVersion, capturedWallet = wallet.current;
    const task = projectTask(anchor.holdEdits(), () => mounted.current && wallet.current === capturedWallet && useEditorStore.getState().scopeVersion === scope && useEditorStore.getState().projectId === projectId)!;
    const owner = { task, controller: new AbortController() }; importing.current = owner;
    anchor.setPlaying(false);
    setAddingId(asset.id);
    try {
      const file = await downloadFreeAsset(asset, owner.controller.signal);
      if (!task.isCurrent()) return;
      const id = await importOneFile(file, {
        wallet: capturedWallet,
        provenance: provenanceForAsset(asset),
      });
      if (!id || !task.isCurrent()) return;
      useEditorStore.getState().addClipFromMedia(id, undefined, at);
      await quota.refetchUsage();
      if (task.isCurrent()) toast.success(`${asset.title} added to the timeline.`);
    } catch (cause) {
      if (task.isCurrent()) {
        console.error("[editor] free asset import failed", cause);
        toast.error("This asset could not be downloaded. Try another result.");
      }
    } finally {
      task.release();
      if (importing.current === owner) { importing.current = null; if (mounted.current) setAddingId(null); }
    }
  }, [quota]);

  const toggleAudio = useCallback((asset: FreeAsset) => {
    setPreview(current => current?.id === asset.id ? null : asset);
  }, []);

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
            onChange={(event) => { if (event.target.value !== query) { session.current.cancel(); setPreview(null); setQuery(event.target.value); } }}
            placeholder={placeholder}
            aria-label={placeholder}
            className="h-9 w-full rounded-lg border border-white/12 bg-white/[0.055] pl-8 pr-8 text-[12px] text-white outline-none placeholder:text-white/30 focus:border-white/35 focus:bg-white/[0.08]"
          />
          {query ? (
            <button type="button" onClick={() => { session.current.cancel(); setPreview(null); setQuery.complete(query, ""); }} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-white/35 hover:bg-white/10 hover:text-white">
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
                onClick={() => { if (item.id !== kind) { session.current.cancel(); setPreview(null); setOrientation("all"); setKind(item.id); } }}
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
                onClick={() => { if (item.id !== orientation) { session.current.cancel(); setPreview(null); setOrientation(item.id); } }}
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
        {preview && <FreeAssetPreview key={preview.id} asset={preview} onClose={() => setPreview(null)} />}
        {!settledQuery && !loading ? (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {SUGGESTIONS[kind].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => { if (suggestion !== query) { session.current.cancel(); setPreview(null); setQuery(suggestion); } }}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9px] text-white/55 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        {loading ? <ResultsSkeleton audio={isAudio} /> : error ? (
          <AppState
            icon="notifications"
            title="Assets could not load"
            description={error}
            kind="error"
            size="compact"
            primaryAction={{ label: 'Try again', onClick: () => void load(1, false) }}
          />
        ) : items.length === 0 ? (
          <AppState
            icon="search"
            title="No matching assets"
            description="Try a broader search or another format."
            kind="search-empty"
            size="compact"
          />
        ) : isAudio ? (
          <div className="space-y-2">
            {items.map((asset) => (
              <AudioAssetCard
                key={asset.id}
                asset={asset}
                adding={addingId === asset.id}
                playing={preview?.id === asset.id}
                onToggle={() => toggleAudio(asset)}
                onAdd={() => void addAsset(asset)}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {items.map((asset) => (
              <VisualAssetCard key={asset.id} asset={asset} adding={addingId === asset.id} onAdd={() => void addAsset(asset)} onPreview={() => setPreview(current => current?.id === asset.id ? null : asset)} />
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

    </div>
  );
}
