/**
 * Profile Arrange Sheet
 * =====================
 * Where a creator drags their own posts into the order visitors see first.
 *
 * One row per post: a grip to drag by, the post's picture and its words, and a
 * "to top" shortcut for long lists. Saving sends the whole list; the profile
 * then opens in this order for everyone, with Newest, Oldest, Most viewed and
 * Most liked still one tap away.
 *
 * A drawer on phones and a dialog on computers, both glass like the filters
 * panel beside it.
 *
 * @module components/app/profile/ProfileArrangeSheet
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowUpToLine, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useIsMobile } from '@/hooks/use-mobile';
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

function ArrangeItem({ row, index, onTop, labels }: {
  row: ArrangeRow;
  index: number;
  onTop: (tokenId: number) => void;
  labels: { drag: string; top: string; untitled: Record<ArrangeRow['kind'], string> };
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={row}
      dragListener={false}
      dragControls={controls}
      data-arrange-row
      className="pa-row"
      whileDrag={{ scale: 1.02, zIndex: 2 }}
    >
      <button
        type="button"
        className="pa-grip"
        aria-label={labels.drag}
        onPointerDown={(event) => controls.start(event)}
      >
        <GripVertical className="h-5 w-5" aria-hidden />
      </button>
      <span className="pa-number" aria-hidden>{index + 1}</span>
      {row.image
        ? <img src={row.image} alt="" loading="lazy" decoding="async" draggable={false} className="pa-thumb" />
        : <span className="pa-thumb pa-thumb--text" aria-hidden>Aa</span>}
      <span className="pa-title">{row.title || labels.untitled[row.kind]}</span>
      {index > 0 && (
        <button type="button" className="pa-top" aria-label={labels.top} title={labels.top} onClick={() => onTop(row.tokenId)}>
          <ArrowUpToLine className="h-4 w-4" aria-hidden />
        </button>
      )}
    </Reorder.Item>
  );
}

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
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const moveToTop = useCallback((tokenId: number) => {
    setRows((current) => {
      const row = current.find((r) => r.tokenId === tokenId);
      return row ? [row, ...current.filter((r) => r.tokenId !== tokenId)] : current;
    });
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

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

  const labels = {
    drag: t('profile.arrange.drag', 'Drag to move'),
    top: t('profile.arrange.toTop', 'Move to top'),
    untitled: {
      video: t('profile.tabs.videos', 'Video'),
      live: t('profile.tabs.live', 'Live'),
      image: t('profile.tabs.images', 'Image'),
      text: t('profile.tabs.posts', 'Post'),
    },
  };
  const title = t('profile.arrange.title', 'Arrange your posts');
  const hint = t('profile.arrange.hint', 'Drag your posts into the order you want. Visitors see this order first.');

  const body = (
    <>
      <div ref={scrollRef} data-vaul-no-drag className="pa-scroll">
        {state === 'loading' && <p className="pa-note">{t('common.loading', 'Loading...')}</p>}
        {state === 'failed' && <p className="pa-note">{t('profile.arrange.loadFailed', 'Could not load your posts. Close this and try again.')}</p>}
        {state === 'ready' && rows.length === 0 && <p className="pa-note">{t('profile.arrange.empty', 'Nothing to arrange yet. Post something first.')}</p>}
        {state === 'ready' && rows.length > 0 && (
          <Reorder.Group axis="y" values={rows} onReorder={setRows} layoutScroll className="pa-list">
            {rows.map((row, index) => (
              <ArrangeItem key={row.tokenId} row={row} index={index} onTop={moveToTop} labels={labels} />
            ))}
          </Reorder.Group>
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
      <DialogContent data-glass-menu data-profile-arrange className="flex max-h-[80vh] max-w-lg flex-col rounded-3xl p-4">
        <DialogHeader className="text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="pa-hint">{hint}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
