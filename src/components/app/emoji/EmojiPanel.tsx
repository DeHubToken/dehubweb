import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Apple,
  Clock,
  Flag,
  Gamepad2,
  Hand,
  Heart,
  Lightbulb,
  Loader2,
  PawPrint,
  Plane,
  Search,
  Smile,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DEHUB_PICKS,
  SKIN_TONE_SWATCHES,
  animatedUrl,
  detectEmojiSupport,
  loadEmojiData,
  loadKeywords,
  pushRecent,
  readRecents,
  readSkinTone,
  searchEmoji,
  withTone,
  writeSkinTone,
  type EmojiDataset,
  type EmojiEntry,
  type EmojiGroup,
  type EmojiKeywords,
  type EmojiSupport,
  type SkinTone,
} from '@/lib/emoji';

type SectionKey = 'recent' | 'dehub' | EmojiGroup;

const SECTION_ICONS: Record<SectionKey, LucideIcon> = {
  recent: Clock,
  dehub: Sparkles,
  smileys: Smile,
  people: Hand,
  animals: PawPrint,
  food: Apple,
  travel: Plane,
  activities: Gamepad2,
  objects: Lightbulb,
  symbols: Heart,
  flags: Flag,
};

const TONE_KEYS = ['default', 'light', 'mediumLight', 'medium', 'mediumDark', 'dark'] as const;

/** Row height of the 8-column grid (h-9 buttons + gap-0.5), for the offscreen size hint. */
const ROW_PX = 38;
const COLS = 8;

/** Hold on an emoji this long before its animated preview is fetched (~190 KB each). */
const ANIMATE_AFTER_MS = 350;

export interface EmojiPanelProps {
  /**
   * Called with the emoji at the chosen skin tone. `keepOpen` is true for a
   * shift-click, so a caller that closes its popover on pick can leave it
   * open while someone strings several together.
   */
  onSelect: (emoji: string, opts: { keepOpen: boolean }) => void;
  /** Emoji to mark as already chosen (a message's existing reactions). */
  selected?: readonly string[];
  className?: string;
  autoFocus?: boolean;
}

/**
 * The whole Unicode emoji set: search in the viewer's language, skin tones,
 * recents, a DeHub picks row, and an animated preview of whatever is under
 * the pointer. Shared by the composer's emoji/GIF popover and the chat
 * reaction trays' "more" button.
 */
export function EmojiPanel({ onSelect, selected, className, autoFocus = true }: EmojiPanelProps) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<EmojiDataset | null>(null);
  const [support, setSupport] = useState<EmojiSupport | null>(null);
  const [keywords, setKeywords] = useState<{ local: EmojiKeywords | null; en: EmojiKeywords | null }>({
    local: null,
    en: null,
  });
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [tone, setTone] = useState<SkinTone>(() => readSkinTone());
  const [toneOpen, setToneOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>(() => readRecents());
  const [active, setActive] = useState<SectionKey>('dehub');
  const [hovered, setHovered] = useState<EmojiEntry | null>(null);
  const [animate, setAnimate] = useState(false);
  const [animFailed, setAnimFailed] = useState<Set<string>>(() => new Set());

  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Partial<Record<SectionKey, HTMLElement | null>>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    loadEmojiData()
      .then(async (d) => {
        if (!alive) return;
        setData(d);
        const s = await detectEmojiSupport(d);
        if (alive) setSupport(s);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    let alive = true;
    loadKeywords(data, i18n.language || 'en').then((k) => alive && setKeywords(k));
    return () => {
      alive = false;
    };
  }, [data, i18n.language]);

  useEffect(() => {
    if (autoFocus) searchRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  // Animated preview only after the pointer rests, so skimming the grid
  // never pulls a stream of 190 KB files.
  useEffect(() => {
    setAnimate(false);
    if (!hovered?.anim) return;
    const id = setTimeout(() => setAnimate(true), ANIMATE_AFTER_MS);
    return () => clearTimeout(id);
  }, [hovered]);

  const maxV = support?.maxV ?? 1000;

  const visible = useMemo(() => {
    if (!data) return [];
    return data.entries.filter((e) => e.v <= maxV && (e.group !== 'flags' || support?.flags !== false));
  }, [data, maxV, support]);

  const sections = useMemo(() => {
    if (!data) return [] as Array<{ key: SectionKey; items: EmojiEntry[] }>;
    const pick = (chars: string[]) =>
      chars.map((c) => data.byChar.get(c)).filter((e): e is EmojiEntry => !!e && e.v <= maxV);
    const out: Array<{ key: SectionKey; items: EmojiEntry[] }> = [];
    const recentItems = pick(recents);
    if (recentItems.length) out.push({ key: 'recent', items: recentItems });
    out.push({ key: 'dehub', items: pick(DEHUB_PICKS) });
    const byGroup = new Map<EmojiGroup, EmojiEntry[]>();
    for (const e of visible) {
      const list = byGroup.get(e.group) ?? [];
      list.push(e);
      byGroup.set(e.group, list);
    }
    for (const g of data.groups) {
      const items = byGroup.get(g);
      if (items?.length) out.push({ key: g, items });
    }
    return out;
  }, [data, visible, recents, maxV]);

  const results = useMemo(
    () => (query.trim() ? searchEmoji(query, visible, [keywords.local, keywords.en]) : null),
    [query, visible, keywords],
  );

  const labelFor = useCallback(
    (e: EmojiEntry) => keywords.local?.labels[e.i] || keywords.en?.labels[e.i] || '',
    [keywords],
  );

  const choose = useCallback(
    (e: EmojiEntry, keepOpen: boolean) => {
      setRecents(pushRecent(e.char));
      onSelect(withTone(e, tone, maxV), { keepOpen });
    },
    [onSelect, tone, maxV],
  );

  const jumpTo = (key: SectionKey) => {
    setQuery('');
    setActive(key);
    requestAnimationFrame(() => {
      const el = sectionRefs.current[key];
      const box = scrollRef.current;
      if (el && box) box.scrollTo({ top: el.offsetTop, behavior: 'smooth' });
    });
  };

  // Scroll-spy: the category bar follows whichever section sits at the top.
  const onScroll = () => {
    if (results) return;
    const box = scrollRef.current;
    if (!box) return;
    // Sections are laid out against the scroller itself (it is `relative`).
    const top = box.scrollTop + 8;
    let current: SectionKey = sections[0]?.key ?? 'dehub';
    for (const s of sections) {
      const el = sectionRefs.current[s.key];
      if (el && el.offsetTop <= top) current = s.key;
    }
    if (current !== active) setActive(current);
  };

  const selectedSet = useMemo(() => new Set(selected ?? []), [selected]);

  const renderGrid = (items: EmojiEntry[], keyPrefix: string) => (
    <div className="grid grid-cols-8 gap-0.5 px-1.5">
      {items.map((e) => {
        const ch = withTone(e, tone, maxV);
        const isSelected = selectedSet.has(ch) || selectedSet.has(e.char);
        return (
          <button
            key={`${keyPrefix}-${e.i}`}
            type="button"
            onClick={(ev) => choose(e, ev.shiftKey)}
            onMouseEnter={() => setHovered(e)}
            onFocus={() => setHovered(e)}
            aria-label={labelFor(e) || ch}
            className={cn(
              'h-9 w-full flex items-center justify-center text-[22px] leading-none rounded-lg transition-transform',
              'hover:bg-white/10 hover:scale-110 focus-visible:outline-none focus-visible:bg-white/15',
              isSelected && 'bg-white/15 ring-1 ring-white/30',
            )}
          >
            {ch}
          </button>
        );
      })}
    </div>
  );

  const preview = hovered;
  const previewChar = preview ? withTone(preview, tone, maxV) : null;
  const showAnimated = !!(preview?.anim && animate && !animFailed.has(preview.anim) && (!tone || !preview.skins));

  return (
    <div className={cn('flex flex-col w-full select-none', className)} onMouseLeave={() => setHovered(null)}>
      {/* Search + skin tone */}
      <div className="flex items-center gap-1.5 p-2 border-b border-white/10">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results?.[0]) {
                e.preventDefault();
                choose(results[0], e.shiftKey);
              }
            }}
            placeholder={t('emojiPicker.searchEmoji')}
            aria-label={t('emojiPicker.searchEmoji')}
            className="w-full h-8 pl-8 pr-7 rounded-md bg-white/5 border border-white/10 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-white/25"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                searchRef.current?.focus();
              }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-zinc-500 hover:text-white"
              aria-label={t('common.close')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setToneOpen((o) => !o)}
            className="h-8 w-8 flex items-center justify-center rounded-md text-lg hover:bg-white/10"
            aria-label={t('emojiPicker.skinTone')}
            aria-expanded={toneOpen}
            title={t('emojiPicker.skinTone')}
          >
            {SKIN_TONE_SWATCHES[tone]}
          </button>
          {toneOpen && (
            <div className="absolute right-0 top-9 z-10 flex gap-0.5 p-1 rounded-lg bg-zinc-900 border border-white/10 shadow-lg">
              {SKIN_TONE_SWATCHES.map((swatch, i) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => {
                    const next = i as SkinTone;
                    setTone(next);
                    writeSkinTone(next);
                    setToneOpen(false);
                  }}
                  className={cn(
                    'h-8 w-8 flex items-center justify-center rounded-md text-lg hover:bg-white/10',
                    tone === i && 'bg-white/15 ring-1 ring-white/30',
                  )}
                  aria-label={t(`emojiPicker.tone.${TONE_KEYS[i]}`)}
                  title={t(`emojiPicker.tone.${TONE_KEYS[i]}`)}
                >
                  {swatch}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Category bar */}
      <div className="flex items-center justify-between px-1 border-b border-white/10">
        {sections.map((s) => {
          const Icon = SECTION_ICONS[s.key];
          const label = t(`emojiPicker.group.${s.key}`);
          const on = !results && active === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => jumpTo(s.key)}
              className={cn(
                'flex-1 min-w-0 h-8 flex items-center justify-center border-b-2 transition-colors',
                on ? 'text-white border-white' : 'text-zinc-500 border-transparent hover:text-white',
              )}
              aria-label={label}
              title={label}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <div ref={scrollRef} onScroll={onScroll} className="relative h-64 overflow-y-auto overscroll-contain py-1">
        {failed ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            {t('emojiPicker.noEmoji')}
          </div>
        ) : !data ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
          </div>
        ) : results ? (
          results.length ? (
            <>
              <div className="px-2.5 pt-1 pb-1 text-[11px] font-medium text-zinc-500">
                {t('emojiPicker.searchResults')}
              </div>
              {renderGrid(results, 'r')}
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-zinc-500">
              <span className="text-3xl grayscale opacity-60">🔍</span>
              <span className="text-sm">{t('emojiPicker.noEmoji')}</span>
            </div>
          )
        ) : (
          sections.map((s) => (
            <section
              key={s.key}
              ref={(el) => {
                sectionRefs.current[s.key] = el;
              }}
              // Offscreen groups skip layout and paint — and, on Windows, the
              // Noto webfont subsets they would otherwise pull in.
              style={{
                contentVisibility: 'auto',
                containIntrinsicSize: `auto ${Math.ceil(s.items.length / COLS) * ROW_PX + 28}px`,
              }}
            >
              <div className="sticky top-0 z-[1] px-2.5 py-1 text-[11px] font-medium text-zinc-400 bg-zinc-900/90 backdrop-blur-sm">
                {t(`emojiPicker.group.${s.key}`)}
              </div>
              {renderGrid(s.items, s.key)}
            </section>
          ))
        )}
      </div>

      {/* Preview */}
      <div className="flex items-center gap-2.5 h-14 px-3 border-t border-white/10">
        {preview && previewChar ? (
          <>
            <div className="w-10 h-10 flex items-center justify-center text-[32px] leading-none">
              {showAnimated ? (
                <img
                  src={animatedUrl(preview.anim!)}
                  alt={previewChar}
                  width={40}
                  height={40}
                  className="w-10 h-10"
                  onError={() => setAnimFailed((s) => new Set(s).add(preview.anim!))}
                />
              ) : (
                previewChar
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-white first-letter:uppercase">{labelFor(preview) || previewChar}</div>
              <div className="truncate text-[11px] text-zinc-500">{t('emojiPicker.multiPickHint')}</div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <span className="text-2xl leading-none">{withToneChar(data, '👋', tone, maxV)}</span>
            {t('emojiPicker.multiPickHint')}
          </div>
        )}
      </div>
    </div>
  );
}

function withToneChar(data: EmojiDataset | null, ch: string, tone: SkinTone, maxV: number) {
  const e = data?.byChar.get(ch);
  return e ? withTone(e, tone, maxV) : ch;
}
