import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { usePools } from '@/hooks/use-dex-pools';
import { ChevronDown, Plus, Search } from 'lucide-react';
import { poolPath, POOL_CHAIN_INFO, type DexPool } from '@/lib/dex/pools';
import dhbCoinImage from '@/assets/dehub-coin.png';
import { AddPoolDialog } from './AddPoolDialog';

export function PoolAvatar({ pool, size = 38 }: { pool: Pick<DexPool, 'image_url' | 'symbol'> | null; size?: number }) {
  if (!pool) return <img src={dhbCoinImage} alt="DHB" width={size} height={size} />;
  return pool.image_url
    ? <img src={pool.image_url} alt={pool.symbol} width={size} height={size} className="dex-pool-avatar" />
    : <span className="dex-pool-avatar dex-pool-initials" style={{ width: size, height: size }}>{pool.symbol.slice(0, 2).toUpperCase()}</span>;
}

/** The pair title. Opens the list of every pool and the button to add one. */
export function PoolPicker({ current }: { current: DexPool | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const { data: pools = [], isLoading } = usePools();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pools;
    return pools.filter((p) => p.symbol.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.token_address.toLowerCase() === q);
  }, [pools, query]);

  const go = (path: string) => { setOpen(false); setQuery(''); navigate(path); };

  return <div className="dex-pair" ref={root}>
    <PoolAvatar pool={current} />
    <button type="button" className="dex-pair-button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
      <h1 className="dex-pair-name">{current ? current.symbol : 'DHB'} <span className="dex-muted">/</span> USD</h1>
      <ChevronDown size={16} className={open ? 'dex-chevron-open' : ''} />
    </button>
    {open && <div className="dex-pool-menu" role="listbox" aria-label={t('dex.pools.title')}>
      <label className="dex-pool-search"><Search size={13} /><input autoFocus placeholder={t('dex.pools.search')} aria-label={t('dex.pools.search')} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <div className="dex-pool-list">
        {(!query || 'dhb dehub'.includes(query.trim().toLowerCase())) && <button type="button" role="option" aria-selected={!current} className="dex-pool-item" onClick={() => go('/dex')}>
          <PoolAvatar pool={null} size={26} /><span><b>DHB / USD</b><small>DeHub · Base</small></span>
        </button>}
        {filtered.map((pool) => <button type="button" role="option" key={pool.id} aria-selected={current?.id === pool.id} className="dex-pool-item" onClick={() => go(poolPath(pool))}>
          <PoolAvatar pool={pool} size={26} /><span><b>{pool.symbol} / USD</b><small>{pool.name} · {POOL_CHAIN_INFO[pool.chain].name}</small></span>
        </button>)}
        {isLoading && <div className="dex-pool-note">{t('dex.pools.loading')}</div>}
        {!isLoading && query && !filtered.length && <div className="dex-pool-note">{t('dex.pools.noMatch')}</div>}
      </div>
      <button type="button" className="dex-pool-add" onClick={() => { setOpen(false); setAdding(true); }}><Plus size={14} />{t('dex.pools.add')}</button>
    </div>}
    <AddPoolDialog open={adding} onOpenChange={setAdding} onCreated={(pool) => go(poolPath(pool))} />
  </div>;
}
