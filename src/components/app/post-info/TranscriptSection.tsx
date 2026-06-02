import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronUp, FileText, Loader2, Copy, Download, RefreshCw, Search, X } from 'lucide-react';
import { useVideoTranscript } from '@/hooks/use-video-transcript';
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

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  tokenId: number;
  durationSeconds?: number;
}

export function TranscriptSection({ tokenId, durationSeconds }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { data, isLoading, start } = useVideoTranscript(tokenId, open);

  const status = data?.status ?? 'absent';
  const segments = data?.transcript?.segments ?? [];
  const fullText = data?.transcript?.full_text ?? '';
  const durationLabel = durationSeconds
    ? durationSeconds < 60
      ? 'under 1 minute'
      : `about ${Math.round(durationSeconds / 60)} min`
    : null;
  const isLong = (durationSeconds ?? 0) > 600;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullText);
    toast.success('Transcript copied');
  };
  const handleDownload = () => {
    const blob = new Blob([fullText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${tokenId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
          {status === 'ready' && <span className="text-xs text-white/50">· {segments.length} segments</span>}
          {status === 'processing' && (
            <span className="text-xs text-white/60 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              chunk {data?.chunks_done ?? 0}/{data?.chunks_total ?? '?'}
            </span>
          )}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-white/60" /> : <ChevronDown className="w-4 h-4 text-white/60" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {isLoading && status === 'absent' && (
            <div className="text-sm text-white/60 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />Loading…
            </div>
          )}

          {(status === 'absent' || (!data && !isLoading)) && (
            <div className="space-y-2">
              <p className="text-sm text-white/70">
                Generate an AI transcript for this video.
                {durationLabel && ` Video is ${durationLabel}.`}
                {isLong && ' Long videos are auto-chunked — this may take a few minutes.'}
              </p>
              <Button
                className="rounded-xl"
                onClick={() => start.mutate()}
                disabled={start.isPending}
              >
                {start.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                Generate transcript
              </Button>
            </div>
          )}

          {(status === 'pending' || status === 'processing') && (
            <div className="text-sm text-white/70 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Transcribing… chunk {data?.chunks_done ?? 0} of {data?.chunks_total || '?'}
            </div>
          )}

          {status === 'failed' && (
            <div className="space-y-2">
              <p className="text-sm text-red-300">Transcription failed: {data?.error}</p>
              <Button variant="secondary" className="rounded-xl" onClick={() => start.mutate()}>
                <RefreshCw className="w-4 h-4 mr-2" /> Retry
              </Button>
            </div>
          )}

          {status === 'ready' && segments.length > 0 && (() => {
            const q = query.trim();
            const filtered = q
              ? segments.filter((s) => s.text.toLowerCase().includes(q.toLowerCase()))
              : segments;
            return (
              <>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="secondary" className="rounded-lg" onClick={handleCopy}>
                    <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
                  </Button>
                  <Button size="sm" variant="secondary" className="rounded-lg" onClick={handleDownload}>
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Download
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
                      <div key={i} className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(fmt(s.start));
                            toast.success(`Copied ${fmt(s.start)}`);
                          }}
                          className="shrink-0 text-white/50 font-mono text-xs pt-0.5 hover:text-white"
                        >
                          {fmt(s.start)}
                        </button>
                        <p className="text-white/90 leading-relaxed">
                          <Highlight text={s.text} query={q} />
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
