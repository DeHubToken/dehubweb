import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { MABOROSHI_ART, MABOROSHI_LOOKS } from '@/lib/creator/maboroshiLooks';

export function MaboroshiShowcase() {
  const { t } = useTranslation();
  const rail = useRef<HTMLDivElement>(null);
  const move = (direction: number) => {
    const node = rail.current;
    if (!node) return;
    const rtl = getComputedStyle(node).direction === 'rtl';
    node.scrollBy({ left: direction * (rtl ? -1 : 1) * node.clientWidth * 0.85,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  return (
    <section aria-labelledby="maboroshi-showcase-title" className="mx-auto w-full max-w-[1100px] px-3 pb-8 pt-10 text-white sm:px-4 sm:pt-14">
      <p className="mb-2 text-sm font-semibold text-white/55">{t('creator.toolMaboroshi')}</p>
      <h2 id="maboroshi-showcase-title" className="max-w-2xl font-exo text-[32px] font-black leading-[1.06] tracking-tight sm:text-[46px]">{t('maboroshiShowcase.title')}</h2>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60 sm:text-base">{t('maboroshiShowcase.intro')}</p>
      <div className="my-5 flex items-center justify-between gap-3">
        <Link to="/creator/maboroshi" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline decoration-white/25 underline-offset-4 hover:decoration-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
          {t('maboroshiShowcase.browse')}<ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </Link>
        <div className="flex shrink-0 gap-2">
          {([-1, 1] as const).map(direction => (
            <button key={direction} type="button" onClick={() => move(direction)} aria-label={t(direction < 0 ? 'maboroshiShowcase.previous' : 'maboroshiShowcase.next')}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
              {direction < 0 ? <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> : <ArrowRight className="h-4 w-4 rtl:rotate-180" />}
            </button>
          ))}
        </div>
      </div>
      <div ref={rail} role="region" aria-roledescription="carousel" aria-label={t('creator.toolMaboroshi')} tabIndex={0}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-3 [scrollbar-width:thin] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 sm:gap-4">
        {MABOROSHI_LOOKS.map(look => {
          const name = t(`maboroshiShowcase.${look.key}`);
          return <Link key={look.id} to={`/creator/maboroshi?preset=${look.id}`} aria-label={t('maboroshiShowcase.choose', { name })}
            className="group w-[76%] max-w-[330px] shrink-0 snap-start rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-[31%]">
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-white/5">
              <img src={MABOROSHI_ART} alt={name} width={1536} height={1024} loading="lazy" decoding="async"
                className="pointer-events-none absolute max-w-none" style={{ width: '300%', height: '200%', left: `${-look.column * 100}%`, top: `${-look.row * 100}%` }} />
            </div>
            <div className="flex min-h-14 items-center justify-between gap-3 px-1">
              <h3 className="text-base font-semibold">{name}</h3><ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-white/50 rtl:rotate-180" />
            </div>
          </Link>;
        })}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-white/45">{t('maboroshiShowcase.inspiration')}</p>
    </section>
  );
}
