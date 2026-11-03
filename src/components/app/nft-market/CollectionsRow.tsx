/**
 * "Trending collections": the busiest collections for sale, each with its
 * floor price. Tapping one narrows the market to that collection.
 */
import { useTranslation } from 'react-i18next';
import { NftArt, formatPrice } from '@/components/app/nft-market/NftCard';
import { CHAIN_LABEL, type MarketCollection } from '@/lib/market/market';

export function CollectionsRow({
  items,
  selected,
  onSelect,
}: {
  items: MarketCollection[];
  selected: { chainId: number; contract: string } | null;
  onSelect: (c: MarketCollection | null) => void;
}) {
  const { t } = useTranslation();
  if (!items.length) return null;
  return (
    <section data-nft-collections className="flex flex-col gap-2">
      <h2 className="px-1 text-[15px] font-bold text-white">
        {t('nftMarket.collections', { defaultValue: 'Collections' })}
      </h2>
      <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((c) => {
          const on = selected?.chainId === c.chainId && selected.contract === c.contract;
          return (
            <button
              key={`${c.chainId}:${c.contract}`}
              type="button"
              data-page-bento
              data-active={on ? 'true' : undefined}
              onClick={() => onSelect(on ? null : c)}
              className="relative flex w-[9.5rem] shrink-0 flex-col overflow-hidden rounded-xl bg-zinc-900 text-left text-white transition-transform active:scale-[0.98] sm:w-[11rem]"
            >
              {on ? (
                <span aria-hidden className="pointer-events-none absolute inset-0 z-10 rounded-xl" style={{ boxShadow: 'inset 0 0 0 2px #fff, inset 0 0 0 3px rgba(0,0,0,0.35)' }} />
              ) : null}
              <div className="relative aspect-[4/3] w-full overflow-hidden">
                <NftArt src={c.image} alt={c.name ?? ''} className="h-full w-full" />
                <span className="absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: 'rgba(0,0,0,0.62)', color: '#fff' }}>
                  {c.chainId ? CHAIN_LABEL[c.chainId] ?? c.chainId : t('nftMarket.allChains', { defaultValue: 'All chains' })}
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-0.5 p-2.5">
                <p className="truncate text-[13px] font-semibold text-white">{c.name || `${c.contract.slice(0, 6)}…${c.contract.slice(-4)}`}</p>
                <p className="truncate text-[11.5px] tabular-nums text-zinc-400">
                  {c.floor
                    ? `${t('nftMarket.floor', { defaultValue: 'Floor' })} ${formatPrice(c.floor.amount, c.floor.decimals)} ${c.floor.symbol}`
                    : t('nftMarket.offersOpen', { defaultValue: 'Open to offers' })}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {c.listed
                    ? t('nftMarket.listedCount', { defaultValue: '{{n}} for sale', n: c.listed })
                    : t('nftMarket.mintedCount', { defaultValue: '{{n}} minted', n: c.minted ?? 0 })}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
