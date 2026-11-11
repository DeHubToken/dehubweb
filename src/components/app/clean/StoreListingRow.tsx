/**
 * Stores on phones, clean list concept: one listing per line. Square
 * thumbnail (or a quiet placeholder), title, store and type, price on the right.
 *
 * @module components/app/clean/StoreListingRow
 */
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTokenPrices } from '@/hooks/use-token-prices';
import dehubCoin from '@/assets/dehub-coin.png';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { CleanRow } from './CleanKit';

export const StoreListingRow = memo(function StoreListingRow({ listing, onClick }: { listing: any; onClick: () => void }) {
  const { t } = useTranslation();
  const image = ((listing.images as string[]) || [])[0];
  const [failed, setFailed] = useState(false);
  const { data: prices } = useTokenPrices();
  const dhb = prices?.DHB ?? 0;
  const usd = Number(listing.price);
  const store = listing.stores?.name || t('stores.unknownStore');
  const kind = listing.is_digital ? t('stores.digital') : null;
  const soldOut = listing.stock_quantity === 0;
  return (
    <CleanRow
      onClick={onClick}
      lead={
        <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[12px] bg-zinc-800/80">
          {image && !failed ? (
            <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(true)} />
          ) : (
            <span className="flex h-full w-full items-center justify-center"><ThemedIcon icon="stores" alt="" className="h-6 w-6 object-contain opacity-60" /></span>
          )}
        </span>
      }
      title={listing.title}
      sub={[store, kind, soldOut ? t('stores.soldOut') : null].filter(Boolean).join(' · ')}
      trail={
        <span className="shrink-0 text-right">
          <span className="flex items-center justify-end gap-1 text-[14px] font-semibold tabular-nums text-white">
            {dhb > 0 ? (<><img src={dehubCoin} alt="" className="h-4 w-4" />{Math.ceil(usd / dhb).toLocaleString()}</>) : `$${usd.toLocaleString()}`}
          </span>
          <span className="block text-[12px] tabular-nums text-zinc-500">${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </span>
      }
    />
  );
});
