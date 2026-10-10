import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
/**
 * Transcript panel on a post page.
 *
 * The transcript itself is no longer produced here — the sweeper writes one
 * for every video whether or not anybody opens this. What is left is reading:
 * the overview, the chapters, a search across the lines, and a jump to any
 * timestamp.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AppState } from '@/components/app/AppState';
import { Input } from '@/components/ui/input';
import {
  ChevronDown, ChevronUp, FileText, Loader2, Copy, Download,
  RefreshCw, Search, X, Sparkles, ListTree, Pencil, Check, ThumbsUp, ThumbsDown,
} from 'lucide-react';
import { useVideoTranscript } from '@/hooks/use-video-transcript';
import type { TranscriptSegment } from '@/hooks/use-transcript';
import { useAuth } from '@/contexts/AuthContext';
import {
  applyCorrections,
  useCorrectionActions,
  useTranscriptCorrections,
  type TranscriptCorrection,
} from '@/hooks/use-transcript-corrections';
import { supabase } from '@/integrations/supabase/client';
import { formatTimestamp, formatSrt, downloadFile } from '@/lib/transcript-format';
import { toast } from 'sonner';

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'ig'));
  const q = query.toLowerCase();
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === q ? (
          <mark key={i} className="bg-white/30 text-white rounded px-0.5">{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

/**
 * One transcript line, plus the community-caption affordances: the fix that
 * has been accepted for it, the ones still waiting on a second opinion, and
 * the pencil that submits your own.
 *
 * Auto-captions mangle accents, cross-talk, names and jargon, and the person
 * who can hear the difference is usually a viewer rather than the uploader.
 */
function TranscriptLine({
  segment,
  index,
  query,
  onSeek,
  transcriptId,
  isCorrected,
  suggestions,
}: {
  segment: TranscriptSegment;
  index: number;
  query: string;
  onSeek?: (seconds: number) => void;
  transcriptId: string | null;
  isCorrected: boolean;
  suggestions: TranscriptCorrection[];
}) {
  const { t: _copy } = _useCopy();
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const { submit, vote, remove } = useCorrectionActions(transcriptId);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useSurfaceDraft("src/components/app/post-info/TranscriptSection.tsx:draft", segment.text, `${transcriptId}:${index}`);

  const startEditing = () => {
    if (!isAuthenticated) return openLoginModal();
    setDraft.initialize(segment.text);
    setIsEditing(true);
  };

  return (
    <div className="group/line flex gap-3 items-start">
      <button
        type="button"
        onClick={() => {
          if (onSeek) return onSeek(segment.start);
          navigator.clipboard.writeText(formatTimestamp(segment.start));
          toast.success(`Copied ${formatTimestamp(segment.start)}`);
        }}
        className="shrink-0 text-white/50 font-mono text-xs pt-0.5 hover:text-white"
      >
        {formatTimestamp(segment.start)}
      </button>

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setIsEditing(false);
                if (e.key !== 'Enter' || !draft.trim()) return;
                submit.mutate(
                  { segmentIndex: index, text: draft.trim(), originalText: segment.text },
                  { onSuccess: () => { setDraft.complete(draft, draft); setIsEditing(false); } },
                );
              }}
              maxLength={500}
              className="h-8 bg-white/5 border-white/15 text-white text-sm"
            />
            <button
              type="button"
              disabled={!draft.trim() || submit.isPending}
              onClick={() => submit.mutate(
                { segmentIndex: index, text: draft.trim(), originalText: segment.text },
                { onSuccess: () => { setDraft.complete(draft, draft); setIsEditing(false); } },
              )}
              className="shrink-0 p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-40"
              aria-label={_copy("copy.b813cdf613bf", { defaultValue: "Submit correction" })}
            >
              {submit.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="shrink-0 p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10"
              aria-label={_copy("copy.19766ed6ccb2", { defaultValue: "Cancel" })}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <p className="text-white/90 leading-relaxed">
            <Highlight text={segment.text} query={query} />
            {isCorrected && (
              <span className="ml-1.5 text-[10px] text-white/40 align-middle" title={_copy("copy.f4da0c915a26", { defaultValue: "Corrected by viewers" })}>{_copy("copy.992a93455c71", { defaultValue: "fixed" })}</span>
            )}
            <button
              type="button"
              onClick={startEditing}
              aria-label={_copy("copy.a93f40039316", { defaultValue: "Suggest a correction for this line" })}
              className="ml-1.5 align-middle p-1 rounded text-white/0 group-hover/line:text-white/40 hover:!text-white focus:text-white/70 transition-colors"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </p>
        )}

        {/* Fixes waiting on one more viewer to agree. */}
        {suggestions.map((suggestion) => {
          const isMine = !!walletAddress && suggestion.address.toLowerCase() === walletAddress.toLowerCase();
          return (
            <div key={suggestion.id} className="mt-1 flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-2 py-1">
              <p className="flex-1 min-w-0 text-xs text-white/70 truncate">{_copy("copy.003c052ea56a", { defaultValue: "Suggested: " })}{suggestion.text}
              </p>
              {isMine ? (
                <button
                  type="button"
                  onClick={() => remove.mutate(suggestion.id)}
                  className="shrink-0 p-1 rounded text-white/50 hover:text-red-400"
                  aria-label={_copy("copy.dc99d484fc86", { defaultValue: "Withdraw your suggestion" })}
                >
                  <X className="w-3 h-3" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => isAuthenticated ? vote.mutate({ correctionId: suggestion.id, value: 1 }) : openLoginModal()}
                    className="shrink-0 p-1 rounded text-white/50 hover:text-white"
                    aria-label={_copy("copy.5d693875b034", { defaultValue: "This correction is right" })}
                  >
                    <ThumbsUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => isAuthenticated ? vote.mutate({ correctionId: suggestion.id, value: -1 }) : openLoginModal()}
                    className="shrink-0 p-1 rounded text-white/50 hover:text-white"
                    aria-label={_copy("copy.d4ea5e7950a8", { defaultValue: "This correction is wrong" })}
                  >
                    <ThumbsDown className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface Props {
  tokenId: number;
  durationSeconds?: number;
  /** Optional: seek the page's player when a timestamp is tapped. */
  onSeek?: (seconds: number) => void;
}

export function TranscriptSection({ tokenId, durationSeconds, onSeek }: Props) {
  const { t: _copy } = _useCopy();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useSurfaceDraft("components/app/post-info/TranscriptSection.tsx:query", '');
  const [overviewLoading, setOverviewLoading] = useState(false);

  const { transcript, status, inFlight, canRetry, start, isLoading } =
    useVideoTranscript(tokenId, open);

  const rawSegments = transcript?.segments ?? [];
  const chapters = transcript?.chapters ?? [];
  const overview = transcript?.summary ?? null;

  // Viewer corrections. Accepted ones replace the line everywhere below —
  // reading, searching, copying and the SRT export — because a corrected
  // caption that only shows in one of those is a caption people stop trusting.
  const { accepted, suggested } = useTranscriptCorrections(
    transcript?.id ?? null,
    open && status === 'ready',
  );
  const segments = useMemo(() => applyCorrections(rawSegments, accepted), [rawSegments, accepted]);
  const fullText = useMemo(
    () => (accepted.size ? segments.map((s) => s.text).join(' ') : transcript?.full_text ?? ''),
    [accepted.size, segments, transcript?.full_text],
  );

  // The sweeper's transcribe run kicks the summariser itself. This is the
  // catch-up for rows written before that existed, and it asks once.
  useEffect(() => {
    if (!open || status !== 'ready' || !transcript) return;
    if (overview || overviewLoading) return;
    if (transcript.summary_status === 'skipped' || transcript.summary_status === 'failed') return;
    let cancelled = false;
    setOverviewLoading(true);
    supabase.functions
      .invoke('summarize-transcript', { body: { kind: 'video', ref: String(tokenId) } })
      .finally(() => { if (!cancelled) setOverviewLoading(false); });
    return () => { cancelled = true; };
  }, [open, status, transcript, overview, overviewLoading, tokenId]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullText);
    toast.success(_copy("copy.758ba0c08150", { defaultValue: "Transcript copied" }));
  };
  const handleDownloadTxt = () => {
    downloadFile(fullText, `transcript-${tokenId}.txt`);
  };
  const handleDownloadSrt = () => {
    downloadFile(
      formatSrt(segments.map((s) => ({ ...s, speaker: s.speaker ?? '' })), () => ''),
      `transcript-${tokenId}.srt`,
      'application/x-subrip',
    );
  };

  // Indexed, not just filtered: a correction is keyed on the line's position
  // in the transcript, and a search would otherwise renumber every line.
  const filtered = useMemo(() => {
    const indexed = segments.map((segment, index) => ({ segment, index }));
    const q = query.trim().toLowerCase();
    return q ? indexed.filter(({ segment }) => segment.text.toLowerCase().includes(q)) : indexed;
  }, [segments, query]);

  const q = query.trim();

  return (
    <div className="rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-white hover:bg-white/5 transition"
      >
        <span className="flex items-center gap-2 font-medium">
          <FileText className="w-4 h-4 text-white/70" />{_copy("copy.721164f0dc70", { defaultValue: "Transcript" })}{status === 'ready' && (
            <span className="text-xs text-white/50">· {segments.length}{_copy("copy.d91fca0e24bb", { defaultValue: " lines" })}</span>
          )}
          {inFlight && (
            <span className="text-xs text-white/60 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />{_copy("copy.ee871105e875", { defaultValue: "writing" })}</span>
          )}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-white/60" /> : <ChevronDown className="w-4 h-4 text-white/60" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {isLoading && (
            <div className="text-sm text-white/60 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />{_copy("copy.ba3bbbe10d8b", { defaultValue: "Loading…" })}</div>
          )}

          {!isLoading && status === 'absent' && (
            <AppState
              icon="posts"
              title={_copy("copy.5ae4bb109db7", { defaultValue: "No transcript yet" })}
              description={_copy("copy.60aac7666712", { defaultValue: "A transcript is written automatically shortly after a video is posted." })}
              size="drawer"
              primaryAction={{ label: _copy("copy.6662a5411155", { defaultValue: "Write it now" }), onClick: () => start.mutate(), loading: start.isPending }}
            />
          )}

          {inFlight && (
            <div className="text-sm text-white/70 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />{_copy("copy.5561cf90d112", { defaultValue: "Transcribing" })}{durationSeconds ? _copy("copy.87fb4c427986", { defaultValue: " {{value1}} min of video", value1: Math.max(1, Math.round(durationSeconds / 60)) }) : ''}…
            </div>
          )}

          {status === 'empty' && (
            <p className="text-sm text-white/60">{_copy("copy.4c2ea0ddf64b", { defaultValue: "This video has no speech in it, so there is nothing to transcribe." })}</p>
          )}

          {status === 'failed' && (
            <div className="space-y-2">
              <p className="text-sm text-red-300">{_copy("copy.9fddb94edef5", { defaultValue: "Transcription failed: " })}{transcript?.error}</p>
              {canRetry && (
                <Button variant="secondary" className="rounded-xl" onClick={() => start.mutate()}>
                  <RefreshCw className="w-4 h-4 mr-2" />{_copy("copy.55de39f882a3", { defaultValue: " Try again" })}</Button>
              )}
            </div>
          )}

          {status === 'ready' && segments.length > 0 && (
            <>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="secondary" className="rounded-lg" onClick={handleCopy}>
                  <Copy className="w-3.5 h-3.5 mr-1.5" />{_copy("copy.dea0ff385abf", { defaultValue: " Copy" })}</Button>
                <Button size="sm" variant="secondary" className="rounded-lg" onClick={handleDownloadTxt}>
                  <Download className="w-3.5 h-3.5 mr-1.5" />{_copy("copy.d0bd6ec267f9", { defaultValue: " Text" })}</Button>
                <Button size="sm" variant="secondary" className="rounded-lg" onClick={handleDownloadSrt}>
                  <Download className="w-3.5 h-3.5 mr-1.5" />{_copy("copy.572abf9d987b", { defaultValue: " SRT" })}</Button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={_copy("copy.2baeddfdc699", { defaultValue: "Search transcript…" })}
                  className="pl-9 pr-9 h-9 rounded-lg bg-white/5 border-white/10 text-white placeholder:text-white/40"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery.complete(query, '')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/50 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {(overview || overviewLoading) && (
                <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 flex gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-white/60 mt-0.5 shrink-0" />
                  {overviewLoading && !overview ? (
                    <p className="text-xs text-white/60 flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />{_copy("copy.6e929effed4e", { defaultValue: " Writing overview…" })}</p>
                  ) : (
                    <p className="text-xs text-white/80 leading-relaxed">{overview}</p>
                  )}
                </div>
              )}

              {chapters.length > 0 && !q && (
                <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                  <p className="text-[11px] text-white/50 flex items-center gap-1.5 mb-1.5">
                    <ListTree className="w-3 h-3" />{_copy("copy.7adf0298ab5e", { defaultValue: " Chapters" })}</p>
                  <div className="space-y-1">
                    {chapters.map((c, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => onSeek?.(c.start)}
                        className="w-full flex gap-3 items-baseline text-left hover:bg-white/5 rounded px-1 py-0.5"
                      >
                        <span className="shrink-0 text-white/50 font-mono text-[11px]">
                          {formatTimestamp(c.start)}
                        </span>
                        <span className="text-xs text-white/85">{c.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {q && (
                <p className="text-xs text-white/50">
                  {filtered.length} {filtered.length === 1 ? _copy("copy.4945a70fa7f9", { defaultValue: "match" }) : _copy("copy.a54084383e3c", { defaultValue: "matches" })}
                </p>
              )}

              <div className="max-h-96 overflow-y-auto space-y-2 pr-2 text-sm">
                {filtered.length === 0 ? (
                  <AppState icon="search" title={_copy("copy.14c5558a8cd9", { defaultValue: "No transcript matches" })} kind="search-empty" size="compact" />
                ) : (
                  filtered.map(({ segment: s, index }) => (
                    <TranscriptLine
                      key={index}
                      segment={s}
                      index={index}
                      query={q}
                      onSeek={onSeek}
                      transcriptId={transcript?.id ?? null}
                      isCorrected={accepted.has(index)}
                      suggestions={suggested.get(index) ?? []}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
