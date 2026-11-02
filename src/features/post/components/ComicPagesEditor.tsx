/**
 * The Comic tab's page list: add pages, put them in order, and give each one
 * a caption (shown on the card) and alt text (read out to people who cannot
 * see it). The first page is the cover.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { MediaFile } from '../types';
import { ALT_TEXT_MAX } from './AltTextEditor';

const CAPTION_MAX = 500;

interface ComicPagesEditorProps {
  media: MediaFile[];
  limit: number;
  onAddPages: (files: File[]) => void | Promise<void>;
  onRemove: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onCaption: (index: number, caption: string) => void;
  onAlt: (index: number, alt: string) => void;
}

export function ComicPagesEditor({ media, limit, onAddPages, onRemove, onMove, onCaption, onAlt }: ComicPagesEditorProps) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const pages = media.filter(m => m.type === 'image');
  const other = media.length - pages.length;

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setAdding(true);
    try { await onAddPages(Array.from(files)); } finally { setAdding(false); }
  };

  return (
    <div className="mt-2 space-y-2" data-comic-editor>
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>{t('comic.editor.count', { defaultValue: '{{count}} of {{limit}} pages', count: pages.length, limit })}</span>
        {pages.length > 1 ? <span>{t('comic.editor.order', { defaultValue: 'Drag to reorder. Page 1 is the cover.' })}</span> : null}
      </div>

      {other > 0 ? (
        <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          {t('comic.editor.photosOnly', { defaultValue: 'Comics are photos only. Remove the video or audio to post it as a comic.' })}
        </p>
      ) : null}

      <ol className="space-y-2">
        {media.map((m, i) => m.type !== 'image' ? null : (
          <li
            key={m.preview}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragFrom !== null && dragFrom !== i) onMove(dragFrom, i); setDragFrom(null); }}
            onDragEnd={() => setDragFrom(null)}
            className={cn('flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-2', dragFrom === i && 'opacity-50')}
          >
            <div className="flex w-16 shrink-0 flex-col items-center gap-1">
              <img src={m.preview} alt="" className="h-20 w-16 cursor-grab rounded-lg object-cover" />
              <span className="font-mono text-[10px] text-white/50">{i === 0 ? t('comic.editor.cover', { defaultValue: 'Cover' }) : String(i + 1).padStart(2, '0')}</span>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <textarea
                value={m.caption ?? ''}
                onChange={(e) => onCaption(i, e.target.value.slice(0, CAPTION_MAX))}
                maxLength={CAPTION_MAX}
                rows={2}
                placeholder={t('comic.editor.caption', { defaultValue: 'Caption for this page' })}
                className="w-full resize-none rounded-lg bg-black/20 px-2 py-1.5 text-sm text-white outline-none placeholder:text-white/40 focus:ring-1 focus:ring-white/30"
              />
              <AltField
                value={m.description ?? ''}
                onCommit={(alt) => onAlt(i, alt)}
                placeholder={t('comic.editor.alt', { defaultValue: 'Alt text: what the page shows' })}
              />
            </div>
            <div className="flex shrink-0 flex-col items-center justify-between gap-1 text-white/60">
              <button type="button" className="rounded-md px-1.5 text-sm hover:text-white disabled:opacity-30" disabled={i === 0} onClick={() => onMove(i, i - 1)} aria-label={t('comic.editor.up', { defaultValue: 'Move page up' })}>↑</button>
              <button type="button" className="rounded-md px-1.5 text-sm hover:text-white" onClick={() => onRemove(i)} aria-label={t('comic.editor.remove', { defaultValue: 'Remove page' })}>✕</button>
              <button type="button" className="rounded-md px-1.5 text-sm hover:text-white disabled:opacity-30" disabled={i === media.length - 1} onClick={() => onMove(i, i + 1)} aria-label={t('comic.editor.down', { defaultValue: 'Move page down' })}>↓</button>
            </div>
          </li>
        ))}
      </ol>

      {pages.length < limit ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={adding}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/25 py-4 text-sm font-medium text-white/80 hover:border-white/50 hover:text-white disabled:opacity-60"
        >
          {adding
            ? t('comic.editor.adding', { defaultValue: 'Adding pages…' })
            : pages.length
              ? t('comic.editor.more', { defaultValue: 'Add more pages' })
              : t('comic.editor.add', { defaultValue: 'Add comic pages' })}
        </button>
      ) : null}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => { void add(e.target.files); e.target.value = ''; }}
      />
    </div>
  );
}

/** Alt text is saved trimmed, so it is typed into a local draft and saved on blur. */
function AltField({ value, onCommit, placeholder }: { value: string; onCommit: (alt: string) => void; placeholder: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value.slice(0, ALT_TEXT_MAX))}
      onBlur={() => { if (draft.trim() !== value) onCommit(draft); }}
      maxLength={ALT_TEXT_MAX}
      placeholder={placeholder}
      className="w-full rounded-lg bg-black/20 px-2 py-1.5 text-xs text-white outline-none placeholder:text-white/40 focus:ring-1 focus:ring-white/30"
    />
  );
}
