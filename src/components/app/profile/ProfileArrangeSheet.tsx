/**
 * Profile Arrange Sheet
 * =====================
 * Where a creator drags their own posts into the order visitors see first.
 *
 * A grid of the creator's posts, like the profile grid itself. Hold a post and
 * drag it to its new place, the same hold, lift and slide as rearranging the
 * menu (hooks/use-drag-reorder); the sheet scrolls when the finger nears its
 * edge. Saving sends the whole list; the profile then opens in this order for
 * everyone, with Newest, Oldest, Most viewed and Most liked one tap away.
 *
 * A drawer on phones and a dialog on computers, both glass like the filters
 * panel beside it.
 *
 * @module components/app/profile/ProfileArrangeSheet
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDragReorder } from '@/hooks/use-drag-reorder';
import { getAuthToken } from '@/lib/api/dehub';
import { DEHUB_API_BASE } from '@/lib/api/dehub/core';
import { saveProfileOrder, PROFILE_ORDER_MAX } from '@/lib/api/dehub/profile-order';
import { separateUserContent } from '@/hooks/use-dehub-profile';
import './profile-arrange.css';

export interface ArrangeRow {
  tokenId: number;
  title: string;
  image?: string;
  kind: 'video' | 'image' | 'text' | 'live';
}

/** Enough for almost every channel; older posts keep their place after these. */
const LOAD_LIMIT = 300;
const PAGE_SIZE = 50;

const tokenIdOf = (id: string | undefined): number => Number(/(\d+)$/.exec(id ?? '')?.[1] ?? NaN);
const plain = (text: string | undefined): string => (text ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** The creator's posts in the order the profile shows them now. */
async function loadRows(address: string, signal: AbortSignal): Promise<ArrangeRow[]> {
  const rows: ArrangeRow[] = [];
  const token = getAuthToken();
  for (let page = 1; rows.length < LOAD_LIMIT; page += 1) {
    const url = new URL('/api/feed', DEHUB_API_BASE);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('minter', address);
    url.searchParams.set('sortBy', 'custom');
    url.searchParams.set('status', 'all');
    const response = await fetch(url.toString(), {
      signal,
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!response.ok) throw new Error(`Feed API error: ${response.status}`);
    const json = await response.json();
    const items: Array<{ tokenId?: number | string }> = json.result || [];
    // The mappers know where each kind of post keeps its picture and words;
    // the server's order is put back afterwards.
    const mapped = separateUserContent(items as never);
    const byToken = new Map<number, ArrangeRow>();
    mapped.videos.forEach((v) => byToken.set(tokenIdOf(v.id), { tokenId: tokenIdOf(v.id), title: plain(v.title), image: v.thumbnail, kind: 'video' }));
    mapped.lives.forEach((v) => byToken.set(tokenIdOf(v.id), { tokenId: tokenIdOf(v.id), title: plain(v.title), image: v.thumbnail, kind: 'live' }));
    mapped.images.forEach((p) => byToken.set(tokenIdOf(p.id), { tokenId: tokenIdOf(p.id), title: plain(p.caption || p.title), image: p.imageUrls?.[0] || p.image, kind: 'image' }));
    mapped.posts.forEach((p) => byToken.set(tokenIdOf(p.id), { tokenId: tokenIdOf(p.id), title: plain(p.title || p.content), kind: 'text' }));
    for (const item of items) {
      const row = byToken.get(Number(item.tokenId));
      if (row && !rows.some((r) => r.tokenId === row.tokenId)) rows.push(row);
    }
    if (!json.pagination?.hasMore || items.length === 0) break;
  }
  return rows.slice(0, Math.min(LOAD_LIMIT, PROFILE_ORDER_MAX));
}

const liftedClass = 'pa-tile--lifted';

interface ProfileArrangeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The creator's wallet address. */
  address: string;
  /** Whether a saved order exists already — shows the way back to newest first. */
  hasCustomOrder: boolean;
  /** Called after a save or a reset, with whether an order is now in place. */
  onSaved: (hasCustomOrder: boolean) => void;
  /** State gallery: show these rows and save nothing. */
  preview?: ArrangeRow[];
}

export function ProfileArrangeSheet({ open, onOpenChange, address, hasCustomOrder, onSaved, preview }: ProfileArrangeSheetProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<ArrangeRow[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (preview) { setRows(preview); setState('ready'); return; }
    if (!address) return;
    const abort = new AbortController();
    setState('loading');
    loadRows(address, abort.signal)
      .then((loaded) => { setRows(loaded); setState('ready'); })
      .catch(() => { if (!abort.signal.aborted) setState('failed'); });
    return () => abort.abort();
  }, [open, address, preview]);

  const ids = useMemo(() => rows.map((r) => String(r.tokenId)), [rows]);
  const byId = useMemo(() => new Map(rows.map((r) => [String(r.tokenId), r])), [rows]);
  const onCommit = useCallback((next: string[]) => {
    setRows((current) => {
      const map = new Map(current.map((r) => [String(r.tokenId), r]));
      return next.map((id) => map.get(id)).filter((r): r is ArrangeRow => !!r);
    });
  }, []);
  const { order, draggingId, itemProps } = useDragReorder({ ids, onCommit, disabled: saving, liftScale: 1.05 });

  const finish = async (order: number[]) => {
    if (preview) { onOpenChange(false); return; }
    setSaving(true);
    try {
      await saveProfileOrder(order);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dehub-user-content'] }),
        queryClient.invalidateQueries({ queryKey: ['dehub-profile'] }),
      ]);
      onSaved(order.length > 0);
      toast.success(order.length
        ? t('profile.arrange.saved', 'Your order is saved')
        : t('profile.arrange.resetDone', 'Back to newest first'));
      onOpenChange(false);
    } catch {
      toast.error(t('profile.arrange.saveFailed', 'Could not save your order. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const untitled: Record<ArrangeRow['kind'], string> = {
    video: t('profile.tabs.videos', 'Video'),
    live: t('profile.tabs.live', 'Live'),
    image: t('profile.tabs.images', 'Image'),
    text: t('profile.tabs.posts', 'Post'),
  };
  const title = t('profile.arrange.title', 'Arrange your posts');
  const hint = t('profile.arrange.hint', 'Hold a post and drag it to its new place. Visitors see this order first.');

  const body = (
    <>
      <div data-vaul-no-drag className="pa-scroll">
        {state === 'loading' && <p className="pa-note">{t('common.loading', 'Loading...')}</p>}
        {state === 'failed' && <p className="pa-note">{t('profile.arrange.loadFailed', 'Could not load your posts. Close this and try again.')}</p>}
        {state === 'ready' && rows.length === 0 && <p className="pa-note">{t('profile.arrange.empty', 'Nothing to arrange yet. Post something first.')}</p>}
        {state === 'ready' && rows.length > 0 && (
          <ul className="pa-grid" data-arrange-dragging={draggingId ? 'true' : undefined}>
            {order.map((id, index) => {
              const row = byId.get(id);
              if (!row) return null;
              const label = row.title || untitled[row.kind];
              return (
                <li
                  key={id}
                  {...itemProps(id)}
                  data-arrange-row
                  aria-label={`${index + 1}. ${label}`}
                  className={draggingId === id ? `pa-tile ${liftedClass}` : 'pa-tile'}
                >
                  {row.image
                    ? <img src={row.image} alt="" loading="lazy" decoding="async" draggable={false} className="pa-tile-media" />
                    : <span className="pa-tile-text">{label}</span>}
                  <span className="pa-tile-number" aria-hidden>{index + 1}</span>
                  {row.image && label && <span className="pa-tile-caption">{label}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="pa-actions">
        {hasCustomOrder && (
          <button type="button" className="pa-button pa-button--quiet" disabled={saving} onClick={() => finish([])}>
            {t('profile.arrange.reset', 'Back to newest first')}
          </button>
        )}
        <button
          type="button"
          className="pa-button pa-button--main"
          disabled={saving || state !== 'ready' || rows.length === 0}
          onClick={() => finish(rows.map((r) => r.tokenId))}
        >
          {saving ? t('profile.arrange.saving', 'Saving...') : t('profile.arrange.save', 'Save order')}
        </button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent glass hideHandle={false} data-profile-arrange className="flex max-h-[88dvh] flex-col px-3 text-white pb-[calc(12px_+_env(safe-area-inset-bottom))]">
          <DrawerHeader className="px-0 pb-2 pt-1 text-left">
            <DrawerTitle className="text-white">{title}</DrawerTitle>
            <DrawerDescription className="pa-hint">{hint}</DrawerDescription>
          </DrawerHeader>
          {body}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-glass-menu data-profile-arrange className="flex max-h-[80vh] max-w-lg flex-col rounded-3xl p-4 text-white">
        <DialogHeader className="text-left">
          <DialogTitle className="text-white">{title}</DialogTitle>
          <DialogDescription className="pa-hint">{hint}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
