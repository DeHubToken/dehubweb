import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bookmark, ChevronUp, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FEED_FILTER_LINE_SAVE_EVENT, MAX_PRESET_NAME } from '@/lib/feed-presets';

export interface FeedFilterLineItem {
  key: string;
  /** Small grey word before the value when the line is open: Type, Tag, Date… */
  group: string;
  label: string;
  onRemove: () => void;
}

/**
 * Phone feeds: every active filter in one line, where the hashtag bar sits.
 * Reads as plain words ("Articles · #music · 1w · Most liked") and cuts off
 * with … when full. Tap it to open it in place and drop filters one by one;
 * the bookmark saves the set as a preset, the ✕ clears everything.
 *
 * Same surface classes as FollowTagBar so every theme paints the two alike.
 */
export function FeedFilterLine({
  items,
  presetName,
  onClearAll,
  onSavePreset,
  className,
}: {
  items: FeedFilterLineItem[];
  /** Name of the saved preset these filters match, if any. */
  presetName?: string | null;
  onClearAll: () => void;
  onSavePreset: (name: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Tap anywhere else folds it back to one line.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSaving(false);
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  // "+ Save current" in the filter panel opens this line in save mode.
  useEffect(() => {
    const onAsk = () => { setName(presetName ?? ''); setOpen(true); setSaving(true); };
    window.addEventListener(FEED_FILTER_LINE_SAVE_EVENT, onAsk);
    return () => window.removeEventListener(FEED_FILTER_LINE_SAVE_EVENT, onAsk);
  }, [presetName]);

  useEffect(() => {
    if (saving) inputRef.current?.focus({ preventScroll: true });
  }, [saving]);

  if (items.length === 0) return null;

  const startSave = () => {
    setName(presetName ?? '');
    setOpen(true);
    setSaving(true);
  };
  const commitSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSavePreset(trimmed);
    setSaving(false);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      data-feed-filter-line
      data-open={open ? 'true' : undefined}
      className={cn(
        'rounded-xl border border-white/10 bg-black/80 backdrop-blur-xl',
        open && 'border-white/20 shadow-[0_18px_40px_rgba(0,0,0,0.35)]',
        className,
      )}
    >
      <div className="flex items-center gap-2 py-1.5 pl-3 pr-1.5">
        <SlidersHorizontal className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />
        {open ? (
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
            {presetName ?? t('feedFilters.count', { count: items.length, defaultValue: '{{count}} filters on' })}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={false}
            aria-label={t('feedFilters.show', 'Show filters')}
            className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-white"
          >
            {presetName && (
              <>
                <span>{presetName}</span>
                <span className="text-zinc-500"> · </span>
              </>
            )}
            {items.map((item, i) => (
              <span key={item.key}>
                {i > 0 && <span className="text-zinc-500"> · </span>}
                {item.label}
              </span>
            ))}
          </button>
        )}
        {open ? (
          <button
            type="button"
            onClick={() => { setOpen(false); setSaving(false); }}
            aria-label={t('feedFilters.collapse', 'Hide filters')}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white [@media(hover:hover)]:hover:bg-white/10"
          >
            <ChevronUp className="size-4" />
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={startSave}
              aria-label={t('feedFilters.savePreset', 'Save as preset')}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white [@media(hover:hover)]:hover:bg-white/10"
            >
              <Bookmark className={cn('size-4', presetName && 'fill-current')} />
            </button>
            <button
              type="button"
              onClick={onClearAll}
              aria-label={t('feedFilters.clearAll', 'Clear all filters')}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/20 text-white [@media(hover:hover)]:hover:bg-white/10"
            >
              <X className="size-3.5" />
            </button>
          </>
        )}
      </div>

      {open && (
        <div className="px-3 pb-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={item.onRemove}
                aria-label={t('feedFilters.remove', { label: item.label, defaultValue: 'Remove {{label}}' })}
                className="flex h-8 items-center gap-1.5 text-sm font-semibold text-white"
              >
                <span className="text-[11px] font-medium text-zinc-500">{item.group}</span>
                {item.label}
                <X className="size-3 text-zinc-500" aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="my-2 h-px bg-white/10" />
          {saving ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); commitSave(); }}
            >
              <input
                ref={inputRef}
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, MAX_PRESET_NAME))}
                placeholder={t('feedFilters.presetName', 'Preset name')}
                aria-label={t('feedFilters.presetName', 'Preset name')}
                className="h-8 min-w-0 flex-1 rounded-md border border-white/20 bg-transparent px-2.5 text-base text-white placeholder:text-zinc-500 focus:border-white/40 focus:outline-none"
                enterKeyHint="done"
              />
              <button
                type="submit"
                disabled={!name.trim()}
                className="h-8 shrink-0 rounded-md bg-white px-3 text-xs font-semibold text-black disabled:opacity-50"
              >
                {t('feedFilters.save', 'Save')}
              </button>
            </form>
          ) : (
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => { setOpen(false); onClearAll(); }}
                className="h-8 text-xs font-semibold text-zinc-400 [@media(hover:hover)]:hover:text-white"
              >
                {t('feedFilters.clearAllShort', 'Clear all')}
              </button>
              <button
                type="button"
                onClick={startSave}
                className="flex h-8 items-center gap-1.5 rounded-md bg-white px-3 text-xs font-semibold text-black"
              >
                <Bookmark className="size-3.5" aria-hidden="true" />
                {presetName ? t('feedFilters.updatePreset', 'Rename preset') : t('feedFilters.savePreset', 'Save as preset')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * "My presets" row for the top of the phone filter panel. Tap applies one; Edit
 * shows an ✕ on each to delete it.
 */
export function FeedPresetsRow({
  presets,
  activeName,
  onApply,
  onDelete,
  onSaveCurrent,
  canSaveCurrent,
}: {
  presets: { name: string }[];
  activeName?: string | null;
  onApply: (name: string) => void;
  onDelete: (name: string) => void;
  onSaveCurrent: (name: string) => void;
  canSaveCurrent: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const commit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSaveCurrent(trimmed);
    setNaming(false);
    setName('');
  };
  if (presets.length === 0 && !canSaveCurrent) return null;

  return (
    <div data-feed-presets className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-zinc-500">{t('feedFilters.myPresets', 'My presets')}</span>
        {presets.length > 0 && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="px-1 text-xs font-semibold text-zinc-500 [@media(hover:hover)]:hover:text-white"
          >
            {editing ? t('feedFilters.done', 'Done') : t('feedFilters.edit', 'Edit')}
          </button>
        )}
      </div>
      <div className="-mr-4 flex gap-1.5 overflow-x-auto pr-4 scrollbar-hide">
        {presets.map((p) => {
          const active = p.name === activeName;
          return (
            <button
              key={p.name}
              type="button"
              data-filter-chip
              data-active={active ? 'true' : undefined}
              onClick={() => (editing ? onDelete(p.name) : onApply(p.name))}
              aria-label={editing ? t('feedFilters.deletePreset', { name: p.name, defaultValue: 'Delete {{name}}' }) : p.name}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm transition-colors',
                active
                  ? 'border border-white/30 bg-gradient-to-br from-white/20 via-white/10 to-white/5 font-semibold text-white'
                  : 'border border-white/10 text-zinc-400',
              )}
            >
              {p.name}
              {editing && <X className="size-3" aria-hidden="true" />}
            </button>
          );
        })}
        {canSaveCurrent && !editing && (naming ? (
          <form
            className="flex shrink-0 items-center gap-1.5"
            onSubmit={(e) => { e.preventDefault(); commit(); }}
          >
            <input
              autoFocus
              value={name}
              maxLength={MAX_PRESET_NAME}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setNaming(false); }}
              placeholder={t('feedFilters.presetName', 'Preset name')}
              aria-label={t('feedFilters.presetName', 'Preset name')}
              className="h-9 w-36 rounded-xl border border-white/30 bg-transparent px-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!name.trim()}
              className="h-9 shrink-0 rounded-xl bg-white px-3 text-sm font-semibold text-black disabled:opacity-50"
            >
              {t('feedFilters.save', 'Save')}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="shrink-0 rounded-xl border border-dashed border-white/30 px-3 py-2 text-sm text-white"
          >
            {t('feedFilters.saveCurrent', '+ Save current')}
          </button>
        ))}
      </div>
    </div>
  );
}

export default FeedFilterLine;
