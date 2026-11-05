/**
 * The market's opening shot: one NFT at full width, its art blurred behind it,
 * cycling through the newest few. Listings lead; minted posts fill in when
 * nothing is for sale yet.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NftArt, formatPrice } from '@/components/app/nft-market/NftCard';
import { CHAIN_LABEL } from '@/lib/market/market';

export interface SpotlightItem {
  key: string;
  name: string;
  image: string | null;
  chainId: number;
  price?: { amount: string; decimals: number; symbol: string } | null;
  onOpen: () => void;
}

// Inline colours: everything here sits on the art, so it must not follow the light themes' text remaps.
const ON_ART = { color: '#fff' } as const;
const ON_ART_SOFT = { color: 'rgba(255,255,255,0.72)' } as const;

export function NftSpotlight({ items }: { items: SpotlightItem[] }) {
  const { t } = useTranslation();
  const [at, setAt] = useState(0);
  const count = items.length;

  useEffect(() => {
    if (count < 2) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setAt((i) => (i + 1) % count), 6000);
    return () => window.clearInterval(id);
  }, [count, at]);

  if (!count) return null;
  const item = items[Math.min(at, count - 1)];

  return (
    <section data-nft-spotlight className="relative overflow-hidden rounded-2xl" style={{ background: '#09090b' }}>
      {/* Its own art, blurred, as the glow behind it. */}
      {item.image ? (
        <img key={`glow-${item.key}`} src={item.image} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-2xl" />
      ) : null}
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'rgba(0,0,0,0.35)' }} />
      <div className="relative grid gap-0 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <button
          type="button"
          onClick={item.onOpen}
          className="group relative block aspect-[4/3] w-full overflow-hidden sm:aspect-[5/4]"
          aria-label={item.name}
        >
          <NftArt key={item.key} src={item.image} alt={item.name} className="h-full w-full transition-transform duration-700 group-hover:scale-[1.04] animate-in zoom-in-105 duration-700" />
          <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 sm:hidden" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))' }} />
        </button>
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4 sm:static sm:justify-center sm:gap-3 sm:p-7">
          <span className="w-fit rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ background: 'rgba(0,0,0,0.62)', border: '1px solid rgba(255,255,255,0.22)', ...ON_ART, backdropFilter: 'blur(8px)' }}>
            {item.price ? t('nftMarket.spotlightForSale', { defaultValue: 'For sale now' }) : t('nftMarket.spotlightNew', { defaultValue: 'Just minted' })}
            {' · '}
            {CHAIN_LABEL[item.chainId] ?? item.chainId}
          </span>
          <h2 key={`name-${item.key}`} className="line-clamp-2 text-[22px] font-extrabold leading-tight tracking-tight animate-in slide-in-from-bottom-2 duration-500 sm:text-[30px]" style={{ ...ON_ART, textShadow: '0 1px 6px rgba(0,0,0,0.55)' }}>
            {item.name}
          </h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={item.onOpen}
              className="rounded-full px-4 py-2 text-[13.5px] font-bold transition-transform active:scale-95"
              style={{ background: '#fff', color: '#000' }}
            >
              {item.price
                ? t('nftMarket.buyFor', { defaultValue: 'Buy for {{price}}', price: `${formatPrice(item.price.amount, item.price.decimals)} ${item.price.symbol}` })
                : t('nftMarket.makeOffer', { defaultValue: 'Make an offer' })}
            </button>
            {count > 1 ? (
              <div className="flex items-center gap-1.5" role="tablist" aria-label={t('nftMarket.spotlight', { defaultValue: 'Spotlight' })}>
                {items.map((it, i) => (
                  <button
                    key={it.key}
                    type="button"
                    role="tab"
                    aria-selected={i === at}
                    aria-label={it.name}
                    onClick={() => setAt(i)}
                    className="h-1.5 rounded-full transition-all duration-300"
                    style={{ width: i === at ? 18 : 6, background: i === at ? '#fff' : 'rgba(255,255,255,0.4)' }}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <p className="hidden text-[13px] leading-relaxed sm:block" style={ON_ART_SOFT}>
            {item.price
              ? t('nftMarket.spotlightBuyNote', { defaultValue: 'The NFT and the payment swap in one step.' })
              : t('nftMarket.spotlightOfferNote', { defaultValue: 'Not listed yet. Send an offer and the holder can accept it any time.' })}
          </p>
        </div>
      </div>
    </section>
  );
}
