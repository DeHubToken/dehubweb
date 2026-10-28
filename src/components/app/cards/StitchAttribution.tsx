/**
 * Stitch credit on a video: "Stitched from @creator" on a stitch, linking to
 * the original, and "N Stitches" on an original, opening the list of them.
 * `?stitches=1` on a post link opens the list straight away, so it can be
 * shared with the post's own card and SEO.
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Scissors } from 'lucide-react';

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useStitchCount, useStitchList, useStitchSource } from '@/hooks/use-stitches';
import { buildImageUrl } from '@/lib/media-url';
import { cn } from '@/lib/utils';

const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export function StitchAttribution({ tokenId, postPage = false, className, onNavigate }: {
  tokenId: string | number;
  /** On the post's own page, `?stitches=1` opens the list. */
  postPage?: boolean;
  className?: string;
  /** Called before leaving for another post (e.g. to close a viewer). */
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const source = useStitchSource(tokenId);
  const count = useStitchCount(tokenId);
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const wantsList = postPage && params.get('stitches') === '1';
  useEffect(() => { if (wantsList && count > 0) setOpen(true); }, [wantsList, count]);
  const close = (next: boolean) => {
    setOpen(next);
    if (!next && wantsList) { params.delete('stitches'); setParams(params, { replace: true }); }
  };

  if (!source && count === 0) return null;
  const chip = 'inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs text-white hover:bg-white/15';
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} data-no-navigate onClick={(e) => e.stopPropagation()}>
      {source && (
        <Link to={`/app/post/${source.sourceTokenId}`} onClick={onNavigate} className={chip}>
          <Scissors className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{t('remixLinks.stitch.from', {
            defaultValue: 'Stitched from {{name}}',
            name: source.sourceUsername ? `@${source.sourceUsername}` : shortAddress(source.sourceAddress),
          })}</span>
        </Link>
      )}
      {count > 0 && (
        <button type="button" onClick={() => setOpen(true)} className={chip}>
          <Scissors className="h-3.5 w-3.5 shrink-0" />
          {t('remixLinks.stitch.count', { defaultValue: '{{count}} Stitches', defaultValue_one: '{{count}} Stitch', count })}
        </button>
      )}
      {count > 0 && <StitchesSheet tokenId={tokenId} open={open} onOpenChange={close} onNavigate={onNavigate} />}
    </div>
  );
}

function StitchesSheet({ tokenId, open, onOpenChange, onNavigate }: {
  tokenId: string | number; open: boolean; onOpenChange: (open: boolean) => void; onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useStitchList(tokenId, open);
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh] border-white/10 bg-zinc-950">
        <DrawerHeader>
          <DrawerTitle className="text-white text-lg">{t('remixLinks.stitch.listTitle', 'Stitches')}</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-6">
          {isLoading && <p className="py-6 text-center text-sm text-white/60">{t('common.loading', 'Loading…')}</p>}
          {isError && <p className="py-6 text-center text-sm text-white/60">{t('remixLinks.stitch.listFailed', 'Could not load stitches. Try again.')}</p>}
          {data && !data.length && <p className="py-6 text-center text-sm text-white/60">{t('remixLinks.stitch.listEmpty', 'No stitches yet.')}</p>}
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {data?.map(({ link, post }) => {
              const name = link.remixerUsername || post.minterUsername || shortAddress(link.remixerAddress);
              return (
                <li key={link.id}>
                  <Link to={`/app/post/${link.remixTokenId}`} onClick={() => { onOpenChange(false); onNavigate?.(); }}
                    className="block overflow-hidden rounded-xl bg-white/5 hover:bg-white/10">
                    <img src={buildImageUrl(post.tokenId, post.imageUrl || post.thumbnail_url)} alt={post.name || ''}
                      loading="lazy" className="aspect-[9/16] w-full object-cover" />
                    <div className="p-2">
                      <p className="truncate text-xs font-medium text-white">@{name}</p>
                      {post.name && <p className="truncate text-xs text-white/60">{post.name}</p>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
