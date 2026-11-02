import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** The server's limit (dehub-stream-backend src/nft/media-descriptions), and Mastodon's. */
export const ALT_TEXT_MAX = 1500;

/**
 * The ALT pill on a composer preview. Outlined until the media has a
 * description, then a solid white pill with a tick, so a creator can see at a
 * glance that the text was saved. Both looks are pinned in theme-controls.css
 * (data-alt-text) because the theme control material repaints plain pills.
 */
export function AltTextButton({ hasText, onClick, className }: { hasText: boolean; onClick: () => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={hasText ? t('altText.edit') : t('altText.add')}
      title={hasText ? t('altText.edit') : t('altText.add')}
      data-alt-text={hasText ? 'set' : 'empty'}
      aria-pressed={hasText}
      data-keep-dark
      data-on-media
      className={cn(
        'z-20 inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-[11px] font-bold tracking-wide transition-colors',
        hasText
          ? 'bg-white text-black hover:bg-white/90'
          : 'bg-black/70 text-white border border-white/30 hover:bg-black/85',
        className,
      )}
    >
      {hasText && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
      {t('altText.badge', { defaultValue: 'ALT' })}
    </button>
  );
}

interface AltTextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'image' | 'video';
  previewSrc?: string;
  initial?: string;
  onSave: (text: string) => void;
}

/** Writing one description. Saving an empty box clears it. */
export function AltTextDialog({ open, onOpenChange, kind, previewSrc, initial, onSave }: AltTextDialogProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(initial ?? '');
  useEffect(() => { if (open) setDraft(initial ?? ''); }, [open, initial]);

  const save = () => {
    onSave(draft.slice(0, ALT_TEXT_MAX));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{kind === 'video' ? t('altText.titleVideo') : t('altText.titleImage')}</DialogTitle>
          <DialogDescription>{t('altText.help')}</DialogDescription>
        </DialogHeader>
        {previewSrc && kind === 'image' && (
          <img src={previewSrc} alt="" className="max-h-48 w-full rounded-xl object-contain bg-black/40" />
        )}
        <textarea
          autoFocus
          value={draft}
          maxLength={ALT_TEXT_MAX}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); }}
          placeholder={t('altText.placeholder')}
          rows={5}
          className="w-full resize-none rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white outline-none focus:border-white/40"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-white/50 tabular-nums">{draft.length} / {ALT_TEXT_MAX}</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-xl px-4 py-2 text-sm text-white/80 hover:bg-white/10">
              {t('common.cancel')}
            </button>
            <button type="button" onClick={save} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90">
              {t('common.save')}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
