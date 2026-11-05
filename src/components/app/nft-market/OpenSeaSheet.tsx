/**
 * Buy an OpenSea listing without leaving Riftn. OpenSea signs the order and
 * hands back the transaction; the wallet sends it straight to Seaport.
 */
import { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { KitButton } from '@/components/app/page-kit/PageKit';
import { AuthContext } from '@/contexts/AuthContext';
import { CHAIN_LABEL, buyOpenSea, walletAddress, type OpenSeaListing } from '@/lib/market/market';
import { NftArt, formatPrice } from './NftCard';
import { errorText } from './NftSheet';

const OPENSEA_CHAIN_SLUG: Record<number, string> = { 1: 'ethereum', 8453: 'base' };

export function OpenSeaSheet({ item, onClose }: { item: OpenSeaListing | null; onClose: () => void }) {
  const { t } = useTranslation();
  const auth = useContext(AuthContext);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const name = item ? item.nftName || `#${item.tokenId}` : '';

  const buy = async () => {
    if (!item) return;
    if (!auth?.isAuthenticated) {
      auth?.openLoginModal?.();
      return;
    }
    setBusy(true);
    try {
      await buyOpenSea(item, await walletAddress());
      toast.success(t('nftMarket.bought', { defaultValue: 'Bought. It is in your wallet now.' }));
      qc.invalidateQueries({ queryKey: ['nft-market'] });
      onClose();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent data-nft-sheet data-opensea-sheet className="max-h-[92vh] bg-zinc-950 border-white/10">
        {item ? (
          <div className="mx-auto flex w-full max-w-md flex-col gap-3 overflow-y-auto px-4 pb-6">
            <DrawerHeader className="px-0 pb-0 text-left">
              <p className="truncate text-[12px] text-zinc-500">{item.collectionName}</p>
              <DrawerTitle className="truncate text-[18px] font-bold text-white">{name}</DrawerTitle>
            </DrawerHeader>
            <div className="aspect-square w-full overflow-hidden rounded-xl">
              <NftArt src={item.nftImage} alt={name} className="h-full w-full" />
            </div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[12px] text-zinc-500">{t('nftMarket.price', { defaultValue: 'Price' })}</p>
                <p className="text-[22px] font-bold tabular-nums text-white">
                  {formatPrice(item.price, item.currencyDecimals)} <span className="text-[15px] text-zinc-400">{item.currencySymbol}</span>
                </p>
              </div>
              <span className="text-[12px] text-zinc-500">{CHAIN_LABEL[item.chainId]}</span>
            </div>
            <KitButton disabled={busy} onClick={buy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('nftMarket.buyNow', { defaultValue: 'Buy now' })}
            </KitButton>
            <p className="text-[12px] text-zinc-500">
              {t('nftMarket.openSeaNote', { defaultValue: 'Listed on OpenSea. You pay the seller directly on Seaport; Riftn adds no fee.' })}{' '}
              <a
                className="underline"
                href={`https://opensea.io/assets/${OPENSEA_CHAIN_SLUG[item.chainId]}/${item.contract}/${item.tokenId}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                {t('nftMarket.viewOnOpenSea', { defaultValue: 'View on OpenSea' })}
              </a>
            </p>
          </div>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
