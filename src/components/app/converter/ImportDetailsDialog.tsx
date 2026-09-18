/**
 * Review one import before it posts.
 * ==================================
 *
 * Pasting a link used to queue it immediately, and whatever the source called
 * the video became the post's title. That is fine for a back catalogue and
 * wrong for the thing someone actually wants on their profile — a YouTube
 * title carrying "| FULL EPISODE 4K" is not what they would have typed.
 *
 * So a single import opens this first, with the real title and description
 * already in it. The metadata comes from the server's preview endpoint, which
 * reads the link without downloading any of it.
 *
 * **It is not the post composer.** The composer uploads local files and mints
 * through `/api/user_mint`; an imported video's bytes only ever exist on the
 * server, so there is nothing to hand it. This collects the same fields and
 * posts them to the import endpoint, which already accepted `name` and
 * `description` and was simply never given them.
 *
 * Opening empty is a valid outcome. If the preview cannot read the link — a
 * rate limit, a source having a bad day — the fields stay blank and Import
 * still works, because the queue retries on its own schedule and the server
 * falls back to the source's own title. Blocking the dialog on a metadata
 * fetch would make a slow preview look like a broken importer.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RotateCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { previewImport, type ImportPreview } from '@/lib/api/dehub/youtube-import';
import type { MediaKind } from '@/lib/converter-sources';

export interface ImportDetails {
  name: string;
  description: string;
  rotation: 0 | 90 | 180 | 270;
}

interface Props {
  open: boolean;
  /** The link being imported. Null closes the dialog. */
  url: string | null;
  /** What it will publish as, so the dialog can say so rather than making
   * someone remember which button they pressed on the page behind it. */
  mediaKind: MediaKind;
  onCancel: () => void;
  onConfirm: (details: ImportDetails) => void;
}

export function ImportDetailsDialog({ open, url, mediaKind, onCancel, onConfirm }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  // Keyed on the URL rather than on `open`: reopening the dialog for a
  // different link has to refetch, and reopening it for the same one should
  // not throw away edits someone already made.
  useEffect(() => {
    if (!open || !url) return;
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    setName('');
    setDescription('');
    setRotation(0);

    previewImport(url)
      .then(result => {
        if (cancelled) return;
        setPreview(result);
        setName(result.title || '');
        setDescription(result.description || '');
      })
      // Deliberately silent. The fields stay empty, Import still works, and a
      // toast about metadata would be noise on top of a dialog that is
      // already usable.
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, url]);

  const kindLabel = t(`converter.kind${mediaKind[0].toUpperCase()}${mediaKind.slice(1)}`);

  return (
    <Dialog open={open} onOpenChange={next => !next && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('converter.reviewTitle')}</DialogTitle>
          <DialogDescription>
            {t('converter.reviewSubtitle', {
              source: preview?.sourceLabel || t('converter.thatSource'),
              kind: kindLabel,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-zinc-400" htmlFor="import-name">
              {t('converter.reviewName')}
            </label>
            <div className="relative">
              <Input
                id="import-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={loading ? '' : t('converter.reviewNamePlaceholder')}
                disabled={loading}
              />
              {loading && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-500" />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-zinc-400" htmlFor="import-description">
              {t('converter.reviewDescription')}
            </label>
            <Textarea
              id="import-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={loading ? '' : t('converter.reviewDescriptionPlaceholder')}
              rows={5}
              disabled={loading}
              className="resize-none"
            />
          </div>

          {mediaKind === 'video' && (
            <div className="flex items-center gap-2">
              <RotateCw className="h-4 w-4 text-zinc-400" aria-hidden="true" />
              {([0, 90, 180, 270] as const).map(degrees => (
                <Button key={degrees} type="button" variant={rotation === degrees ? 'glass' : 'ghost'} aria-pressed={rotation === degrees} onClick={() => setRotation(degrees)}>
                  {degrees}°
                </Button>
              ))}
            </div>
          )}

          {/* Only shown when the preview came back and said so. A live stream
              cannot be imported at all, and finding that out after queueing is
              a wasted trip. */}
          {preview?.isLive && (
            <p className="text-xs text-amber-400">{t('converter.reviewLiveWarning')}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            {t('converter.reviewCancel')}
          </Button>
          <Button
            variant="glass"
            onClick={() => onConfirm({ name: name.trim(), description: description.trim(), rotation: mediaKind === 'video' ? rotation : 0 })}
          >
            {t('converter.reviewConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
