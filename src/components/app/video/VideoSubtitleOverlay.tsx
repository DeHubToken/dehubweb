/**
 * VideoSubtitleOverlay
 * ====================
 * Optional CC button + caption renderer for any HTMLVideoElement.
 *
 * Mount inside the video's positioned container, pass the videoRef and a
 * numeric tokenId. The overlay no-ops when tokenId is missing.
 *
 * - CC button toggles subtitles on/off (persisted in localStorage).
 * - Dropdown lets the user pick any language; translations are AI-generated
 *   on demand and cached server-side via the translate-transcript function.
 * - If no transcript exists yet, tapping the button kicks off transcription.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Captions, Check, Loader2, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useVideoTranscript, type TranscriptSegment } from '@/hooks/use-video-transcript';
import { useTranslatedSegments } from '@/hooks/use-video-subtitles';
import { SUBTITLE_LANGUAGES, detectLocaleLang } from '@/lib/subtitle-languages';

const LS_ENABLED = 'video-subs:enabled';
const LS_LANG = 'video-subs:lang';

interface Props {
  /** Numeric NFT/post id. Overlay is a no-op when undefined or 0. */
  tokenId?: number | string | null;
  /** Ref to the underlying <video> element. */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** Optional className overrides for the button position. Defaults bottom-left. */
  buttonClassName?: string;
}

function readEnabled(): boolean {
  try { return localStorage.getItem(LS_ENABLED) === '1'; } catch { return false; }
}
function readLang(): string {
  try { return localStorage.getItem(LS_LANG) || detectLocaleLang(); } catch { return 'original'; }
}

export function VideoSubtitleOverlay({ tokenId, videoRef, buttonClassName }: Props) {
  const numericId = useMemo(() => {
    const n = typeof tokenId === 'string' ? parseInt(tokenId, 10) : tokenId ?? 0;
    return Number.isFinite(n) && n > 0 ? Number(n) : 0;
  }, [tokenId]);

  const [enabled, setEnabled] = useState<boolean>(readEnabled);
  const [lang, setLang] = useState<string>(readLang);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [currentText, setCurrentText] = useState('');

  // Only fetch transcript once user has shown intent (open popover or enabled subs)
  const wantTranscript = enabled || open;

  const { data: transcript, status, start, isLoading: transcriptLoading } =
    useVideoTranscript(numericId || null, !!numericId && wantTranscript);

  const isReady = transcript?.status === 'ready';
  const isWorking =
    transcript?.status === 'pending' || transcript?.status === 'processing';

  const { data: translatedSegments, isFetching: translating } = useTranslatedSegments(
    numericId || null,
    lang,
    !!numericId && enabled && isReady && lang !== 'original',
  );

  const activeSegments: TranscriptSegment[] = useMemo(() => {
    if (!isReady) return [];
    if (lang === 'original' || !translatedSegments) {
      return transcript?.transcript?.segments ?? [];
    }
    return translatedSegments;
  }, [isReady, lang, translatedSegments, transcript]);

  // Persist preferences
  useEffect(() => {
    try { localStorage.setItem(LS_ENABLED, enabled ? '1' : '0'); } catch { /* noop */ }
  }, [enabled]);
  useEffect(() => {
    try { localStorage.setItem(LS_LANG, lang); } catch { /* noop */ }
  }, [lang]);

  // Sync captions to video time
  const indexRef = useRef(0);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !enabled || !activeSegments.length) {
      setCurrentText('');
      return;
    }
    indexRef.current = 0;

    let raf = 0;
    let lastTick = 0;
    const tick = (ts: number) => {
      if (ts - lastTick > 200) {
        lastTick = ts;
        const t = v.currentTime;
        // Move pointer forward if needed
        while (
          indexRef.current < activeSegments.length - 1 &&
          activeSegments[indexRef.current].end <= t
        ) indexRef.current++;
        // Move backward on seek
        while (
          indexRef.current > 0 &&
          activeSegments[indexRef.current].start > t
        ) indexRef.current--;
        const seg = activeSegments[indexRef.current];
        const inRange = seg && t >= seg.start && t < seg.end;
        setCurrentText(inRange ? seg.text : '');
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onSeek = () => { indexRef.current = 0; };
    v.addEventListener('seeked', onSeek);

    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener('seeked', onSeek);
    };
  }, [videoRef, enabled, activeSegments]);

  if (!numericId) return null;

  const buttonState: 'off' | 'on' | 'working' | 'loading' =
    isWorking || translating || transcriptLoading
      ? 'working'
      : enabled
      ? 'on'
      : 'off';

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isReady && !isWorking) {
      // Kick off transcription
      start.mutate();
      setEnabled(true);
      return;
    }
    setEnabled((v) => !v);
  };

  const filteredLangs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SUBTITLE_LANGUAGES;
    return SUBTITLE_LANGUAGES.filter(
      (l) => l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q),
    );
  }, [query]);

  const langLabel =
    SUBTITLE_LANGUAGES.find((l) => l.code === lang)?.name ?? 'Original';

  return (
    <>
      {/* Caption text */}
      {enabled && currentText && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-16 z-20 pointer-events-none max-w-[90%] text-center"
        >
          <span
            className="inline-block bg-black/60 backdrop-blur-[24px] border border-white/10 text-white text-sm md:text-base font-medium px-3 py-1.5 rounded-xl leading-snug"
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
          >
            {currentText}
          </span>
        </div>
      )}

      {/* CC button + language popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              // Single tap toggles; user opens menu via right-click / long-press handled below
              handleToggle(e);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(true);
            }}
            aria-label={enabled ? 'Subtitles on' : 'Subtitles off'}
            className={cn(
              'z-20 h-8 w-8 rounded-lg bg-black/60 backdrop-blur-[24px] border border-white/10 flex items-center justify-center transition-opacity',
              'opacity-80 hover:opacity-100',
              buttonState === 'off' && 'text-white/60',
              buttonState === 'on' && 'text-white',
              buttonState === 'working' && 'text-white/80',
              buttonClassName ?? 'absolute bottom-12 left-2',
            )}
          >
            {buttonState === 'working' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Captions className={cn('w-4 h-4', enabled && 'fill-white/20')} />
            )}
            {enabled && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-white" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="top"
          sideOffset={6}
          className="w-64 p-0 bg-black/80 backdrop-blur-[24px] border-white/10"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-2 border-b border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white text-xs font-semibold">Subtitles</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setEnabled((v) => !v); }}
                className={cn(
                  'text-[10px] px-2 py-0.5 rounded-md border',
                  enabled
                    ? 'bg-white/15 text-white border-white/20'
                    : 'bg-transparent text-white/60 border-white/10',
                )}
              >
                {enabled ? 'On' : 'Off'}
              </button>
            </div>
            {!isReady && (
              <p className="text-[11px] text-white/50">
                {isWorking ? 'Generating transcript…' : 'No transcript yet. Toggle on to generate.'}
              </p>
            )}
            {isReady && (
              <p className="text-[11px] text-white/50">
                Language: <span className="text-white/80">{langLabel}</span>
              </p>
            )}
          </div>
          <div className="p-2 border-b border-white/10">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/40" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search language"
                className="h-7 pl-7 text-xs bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filteredLangs.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLang(l.code);
                  if (!enabled) setEnabled(true);
                }}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-white/5 transition',
                  lang === l.code ? 'text-white' : 'text-white/70',
                )}
              >
                <span>{l.name}</span>
                {lang === l.code && <Check className="w-3 h-3" />}
              </button>
            ))}
            {filteredLangs.length === 0 && (
              <p className="px-3 py-3 text-[11px] text-white/40 text-center">No match</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
