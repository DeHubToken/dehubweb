import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Clock, ExternalLink, GitFork, Star, X } from 'lucide-react';
import type { RichPreview, RichDetails } from '@/lib/rich-links';
import { pauseMediaIn } from '@/lib/pause-media-in';

const statusKeys = { open: 'support.status.open', closed: 'support.status.closed', active: 'commandCentre.active', pending: 'events.pending', locked: 'filters.locked' };
export function RichLinkCard({ preview, onRemove }: { preview: RichPreview; onRemove?: () => void }) {
  const { t, i18n } = useTranslation();
  const data = preview.rich;
  const number = (value: number) => new Intl.NumberFormat(i18n.language, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  const metric = (item: RichDetails['metrics'][number]) => {
    if (item.kind === 'duration') return Math.floor(item.value / 60) + ':' + String(Math.floor(item.value % 60)).padStart(2, '0');
    if (item.kind === 'tvl') return new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(item.value);
    return number(item.value);
  };
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5" data-no-navigate>
      <a href={preview.url} target="_blank" rel="noopener noreferrer" className="block p-3 text-white hover:bg-white/5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 text-xs text-white/65">
          <span className="font-semibold">{preview.siteName}</span>
          {data.status && <span className="rounded-full bg-white/10 px-2 py-0.5">{t(statusKeys[data.status])}</span>}
          <ExternalLink className="ml-auto mr-5 h-3 w-3 shrink-0" />
        </div>
        <div className="mt-3 flex gap-3">
          {preview.image && data.provider !== 'ipfs' && <img src={preview.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-16 w-16 shrink-0 rounded-lg object-cover" onError={e => { e.currentTarget.style.display = 'none'; }} />}
          <div className="min-w-0 flex-1">
            <h4 className="break-words text-sm font-semibold leading-snug">{preview.title}</h4>
            {preview.description && <p className="mt-1 line-clamp-2 break-words text-xs text-white/65">{preview.description}</p>}
          </div>
        </div>
        {data.provider === 'ipfs' && preview.image && <img src={preview.image} alt={preview.title} loading="lazy" referrerPolicy="no-referrer" className="mt-3 max-h-64 w-full rounded-lg object-contain" />}
        {data.identifier && <p className="mt-3 break-all font-mono text-[11px] text-white/70">{data.identifier}</p>}
        {!!data.metrics.length && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {data.metrics.map(item => <div key={item.kind} className="flex items-center gap-1.5 text-xs">
            {item.kind === 'stars' ? <Star className="h-3.5 w-3.5" /> : item.kind === 'forks' ? <GitFork className="h-3.5 w-3.5" /> :
              item.kind === 'duration' ? <Clock className="h-3.5 w-3.5" /> :
              <span className="text-white/65">{t(item.kind === 'tvl' ? 'staking.totalValueLocked' : item.kind === 'power' ? 'badgeShowcase.perks.votes' : 'music.tracks')}</span>}
            <span className="font-semibold tabular-nums">{metric(item)}</span>
          </div>)}
        </div>}
        {!!data.choices?.length && <div className="mt-3 space-y-1.5">
          {data.choices.map((choice, index) => <div key={index} className="relative overflow-hidden rounded-md bg-white/5 px-2.5 py-2">
            <div className="absolute inset-y-0 left-0 bg-white/10" style={{ width: choice.share * 100 + '%' }} />
            <div className="relative flex justify-between gap-3 text-xs"><span>{choice.label}</span><span className="tabular-nums">{number(choice.score)}</span></div>
          </div>)}
          {(data.totalChoices || 0) > data.choices.length && <span className="text-xs text-white/60">+{data.totalChoices! - data.choices.length}</span>}
        </div>}
        {data.endsAt && <div className="mt-2 flex items-center gap-1.5 text-[11px] text-white/65"><CalendarClock className="h-3 w-3" /><span>{new Date(data.endsAt).toLocaleString(i18n.language)}</span></div>}
        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-white/55"><Clock className="h-3 w-3" /><span>{data.fetchedAt ? new Date(data.fetchedAt).toLocaleString(i18n.language) : t('common.failedToLoad')}</span></div>
      </a>
      {data.audioUrl && <ShareAudio key={data.audioUrl} url={data.audioUrl} title={preview.title} />}
      {onRemove && <button type="button" aria-label={t('common.close')} onClick={e => { e.stopPropagation(); onRemove(); }} className="absolute right-2 top-2 rounded-md bg-black/40 p-1.5 text-white"><X className="h-3.5 w-3.5" /></button>}
    </div>
  );
}
function ShareAudio({ url, title }: { url: string; title: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [failed, setFailed] = useState(false);
  const { t } = useTranslation();
  useEffect(() => {
    const audio = ref.current;
    const pause = () => { if (document.hidden) audio?.pause(); };
    document.addEventListener('visibilitychange', pause);
    return () => { audio?.pause(); document.removeEventListener('visibilitychange', pause); };
  }, []);
  return <div className="px-3 pb-3" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
    <audio ref={ref} src={url} aria-label={title} controls preload="none" className="h-9 w-full" onError={() => setFailed(true)} onPlay={e => {
      const current = e.currentTarget;
      // The existing sweep also stops off-document audio posts.
      pauseMediaIn(document.body, current);
    }} />
    {failed && <p className="mt-1 text-xs text-white/65">{t('common.failedToLoad')}</p>}
  </div>;
}

