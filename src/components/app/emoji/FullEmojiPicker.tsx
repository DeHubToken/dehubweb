/**
 * Full emoji picker panel.
 *
 * Every Unicode emoji (all groups, every skin tone, flags), searchable by name,
 * keyword or any Slack/GitHub/Discord shortcode, plus the platform's custom
 * emoji and a way to add more. The pickers used to carry a hand-picked list of
 * 80; anything outside it could only be typed with a system keyboard, and
 * custom emoji could not be used at all.
 *
 * This is only the panel — callers put it in whatever popover, sheet or tray
 * they already have. `onSelect` gets a Unicode string for a standard emoji and
 * `:shortcode:` for a custom one; both render correctly anywhere text is shown
 * (see EmojiText).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Loader2, Plus, Search, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  EMOJI_GROUPS,
  SKIN_TONES,
  loadEmojiIndex,
  searchEmoji,
  withSkinTone,
  type EmojiEntry,
  type EmojiGroupId,
  type EmojiIndex,
} from '@/lib/emoji/emoji-data';
import type { CustomEmoji } from '@/lib/emoji/custom-emoji';
import { EmojiImage, InlineEmoji, useCustomEmojis } from './EmojiText';
import { AddCustomEmojiPanel } from './AddCustomEmojiPanel';

const RECENT_KEY = 'dehub_recent_emoji';
const TONE_KEY = 'dehub_emoji_skin_tone';
const MAX_RECENT = 32;

type Tab = 'recent' | 'custom' | EmojiGroupId;

const GROUP_ICON: Record<EmojiGroupId, string> = {
  0: '😀', 1: '👋', 3: '🐻', 4: '🍔', 5: '✈️', 6: '⚽', 7: '💡', 8: '❤️', 9: '🏁',
};
const GROUP_KEY: Record<EmojiGroupId, string> = {
  0: 'smileys', 1: 'people', 3: 'nature', 4: 'food', 5: 'travel', 6: 'activities', 7: 'objects', 8: 'symbols', 9: 'flags',
};

function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeStore(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

interface FullEmojiPickerProps {
  onSelect: (value: string) => void;
  className?: string;
  /** Grid height in px; the panel is otherwise as wide as its container. */
  height?: number;
}

export function FullEmojiPicker({ onSelect, className, height = 256 }: FullEmojiPickerProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState<EmojiIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>(() => readStore<string[]>(RECENT_KEY, []));
  const [tone, setTone] = useState<number>(() => readStore<number>(TONE_KEY, 0));
  const [tab, setTab] = useState<Tab>(() => (readStore<string[]>(RECENT_KEY, []).length ? 'recent' : 0));
  const [variantsFor, setVariantsFor] = useState<EmojiEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const custom = useCustomEmojis();
  const gridRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  useEffect(() => {
    let live = true;
    loadEmojiIndex().then((i) => live && setIndex(i), () => live && setFailed(true));
    return () => { live = false; };
  }, []);

  useEffect(() => {
    gridRef.current?.scrollTo({ top: 0 });
    setVariantsFor(null);
  }, [tab, query]);

  const pick = (value: string) => {
    const next = [value, ...recent.filter((r) => r !== value)].slice(0, MAX_RECENT);
    setRecent(next);
    writeStore(RECENT_KEY, next);
    setVariantsFor(null);
    onSelect(value);
  };

  const q = query.trim().toLowerCase().replace(/^:|:$/g, '');
  const customMatches = useMemo(
    () => (q ? custom.filter((c) => c.shortcode.includes(q)) : custom),
    [custom, q],
  );
  const standardMatches = useMemo(() => (index && q ? searchEmoji(index, q) : []), [index, q]);

  const startPress = (e: EmojiEntry) => {
    longPressed.current = false;
    if (!e.skins?.length) return;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setVariantsFor(e);
    }, 420);
  };
  const endPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const renderStandard = (e: EmojiEntry) => {
    const value = withSkinTone(e, tone);
    return (
      <button
        key={e.unicode}
        type="button"
        title={`${e.label}${e.shortcodes[0] ? `  :${e.shortcodes[0]}:` : ''}`}
        aria-label={e.label}
        onPointerDown={() => startPress(e)}
        onPointerUp={endPress}
        onPointerLeave={endPress}
        onContextMenu={(ev) => {
          if (!e.skins?.length) return;
          ev.preventDefault();
          setVariantsFor(e);
        }}
        onClick={() => {
          if (longPressed.current) { longPressed.current = false; return; }
          pick(value);
        }}
        className="relative w-8 h-8 flex items-center justify-center text-xl leading-none hover:bg-white/10 rounded transition-colors"
      >
        {value}
        {e.skins?.length ? <span className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-white/30" /> : null}
      </button>
    );
  };

  const renderCustom = (c: CustomEmoji) => (
    <button
      key={c.id}
      type="button"
      title={`:${c.shortcode}:`}
      aria-label={c.shortcode}
      onClick={() => pick(`:${c.shortcode}:`)}
      className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded transition-colors"
    >
      <EmojiImage src={c.image_url} name={c.shortcode} className="h-6 max-w-7 m-0 align-middle" />
    </button>
  );

  const renderRecent = (value: string) => (
    <button
      key={value}
      type="button"
      title={value.startsWith(':') ? value : undefined}
      onClick={() => pick(value)}
      className="w-8 h-8 flex items-center justify-center text-xl leading-none hover:bg-white/10 rounded transition-colors"
    >
      <InlineEmoji value={value} className="h-6 max-w-7 m-0 align-middle" />
    </button>
  );

  const heading = (text: string) => (
    <div className="col-span-full px-1 pt-1 pb-0.5 text-[10px] uppercase tracking-wide text-zinc-500">{text}</div>
  );

  let body: React.ReactNode;
  if (adding) {
    // Inline rather than a dialog: a dialog portals outside the popover the
    // picker usually lives in, and the popover closes on that outside press —
    // unmounting the form mid-upload.
    body = <AddCustomEmojiPanel onDone={() => { setAdding(false); setTab('custom'); }} />;
  } else if (failed) {
    body = <p className="p-4 text-center text-xs text-zinc-400">{t('emojiPicker.loadFailed')}</p>;
  } else if (!index) {
    body = <div className="flex h-full items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>;
  } else if (q) {
    body = customMatches.length || standardMatches.length ? (
      <div className="grid grid-cols-8 gap-0.5">
        {customMatches.length > 0 && heading(t('emojiPicker.custom'))}
        {customMatches.map(renderCustom)}
        {customMatches.length > 0 && standardMatches.length > 0 && heading(t('emojiPicker.emoji'))}
        {standardMatches.map(renderStandard)}
      </div>
    ) : (
      <p className="p-4 text-center text-xs text-zinc-400">{t('emojiPicker.noResults')}</p>
    );
  } else if (tab === 'recent') {
    body = recent.length ? (
      <div className="grid grid-cols-8 gap-0.5">{recent.map(renderRecent)}</div>
    ) : (
      <p className="p-4 text-center text-xs text-zinc-400">{t('emojiPicker.noRecent')}</p>
    );
  } else if (tab === 'custom') {
    body = (
      <div className="grid grid-cols-8 gap-0.5">
        <button
          type="button"
          onClick={() => setAdding(true)}
          title={t('emojiPicker.addCustom')}
          aria-label={t('emojiPicker.addCustom')}
          className="w-8 h-8 flex items-center justify-center rounded border border-dashed border-white/20 text-zinc-400 hover:text-white hover:border-white/40 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
        {custom.map(renderCustom)}
        {custom.length === 0 && (
          <p className="col-span-7 self-center px-2 text-[11px] text-zinc-500">{t('emojiPicker.customEmpty')}</p>
        )}
      </div>
    );
  } else {
    body = <div className="grid grid-cols-8 gap-0.5">{(index.byGroup[tab] ?? []).map(renderStandard)}</div>;
  }

  const tabs: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: 'recent', icon: <Clock className="w-4 h-4" />, label: t('emojiPicker.recent') },
    { id: 'custom', icon: <Sparkles className="w-4 h-4" />, label: t('emojiPicker.custom') },
    ...EMOJI_GROUPS.map((g) => ({ id: g as Tab, icon: <span className="text-base leading-none">{GROUP_ICON[g]}</span>, label: t(`emojiPicker.groups.${GROUP_KEY[g]}`) })),
  ];

  return (
    <div className={cn('flex flex-col', className)} onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 p-2 border-b border-white/10">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('emojiPicker.search')}
            aria-label={t('emojiPicker.search')}
            className="w-full h-8 pl-7 pr-2 rounded-md bg-white/5 border border-white/10 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-white/30"
          />
        </div>
        <div className="flex items-center gap-0.5" role="radiogroup" aria-label={t('emojiPicker.skinTone')}>
          {SKIN_TONES.map((mod, i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={tone === i}
              title={t('emojiPicker.skinTone')}
              onClick={() => { setTone(i); writeStore(TONE_KEY, i); }}
              className={cn('w-5 h-5 text-sm leading-none rounded-full flex items-center justify-center', tone === i ? 'bg-white/20' : 'opacity-60 hover:opacity-100')}
            >
              {`👋${mod}`}
            </button>
          ))}
        </div>
      </div>

      {!q && !adding && (
        <div className="flex border-b border-white/10 overflow-x-auto scrollbar-none">
          {tabs.map((tb) => (
            <button
              key={String(tb.id)}
              type="button"
              title={tb.label}
              aria-label={tb.label}
              onClick={() => setTab(tb.id)}
              className={cn(
                'flex-shrink-0 w-9 h-9 flex items-center justify-center transition-colors',
                tab === tb.id ? 'text-white border-b-2 border-white' : 'text-zinc-400 hover:text-white opacity-70 hover:opacity-100',
              )}
            >
              {tb.icon}
            </button>
          ))}
        </div>
      )}

      {variantsFor?.skins && (
        <div className="flex flex-wrap gap-0.5 p-1.5 border-b border-white/10 bg-white/5">
          {[variantsFor.unicode, ...variantsFor.skins].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => pick(v)}
              className="w-8 h-8 flex items-center justify-center text-xl leading-none hover:bg-white/10 rounded"
            >
              {v}
            </button>
          ))}
        </div>
      )}

      <div ref={gridRef} className="p-1.5 overflow-y-auto overscroll-contain" style={{ height }}>
        {body}
      </div>

    </div>
  );
}
