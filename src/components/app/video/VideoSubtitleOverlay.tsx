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
import { Captions, Check, Loader2, Search, Settings2, Minus, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useVideoTranscript, type TranscriptSegment } from '@/hooks/use-video-transcript';
import { useTranslatedSegments } from '@/hooks/use-video-subtitles';
import { SUBTITLE_LANGUAGES, detectLocaleLang } from '@/lib/subtitle-languages';

const LS_ENABLED = 'video-subs:enabled';
const LS_LANG = 'video-subs:lang';
const LS_SIZE = 'video-subs:size';

const SIZE_PRESETS = [
  { key: 'xs', label: 'XS', px: 11 },
  { key: 'sm', label: 'S', px: 13 },
  { key: 'md', label: 'M', px: 15 },
  { key: 'lg', label: 'L', px: 18 },
  { key: 'xl', label: 'XL', px: 22 },
  { key: '2xl', label: 'XXL', px: 28 },
] as const;
type SizeKey = typeof SIZE_PRESETS[number]['key'];

interface Props {
  /** Numeric NFT/post id. Overlay is a no-op when undefined or 0. */
  tokenId?: number | string | null;
  /** Ref to the underlying <video> element. */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** Optional className overrides for the button position. Defaults bottom-left. */
  buttonClassName?: string;
  /** When false, the CC button is faded out (captions still render). Defaults true. */
  buttonVisible?: boolean;
}

function readEnabled(): boolean {
  try { return localStorage.getItem(LS_ENABLED) === '1'; } catch { return false; }
}
function readLang(): string {
  // Default to 'original' — only translate when the user explicitly picks
  // a non-English language. Avoids junk en→en AI "translations".
  try { return localStorage.getItem(LS_LANG) || 'original'; } catch { return 'original'; }
}
function readSize(): SizeKey {
  try {
    const v = localStorage.getItem(LS_SIZE) as SizeKey | null;
    if (v && SIZE_PRESETS.some((s) => s.key === v)) return v;
  } catch { /* noop */ }
  return 'xs';
}

export function VideoSubtitleOverlay({ tokenId, videoRef, buttonClassName, buttonVisible = true }: Props) {
  const numericId = useMemo(() => {
    const n = typeof tokenId === 'string' ? parseInt(tokenId, 10) : tokenId ?? 0;
    return Number.isFinite(n) && n > 0 ? Number(n) : 0;
  }, [tokenId]);

  const [enabled, setEnabled] = useState<boolean>(readEnabled);
  const [lang, setLang] = useState<string>(readLang);
  const [size, setSize] = useState<SizeKey>(readSize);
  const [showSettings, setShowSettings] = useState(false);
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

  // Treat english variants as "original" — the underlying transcripts are
  // produced in the spoken language (usually English) so translating en→en
  // just produces garbled duplicate segments.
  const sourceLang = (transcript?.source_lang || '').toLowerCase().split('-')[0];
  const normalizedLang = useMemo(() => {
    const l = (lang || '').toLowerCase();
    if (!l || l === 'original') return 'original';
    const base = l.split('-')[0];
    // If user picked the same language as the source, treat as original.
    if (sourceLang && base === sourceLang) return 'original';
    // Legacy: when source_lang is unknown, treat english as original.
    if (!sourceLang && (base === 'en')) return 'original';
    return l;
  }, [lang, sourceLang]);

  const { data: translatedSegments, isFetching: translating } = useTranslatedSegments(
    numericId || null,
    normalizedLang,
    !!numericId && enabled && isReady && normalizedLang !== 'original',
  );

  const activeSegments: TranscriptSegment[] = useMemo(() => {
    if (!isReady) return [];
    if (normalizedLang === 'original' || !translatedSegments) {
      return transcript?.transcript?.segments ?? [];
    }
    return translatedSegments;
  }, [isReady, normalizedLang, translatedSegments, transcript]);

  // ── Native <track> mounting for original-language captions ──
  // When VTT is available and user picked original, mount a native track
  // on the <video> element — the browser handles perfect timestamp sync.
  const vttBlobUrl = useMemo(() => {
    const vtt = transcript?.vtt_original;
    if (!vtt) return null;
    const blob = new Blob([vtt], { type: 'text/vtt' });
    return URL.createObjectURL(blob);
  }, [transcript?.vtt_original]);

  useEffect(() => {
    return () => {
      if (vttBlobUrl) URL.revokeObjectURL(vttBlobUrl);
    };
  }, [vttBlobUrl]);

  const useNativeTrack = enabled && normalizedLang === 'original' && !!vttBlobUrl;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Remove any prior subtitle tracks we added
    Array.from(v.querySelectorAll('track[data-lovable-subtitle]')).forEach((n) => n.remove());

    if (!useNativeTrack || !vttBlobUrl) {
      // Disable any text tracks we previously toggled on
      for (let i = 0; i < v.textTracks.length; i++) {
        const tt = v.textTracks[i];
        if (tt.kind === 'subtitles' || tt.kind === 'captions') tt.mode = 'disabled';
      }
      return;
    }

    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = 'Original';
    track.srclang = sourceLang || 'en';
    track.src = vttBlobUrl;
    track.default = true;
    track.setAttribute('data-lovable-subtitle', '1');
    v.appendChild(track);

    // Force-show the track once it loads
    const showTrack = () => {
      for (let i = 0; i < v.textTracks.length; i++) {
        const tt = v.textTracks[i];
        if (tt.label === 'Original') tt.mode = 'showing';
      }
    };
    track.addEventListener('load', showTrack);
    // Some browsers don't fire 'load' reliably — set immediately too.
    showTrack();
    const t = setTimeout(showTrack, 200);

    return () => {
      clearTimeout(t);
      track.removeEventListener('load', showTrack);
      try { v.removeChild(track); } catch { /* noop */ }
    };
  }, [videoRef, useNativeTrack, vttBlobUrl, sourceLang]);

  // Inject ::cue size styles globally (only once per size change)
  // applies to all native <track> renders in the document.

  // Custom overlay timing — only used when NOT using native track (translations)
  const indexRef = useRef(0);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !enabled || useNativeTrack || !activeSegments.length) {
      setCurrentText('');
      return;
    }
    indexRef.current = 0;

    let raf = 0;
    let lastTick = 0;
    const tick = (ts: number) => {
      if (ts - lastTick > 50) {
        lastTick = ts;
        const t = v.currentTime;
        while (
          indexRef.current < activeSegments.length - 1 &&
          activeSegments[indexRef.current].end <= t
        ) indexRef.current++;
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
  }, [videoRef, enabled, activeSegments, useNativeTrack]);

  // Persist preferences
  useEffect(() => {
    try { localStorage.setItem(LS_ENABLED, enabled ? '1' : '0'); } catch { /* noop */ }
  }, [enabled]);
  useEffect(() => {
    try { localStorage.setItem(LS_LANG, lang); } catch { /* noop */ }
  }, [lang]);
  useEffect(() => {
    try { localStorage.setItem(LS_SIZE, size); } catch { /* noop */ }
  }, [size]);

  // Inject ::cue size styles for native <track> rendering
  const sizePxValue = SIZE_PRESETS.find((s) => s.key === size)?.px ?? 15;
  useEffect(() => {
    const id = 'lovable-cue-size-style';
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = `video::cue { font-size: ${sizePxValue}px; background: rgba(0,0,0,0.4); color: #fff; line-height: 1.3; }`;
  }, [sizePxValue]);

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

  const sizePx = SIZE_PRESETS.find((s) => s.key === size)?.px ?? 15;

  return (
    <>
      {/* Caption text */}
      {enabled && currentText && (
        <div
          className="absolute left-0 right-0 bottom-16 z-20 pointer-events-none px-3 text-center"
        >
          <span
            className="block w-full bg-black/60 backdrop-blur-[24px] border border-white/10 text-white font-medium px-3 py-1.5 rounded-xl whitespace-nowrap overflow-hidden text-ellipsis"
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)', fontSize: `${sizePx}px`, lineHeight: 1.2 }}
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
              'z-20 h-8 w-8 rounded-lg bg-black/60 backdrop-blur-[24px] border border-white/10 flex items-center justify-center transition-opacity duration-200',
              buttonVisible || open ? 'opacity-80 hover:opacity-100' : 'opacity-0 pointer-events-none',
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
              <div className="flex items-center gap-1.5">
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
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowSettings((v) => !v); }}
                  aria-label="Subtitle settings"
                  className={cn(
                    'h-5 w-5 rounded-md border flex items-center justify-center',
                    showSettings
                      ? 'bg-white/15 text-white border-white/20'
                      : 'bg-transparent text-white/60 border-white/10 hover:text-white hover:bg-white/10',
                  )}
                >
                  <Settings2 className="w-3 h-3" />
                </button>
              </div>
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
          {showSettings && (
            <div className="p-2 border-b border-white/10">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] text-white/60">Text size</span>
                <span className="text-[11px] text-white/80">
                  {SIZE_PRESETS.find((s) => s.key === size)?.label}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const idx = SIZE_PRESETS.findIndex((s) => s.key === size);
                    if (idx > 0) setSize(SIZE_PRESETS[idx - 1].key);
                  }}
                  className="h-6 w-6 rounded-md border border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10 flex items-center justify-center"
                  aria-label="Smaller"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <div className="flex-1 flex items-center gap-1">
                  {SIZE_PRESETS.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setSize(s.key); }}
                      className={cn(
                        'flex-1 h-6 rounded-md border text-[10px] font-medium transition',
                        size === s.key
                          ? 'bg-white/20 text-white border-white/30'
                          : 'bg-transparent text-white/60 border-white/10 hover:bg-white/5',
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const idx = SIZE_PRESETS.findIndex((s) => s.key === size);
                    if (idx < SIZE_PRESETS.length - 1) setSize(SIZE_PRESETS[idx + 1].key);
                  }}
                  className="h-6 w-6 rounded-md border border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10 flex items-center justify-center"
                  aria-label="Larger"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <div className="mt-2 rounded-md bg-black/50 border border-white/10 px-2 py-1.5 text-center">
                <span
                  className="text-white font-medium"
                  style={{ fontSize: `${sizePx}px`, textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
                >
                  Preview
                </span>
              </div>
            </div>
          )}
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
