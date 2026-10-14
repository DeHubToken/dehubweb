import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { loadFeaturedMotionClips, loadMotionCatalog, searchMotionClips, type MotionClip } from '@/lib/creator/motionLibrary';

function ClipPlayer({ clip }: { clip: MotionClip }) {
  const { t } = useTranslation();
  const [variant, setVariant] = useState(-1);
  const [compare, setCompare] = useState(false);
  const original = useRef<HTMLVideoElement>(null);
  const remake = useRef<HTMLVideoElement>(null);
  const wipe = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const sample = clip.variants[Math.max(0, variant)];
  const sync = () => {
    if (original.current && remake.current && Math.abs(original.current.currentTime - remake.current.currentTime) > .2)
      original.current.currentTime = remake.current.currentTime;
  };
  return <div>
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
      {compare && sample ? <>
        <video ref={remake} src={sample.url} poster={sample.poster} controls muted playsInline preload="metadata" className="h-full w-full object-contain"
          onTimeUpdate={sync} onSeeked={sync} onPlay={() => { sync(); void original.current?.play().catch(() => {}); }} onPause={() => original.current?.pause()} />
        <div ref={wipe} className="pointer-events-none absolute inset-0 bg-black" style={{ clipPath: 'inset(0 50% 0 0)' }}>
          <video ref={original} src={clip.url} poster={clip.poster} muted playsInline preload="metadata" className="h-full w-full object-contain" />
        </div>
        <div ref={line} className="pointer-events-none absolute inset-y-0 w-px bg-white" style={{ left: '50%' }} />
      </> : <video key={`${clip.id}:${variant}`} src={variant < 0 ? clip.url : sample?.url} poster={variant < 0 ? clip.poster : sample?.poster}
        controls playsInline preload="metadata" className="h-full w-full object-contain" />}
    </div>
    {compare && <label className="mt-3 flex items-center gap-3 text-xs text-white/70">
      <span>{t('motionLibrary.original')}</span><input type="range" min="0" max="100" defaultValue="50" aria-label={t('motionLibrary.compare')}
        className="min-h-11 min-w-0 flex-1 accent-white" onChange={event => { const value = Number(event.target.value); if (wipe.current) wipe.current.style.clipPath = `inset(0 ${100 - value}% 0 0)`; if (line.current) line.current.style.left = `${value}%`; }} /><span>{t('motionLibrary.remake')}</span>
    </label>}
    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('motionLibrary.versions')}>
      <button type="button" aria-pressed={!compare && variant < 0} onClick={() => { setCompare(false); setVariant(-1); }} className="min-h-11 rounded-full border border-white/20 px-4 text-sm">{t('motionLibrary.original')}</button>
      {clip.variants.map((_, index) => <button key={index} type="button" aria-pressed={!compare && variant === index} onClick={() => { setCompare(false); setVariant(index); }} className="min-h-11 rounded-full border border-white/20 px-4 text-sm">{t('motionLibrary.version', { count: index + 1 })}</button>)}
      {!!clip.variants.length && <button type="button" aria-pressed={compare} onClick={() => setCompare(value => !value)} className="min-h-11 rounded-full border border-white/20 px-4 text-sm">{t('motionLibrary.compare')}</button>}
    </div>
  </div>;
}

export function MotionLibraryShowcase({ onPick, onMaboroshi }: { onPick: (clip: MotionClip, workflow: 'swap' | 'motion') => void; onMaboroshi?: (clip: MotionClip) => void }) {
  const { t } = useTranslation();
  const [clips, setClips] = useState<MotionClip[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [library, setLibrary] = useState(false);
  const [preview, setPreview] = useState<MotionClip | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [limit, setLimit] = useState(24);
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false; setError(false);
    (library ? loadMotionCatalog() : loadFeaturedMotionClips()).then(data => { if (!cancelled) { setClips(data.clips); setTotal(data.total ?? data.clips.length); } }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [attempt, library]);
  const featured = clips.filter(clip => clip.variants.length && (category === 'All' || clip.category === category)).slice(0, 12);
  const results = searchMotionClips(clips, query, category);
  const categories = ['All', ...new Set(clips.map(clip => clip.category))];
  const choose = (clip: MotionClip, workflow: 'swap' | 'motion') => { setLibrary(false); setPreview(null); onPick(clip, workflow); };
  const actions = (clip: MotionClip) => <div className="mt-3 grid grid-cols-2 gap-2">
    <button type="button" onClick={() => choose(clip, 'swap')} className="min-h-11 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black">{t('motionLibrary.recast')}</button>
    <button type="button" onClick={() => choose(clip, 'motion')} className="min-h-11 rounded-xl border border-white/20 px-3 py-2 text-sm font-semibold">{t('motionLibrary.copyMotion')}</button>
    {onMaboroshi && <button type="button" onClick={() => { setLibrary(false); setPreview(null); onMaboroshi(clip); }} className="col-span-2 min-h-11 rounded-xl border border-white/20 px-3 py-2 text-sm font-semibold">{t('creator.toolMaboroshi')}</button>}
  </div>;
  const card = (clip: MotionClip) => <article key={clip.id} className="min-w-0">
    <button type="button" onClick={() => setPreview(clip)} aria-label={t('motionLibrary.preview', { name: clip.name })} className="group relative block aspect-[3/4] w-full overflow-hidden rounded-2xl bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
      <img src={clip.poster} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform group-hover:scale-105 motion-reduce:transition-none" />
      <span className="absolute bottom-3 left-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/70"><Play className="h-4 w-4" /></span>
    </button>
    <h3 className="mt-3 truncate text-base font-semibold">{clip.name}</h3>
    <p className="mt-1 text-xs text-white/60">{t(`motionLibrary.category${clip.category}`)} · {Math.ceil(clip.seconds)}s</p>
    {actions(clip)}
  </article>;
  return <section data-motion-library className="mx-auto w-full max-w-[1100px] px-3 py-10 text-white sm:px-4 sm:py-14">
    <h2 className="max-w-3xl font-exo text-[34px] font-black leading-[1.06] tracking-tight sm:text-[52px]">{t('motionLibrary.title')}</h2>
    <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/65">{t('motionLibrary.intro')}</p>
    {error ? <div role="status" className="mt-5"><p>{t('motionLibrary.failed')}</p><button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-3 min-h-11 rounded-full border border-white/20 px-5">{t('common.retry')}</button></div> : !clips.length ? <p role="status" className="py-8">{t('common.loading')}</p> : <>
      <div className="my-5 flex items-center justify-between gap-3">
        <button type="button" onClick={() => setLibrary(true)} className="min-h-11 text-sm font-semibold underline underline-offset-4">{t('motionLibrary.browse', { count: total })}</button>
        <div className="flex gap-2">{[-1, 1].map(direction => <button key={direction} type="button" aria-label={t(direction < 0 ? 'maboroshiShowcase.previous' : 'maboroshiShowcase.next')}
          onClick={() => { const node = rail.current; if (node) node.scrollBy({ left: direction * (getComputedStyle(node).direction === 'rtl' ? -1 : 1) * node.clientWidth * .85, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20">
          {direction < 0 ? <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> : <ArrowRight className="h-4 w-4 rtl:rotate-180" />}</button>)}</div>
      </div>
      <div className="mb-5 flex gap-2 overflow-x-auto pb-2">{categories.map(item => <button key={item} type="button" aria-pressed={item === category} onClick={() => setCategory(item)} className={`min-h-11 shrink-0 rounded-full border border-white/20 px-4 text-sm ${item === category ? 'bg-white text-black' : ''}`}>{t(`motionLibrary.category${item}`)}</button>)}</div>
      {featured[0] && <div className="mb-6"><ClipPlayer key={featured[0].id} clip={featured[0]} /><div className="mt-3 max-w-md">{actions(featured[0])}</div></div>}
      <div ref={rail} role="region" aria-roledescription="carousel" aria-label={t('motionLibrary.title')} tabIndex={0} className="flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-4">
        {featured.map(clip => <div key={clip.id} className="w-[76%] max-w-[310px] shrink-0 snap-start sm:w-[31%]">{card(clip)}</div>)}
      </div>
    </>}
    <Dialog open={library || !!preview} onOpenChange={open => { if (!open) { setLibrary(false); setPreview(null); } }}>
      <DialogContent className="max-h-[90dvh] max-w-6xl overflow-y-auto border-white/15 bg-[#111214] p-4 text-white sm:p-6">
        <DialogTitle className="pr-10 text-xl font-bold">{preview?.name ?? t('motionLibrary.title')}</DialogTitle>
        {preview ? <><ClipPlayer key={preview.id} clip={preview} />{actions(preview)}<button type="button" onClick={() => { setPreview(null); setLibrary(true); }} className="min-h-11 text-sm underline">{t('motionLibrary.back')}</button></> : <>
          <input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(24); }} placeholder={t('motionLibrary.search')} aria-label={t('motionLibrary.search')} className="min-h-12 rounded-xl border border-white/20 bg-transparent px-4 text-white placeholder:text-white/55" />
          <div className="flex gap-2 overflow-x-auto pb-2">{categories.map(item => <button key={item} type="button" aria-pressed={item === category} onClick={() => { setCategory(item); setLimit(24); }} className={`min-h-11 shrink-0 rounded-full border border-white/20 px-4 text-sm ${item === category ? 'bg-white text-black' : ''}`}>{t(`motionLibrary.category${item}`)}</button>)}</div>
          <p role="status" className="text-sm text-white/65">{t('motionLibrary.results', { count: results.length })}</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 lg:grid-cols-4">{results.slice(0, limit).map(card)}</div>
          {!results.length && <p className="py-8 text-white/65">{t('explorePage.noResults')}</p>}
          {results.length > limit && <button type="button" onClick={() => setLimit(value => value + 24)} className="min-h-11 rounded-full border border-white/20 px-5">{t('common.loadMore')}</button>}
        </>}
      </DialogContent>
    </Dialog>
  </section>;
}
