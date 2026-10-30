import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { loadCloudGenerationPage, updateLibrarySelection, type LibraryOperation } from '@/lib/creator/cloudLibrary';
import { useGenerationStore, type GenerationJob } from '@/store/generationStore';
import { libraryRequest } from '@/lib/creator/libraryRequest';
import { ImageLayersPanel } from './ImageLayersPanel';

/** Server acknowledgements drive preferences; failed rows stay selected for retry. */
export function LibraryManager({ wallet }: { wallet: string | null }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'favorites' | 'hidden'>('all');
  const [rows, setRows] = useState<GenerationJob[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const version = useRef(0);
  const inFlight = useRef(false);
  const activeWallet = useRef(wallet); activeWallet.current = wallet;
  const read = async (offset = 0) => {
    if (!wallet || inFlight.current) return;
    const request = ++version.current; const owner = wallet;
    inFlight.current = true; setBusy(true); setError(false);
    try {
      const page = await libraryRequest(loadCloudGenerationPage(owner, offset, { hidden: filter === 'hidden', favorites: filter === 'favorites' }));
      if (request !== version.current || activeWallet.current !== owner) return;
      setRows(previous => offset ? [...previous, ...page.jobs] : page.jobs); setNextOffset(page.nextOffset);
    } catch { if (request === version.current) setError(true); }
    finally { if (request === version.current) { inFlight.current = false; setBusy(false); } }
  };
  useEffect(() => {
    version.current++; inFlight.current = false; setBusy(false); setRows([]); setSelected([]); setNextOffset(null); setError(false);
    if (open && wallet) void read();
    return () => { version.current++; };
    // Filter and identity define the request; read captures that exact scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, wallet, filter]);
  const change = async (operation: LibraryOperation) => {
    if (!wallet || !selected.length || inFlight.current) return;
    const request = ++version.current; const owner = wallet;
    inFlight.current = true; setBusy(true); setError(false);
    try {
      const result = await libraryRequest(updateLibrarySelection(owner, selected, operation));
      if (activeWallet.current !== owner) return;
      if (request !== version.current) { void useGenerationStore.getState().syncLibrary(); return; }
      const done = new Set(result.completedIds);
      const patch = operation === 'favorite' || operation === 'unfavorite' ? { favorite: operation === 'favorite' } : { hidden: operation === 'hide' };
      useGenerationStore.getState().applyLibraryPreferences(result.completedIds, patch);
      const updated = rows.map(row => done.has(row.id) ? { ...row, ...patch } : row)
        .filter(row => row.hidden === (filter === 'hidden') && (filter !== 'favorites' || row.favorite));
      setRows(updated);
      setNextOffset(offset => offset === null ? null : Math.max(0, offset - (rows.length - updated.length)));
      setSelected(previous => previous.filter(id => !done.has(id))); setError(result.incompleteIds.length > 0);
    } catch { if (request === version.current) setError(true); }
    finally { if (request === version.current) { inFlight.current = false; setBusy(false); } }
  };
  if (!wallet) return null;
  const button = 'min-h-11 rounded-lg border border-white/15 px-3 py-2 text-sm disabled:opacity-40';
  return <>
    <button type="button" className={button} onClick={() => setOpen(true)}>{t('multiPost.manage')}</button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t('creator.referenceLibrary')}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap gap-2">
          {(['all', 'favorites', 'hidden'] as const).map(value => <button type="button" key={value} disabled={busy} aria-pressed={filter === value} className={button} onClick={() => setFilter(value)}
            aria-label={value === 'favorites' ? t('creator.libraryFavorites') : undefined}>{value === 'favorites' ? t('creator.libraryFavorites') : t(value === 'all' ? 'filters.all' : 'settings.hiddenOption')}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span>{selected.length}/100</span>
          <button type="button" disabled={busy || !rows.length} className={button} onClick={() => setSelected(rows.slice(0, 100).map(row => row.id))}>{t('migrate.selectAll')}</button>
          {(['favorite', 'unfavorite', filter === 'hidden' ? 'restore' : 'hide'] as const).map(operation => <button type="button" key={operation} disabled={busy || !selected.length} className={button} onClick={() => void change(operation)}
            aria-label={t(operation === 'favorite' ? 'creator.libraryFavoriteAdd' : operation === 'unfavorite' ? 'creator.libraryFavoriteRemove' : operation === 'hide' ? 'editor.layers.hide' : 'copy.a76e13b98392')}>
            {t(operation === 'favorite' ? 'creator.libraryFavoriteAdd' : operation === 'unfavorite' ? 'creator.libraryFavoriteRemove' : operation === 'hide' ? 'editor.layers.hide' : 'copy.a76e13b98392')}
          </button>)}
        </div>
        {error && <p role="alert">{t('common.somethingWentWrong')} <button type="button" disabled={busy} className="underline" onClick={() => void read()}>{t('common.retry')}</button></p>}
        <ul className="space-y-2">{rows.map(row => <li key={row.id}><label className="flex min-h-11 items-center gap-3 rounded-lg border border-white/10 p-2">
          <input type="checkbox" disabled={busy || (!selected.includes(row.id) && selected.length >= 100)} checked={selected.includes(row.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, row.id] : previous.filter(id => id !== row.id))} />
          <span className="min-w-0 truncate">{row.favorite ? '★ ' : ''}{row.prompt || row.modelName}</span>
        </label></li>)}</ul>
        {open && selected.length === 1 && rows.find(row => row.id === selected[0])?.kind === 'image' && <ImageLayersPanel key={`${wallet}:${selected[0]}`} wallet={wallet} source={rows.find(row => row.id === selected[0])!} onOpenEditor={() => setOpen(false)} />}
        {busy && <p role="status">{t('common.loading')}</p>}
        {nextOffset !== null && <button type="button" className={button} disabled={busy} onClick={() => void read(nextOffset)}>{t('common.loadMore')}</button>}
      </DialogContent>
    </Dialog>
  </>;
}
