import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Play, Search } from 'lucide-react';
import { VIRAL_TEMPLATES, TEMPLATE_FEATURED_IDS, type ViralTemplate } from '@/lib/creator/viralTemplates';

const CATEGORIES = ['all', 'effects', 'characters', 'dance', 'sports', 'products', 'seasonal'] as const;

/** Provider examples are opt-in: one player at a time, never an autoplay wall. */
export function ViralTemplateShowcase({ onPick }: { onPick: (effect: ViralTemplate) => void }) {
  const { t } = useTranslation();
  const rail = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [playing, setPlaying] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [limit, setLimit] = useState(24);
  const featured = TEMPLATE_FEATURED_IDS.flatMap(id => VIRAL_TEMPLATES.filter(effect => effect.id === id && effect.preview));
  const results = useMemo(() => VIRAL_TEMPLATES.filter(effect => (category === 'all' || effect.category === category)
    && `${effect.name} ${t(`viralTemplates.${effect.category}`)}`.toLowerCase().includes(query.trim().toLowerCase())), [category, query, t]);
  const move = (direction: number) => {
    const node = rail.current;
    if (node) node.scrollBy({ left: direction * (getComputedStyle(node).direction === 'rtl' ? -1 : 1) * node.clientWidth * .85,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  const choose = (effect: ViralTemplate) => { setPlaying(null); onPick(effect); };
  const card = (effect: ViralTemplate, carousel = false) => <article key={effect.id}
    className={carousel ? 'w-[72%] max-w-[270px] shrink-0 snap-start sm:w-[25%]' : 'min-w-0'}>
    <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-white/5">
      {playing === effect.id && effect.preview && failed !== effect.id
        ? <video key={effect.id} src={effect.preview} poster={effect.poster} controls autoPlay playsInline muted
            className="h-full w-full object-cover" onError={() => setFailed(effect.id)} aria-label={t('viralTemplates.preview', { name: effect.name })} />
        : <button type="button" onClick={() => { setFailed(null); setPlaying(effect.id); }}
            aria-label={t('viralTemplates.preview', { name: effect.name })} className="group h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px]">
            <img src={effect.poster} alt="" loading="lazy" decoding="async" width={720} height={960} className="h-full w-full object-cover" />
            <span className="absolute bottom-3 start-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white group-hover:bg-black"><Play className="h-4 w-4" aria-hidden /></span>
          </button>}
      {failed === effect.id && <p role="status" className="absolute inset-x-2 top-2 rounded-md bg-black/85 p-2 text-xs">{t('viralTemplates.previewUnavailable')}</p>}
    </div>
    <p className="mt-3 text-xs text-white/50">{effect.motionSeconds ? t('viralTemplates.motion') : t(`viralTemplates.${effect.category}`)}{effect.motionSeconds ? ` · ${Math.ceil(effect.motionSeconds)}s` : ''}</p>
    <h3 className="mt-1 truncate text-base font-semibold" title={effect.name}>{effect.name}</h3>
    <button type="button" onClick={() => choose(effect)} aria-label={t('viralTemplates.useNamed', { name: effect.name })}
      className="mt-2 flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-white/20 px-3 text-sm font-semibold hover:bg-white/10 focus-visible:outline focus-visible:outline-2">
      {t('viralTemplates.use')}<ArrowRight aria-hidden className="h-4 w-4 rtl:rotate-180" />
    </button>
  </article>;
  const visible = results.slice(0, limit);
  return <section id="viral-templates" aria-labelledby="viral-templates-title" className="mx-auto w-full max-w-[1100px] scroll-mt-24 px-3 pb-8 pt-10 text-white sm:px-4 sm:pt-14">
    <p className="mb-2 text-sm font-semibold text-white/55">{t('viralTemplates.eyebrow', { count: VIRAL_TEMPLATES.length })}</p>
    <h2 id="viral-templates-title" className="max-w-2xl font-exo text-[32px] font-black leading-[1.06] tracking-tight sm:text-[46px]">{t('viralTemplates.title')}</h2>
    <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60 sm:text-base">{t('viralTemplates.intro')}</p>
    <div className="my-5 flex items-center justify-between gap-3">
      <button type="button" aria-expanded={expanded} aria-controls="viral-template-library" onClick={() => { setExpanded(!expanded); setPlaying(null); }}
        className="min-h-11 text-sm font-semibold underline decoration-white/25 underline-offset-4 hover:decoration-white">{t(expanded ? 'viralTemplates.featured' : 'viralTemplates.browse', { count: VIRAL_TEMPLATES.length })}</button>
      {!expanded && <div className="flex gap-2">{[-1, 1].map(direction => <button key={direction} type="button" onClick={() => move(direction)}
        aria-label={t(direction < 0 ? 'maboroshiShowcase.previous' : 'maboroshiShowcase.next')}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 hover:bg-white/10">
        {direction < 0 ? <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> : <ArrowRight className="h-4 w-4 rtl:rotate-180" />}</button>)}</div>}
    </div>
    {!expanded ? <div ref={rail} role="region" aria-roledescription="carousel" aria-label={t('viralTemplates.title')} tabIndex={0}
      className="flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-3 [scrollbar-width:thin]">{featured.map(effect => card(effect, true))}</div>
      : <div id="viral-template-library">
        <label data-search-surface className="mb-4 flex min-h-12 items-center gap-3 rounded-xl px-4"><Search className="h-4 w-4 text-white/50" aria-hidden />
          <input value={query} onChange={event => { setQuery(event.target.value); setLimit(24); setPlaying(null); }} placeholder={t('viralTemplates.search')}
            aria-label={t('viralTemplates.search')} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" />
        </label>
        <div className="mb-4 flex gap-2 overflow-x-auto pb-2">{CATEGORIES.map(item => <button key={item} type="button" aria-pressed={category === item}
          onClick={() => { setCategory(item); setLimit(24); setPlaying(null); }} className={`min-h-11 shrink-0 rounded-full px-4 text-sm ${category === item ? 'bg-white font-semibold text-black' : 'border border-white/20 text-white/70'}`}>{t(`viralTemplates.${item}`)}</button>)}</div>
        <p role="status" className="mb-4 text-sm text-white/55">{t('viralTemplates.results', { count: results.length })}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">{visible.filter(effect => effect.preview && effect.poster).map(effect => card(effect))}</div>
        <div className="mt-5 divide-y divide-white/10">{visible.filter(effect => !effect.preview || !effect.poster).map(effect => <div key={effect.id} className="flex items-center justify-between gap-4 py-3">
          <div><h3 className="text-sm font-semibold">{effect.name}</h3><p className="mt-1 text-xs text-white/45">{t(`viralTemplates.${effect.category}`)} · {t('viralTemplates.previewUnavailable')}</p></div>
          <button type="button" onClick={() => choose(effect)} aria-label={t('viralTemplates.useNamed', { name: effect.name })} className="min-h-11 shrink-0 px-2 text-sm font-semibold underline underline-offset-4">{t('viralTemplates.use')}</button>
        </div>)}</div>
        {results.length === 0 && <p className="py-6 text-white/60">{t('viralTemplates.empty')}</p>}
        {results.length > limit && <button type="button" onClick={() => setLimit(limit + 24)} className="mt-5 min-h-11 rounded-full border border-white/20 px-6 text-sm font-semibold">{t('viralTemplates.more')}</button>}
      </div>}
  </section>;
}
