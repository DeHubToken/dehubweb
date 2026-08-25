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
import { Input } from '@/components/ui/input';
import {
  ChevronDown, ChevronUp, FileText, Loader2, Copy, Download,
  RefreshCw, Search, X, Sparkles, ListTree,
} from 'lucide-react';
import { useVideoTranscript } from '@/hooks/use-video-transcript';
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

interface Props {
  tokenId: number;
  durationSeconds?: number;
  /** Optional: seek the page's player when a timestamp is tapped. */
  onSeek?: (seconds: number) => void;
}

export function TranscriptSection({ tokenId, durationSeconds, onSeek }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [overviewLoading, setOverviewLoading] = useState(false);

  const { transcript, status, inFlight, canRetry, start, isLoading } =
    useVideoTranscript(tokenId, open);

  const segments = transcript?.segments ?? [];
  const chapters = transcript?.chapters ?? [];
  const fullText = transcript?.full_text ?? '';
  const overview = transcript?.summary ?? null;

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
    toast.success('Transcript copied');
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? segments.filter((s) => s.text.toLowerCase().includes(q)) : segments;
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
          <FileText className="w-4 h-4 text-white/70" />
          Transcript
          {status === 'ready' && (
            <span className="text-xs text-white/50">· {segments.length} lines</span>
          )}
          {inFlight && (
            <span className="text-xs text-white/60 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              writing
            </span>
          )}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-white/60" /> : <ChevronDown className="w-4 h-4 text-white/60" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {isLoading && (
            <div className="text-sm text-white/60 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />Loading…
            </div>
          )}

          {!isLoading && status === 'absent' && (
            <div className="space-y-2">
              <p className="text-sm text-white/70">
                No transcript for this video yet. One is written automatically shortly
                after a video is posted.
              </p>
              <Button className="rounded-xl" onClick={() => start.mutate({})} disabled={start.isPending}>
                {start.isPending
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <FileText className="w-4 h-4 mr-2" />}
                Write it now
              </Button>
            </div>
          )}

          {inFlight && (
            <div className="text-sm text-white/70 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Transcribing
              {durationSeconds ? ` ${Math.max(1, Math.round(durationSeconds / 60))} min of video` : ''}…
            </div>
          )}

          {status === 'empty' && (
            <p className="text-sm text-white/60">
              This video has no speech in it, so there is nothing to transcribe.
            </p>
          )}

          {status === 'failed' && (
            <div className="space-y-2">
              <p className="text-sm text-red-300">Transcription failed: {transcript?.error}</p>
              {canRetry && (
                <Button variant="secondary" className="rounded-xl" onClick={() => start.mutate({ force: true })}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Try again
                </Button>
              )}
            </div>
          )}

          {status === 'ready' && segments.length > 0 && (
            <>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="secondary" className="rounded-lg" onClick={handleCopy}>
                  <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
                </Button>
                <Button size="sm" variant="secondary" className="rounded-lg" onClick={handleDownloadTxt}>
                  <Download className="w-3.5 h-3.5 mr-1.5" /> Text
                </Button>
                <Button size="sm" variant="secondary" className="rounded-lg" onClick={handleDownloadSrt}>
                  <Download className="w-3.5 h-3.5 mr-1.5" /> SRT
                </Button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search transcript…"
                  className="pl-9 pr-9 h-9 rounded-lg bg-white/5 border-white/10 text-white placeholder:text-white/40"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
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
                      <Loader2 className="w-3 h-3 animate-spin" /> Writing overview…
                    </p>
                  ) : (
                    <p className="text-xs text-white/80 leading-relaxed">{overview}</p>
                  )}
                </div>
              )}

              {chapters.length > 0 && !q && (
                <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                  <p className="text-[11px] text-white/50 flex items-center gap-1.5 mb-1.5">
                    <ListTree className="w-3 h-3" /> Chapters
                  </p>
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
                  {filtered.length} {filtered.length === 1 ? 'match' : 'matches'}
                </p>
              )}

              <div className="max-h-96 overflow-y-auto space-y-2 pr-2 text-sm">
                {filtered.length === 0 ? (
                  <p className="text-white/50 text-sm py-4 text-center">No matches found</p>
                ) : (
                  filtered.map((s, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <button
                        type="button"
                        onClick={() => {
                          if (onSeek) return onSeek(s.start);
                          navigator.clipboard.writeText(formatTimestamp(s.start));
                          toast.success(`Copied ${formatTimestamp(s.start)}`);
                        }}
                        className="shrink-0 text-white/50 font-mono text-xs pt-0.5 hover:text-white"
                      >
                        {formatTimestamp(s.start)}
                      </button>
                      <p className="text-white/90 leading-relaxed">
                        <Highlight text={s.text} query={q} />
                      </p>
                    </div>
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
