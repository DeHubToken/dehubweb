import { useEffect, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Loader2 } from 'lucide-react';
import Check from '@/components/ui/cut-icons/check';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { SUPPORTED_CHAINS, type ChainId } from '@/components/app/ChainSelector';
import { SOLANA_MAINNET_CHAIN_ID } from '@/lib/chains/constants';
import { getMintFee, type MintFeeQuoteResponse } from '@/lib/api/dehub';
import { isSmartWalletSession } from '@/lib/connection-source';
import { cn } from '@/lib/utils';

/**
 * Chains a post that is already published can be minted on. Solana is left
 * out: the backend has no "sign again" step for it (see mint_existing).
 */
export const MINT_LATER_CHAINS = SUPPORTED_CHAINS.filter((c) => c.id !== SOLANA_MAINNET_CHAIN_ID);

const usd = (n?: number) =>
  n == null || !Number.isFinite(n) ? null : n < 0.01 ? '< $0.01' : `$${n.toFixed(2)}`;

const tokens = (n: number, symbol: string) =>
  `${n >= 1 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : Number(n.toPrecision(3))} ${symbol}`;

interface Cost {
  primary: string;
  secondary: string;
}

/**
 * What the reader pays on one chain. A smart wallet session is sponsored, so
 * it pays the quoted fee (gas is in it); an external wallet sends the mint
 * itself, so it pays the gas and nothing else.
 */
function describeCost(quote: MintFeeQuoteResponse, sponsored: boolean, t: TFunction): Cost | null {
  if (sponsored) {
    if (!quote.chargeable || !(quote.amount > 0)) {
      return { primary: t('mintChain.free', { defaultValue: 'Free' }), secondary: t('mintChain.gasCovered', { defaultValue: 'Gas covered by DeHub' }) };
    }
    const dollars = usd(quote.retailUsd);
    return {
      primary: tokens(quote.amount, quote.symbol),
      secondary: dollars
        ? t('mintChain.feeIncludesGas', { defaultValue: '≈ {{usd}}, gas included', usd: dollars })
        : t('mintChain.gasIncluded', { defaultValue: 'Gas included' }),
    };
  }
  const dollars = usd(quote.gasCostUsd);
  if (!dollars) return null;
  return {
    primary: t('mintChain.gasOnly', { defaultValue: '≈ {{usd}} gas', usd: dollars }),
    secondary: quote.gasCost != null && quote.gasSymbol
      ? t('mintChain.paidFromWallet', { defaultValue: '{{amount}} from your wallet', amount: tokens(quote.gasCost, quote.gasSymbol) })
      : t('mintChain.paidFromWalletPlain', { defaultValue: 'Paid from your wallet' }),
  };
}

interface MintChainSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The chain the post was published on; picked first. */
  defaultChainId?: number;
  isMinting?: boolean;
  onConfirm: (chainId: ChainId) => void;
  /** Override for the state gallery; otherwise read from the session. */
  sponsored?: boolean;
}

/**
 * Pick where a published post goes on-chain, with what each chain costs right
 * now. Prices come from GET /api/mint_fee, the same quote the mint charges, so
 * the number on the button is the number taken.
 */
export function MintChainSheet({ open, onOpenChange, defaultChainId, isMinting, onConfirm, sponsored: sponsoredOverride }: MintChainSheetProps) {
  const { t } = useTranslation();
  const sponsored = sponsoredOverride ?? isSmartWalletSession();
  const fallback = MINT_LATER_CHAINS.some((c) => c.id === defaultChainId) ? (defaultChainId as ChainId) : (MINT_LATER_CHAINS[0].id as ChainId);
  const [selected, setSelected] = useState<ChainId>(fallback);
  useEffect(() => { if (open) setSelected(fallback); }, [open, fallback]);

  const quotes = useQueries({
    queries: MINT_LATER_CHAINS.map((chain) => ({
      queryKey: ['mint-fee', chain.id],
      queryFn: () => getMintFee(chain.id as number),
      enabled: open,
      staleTime: 55_000,
      refetchInterval: open ? 60_000 : (false as const),
    })),
  });

  const selectedIndex = MINT_LATER_CHAINS.findIndex((c) => c.id === selected);
  const selectedChain = MINT_LATER_CHAINS[selectedIndex];
  const selectedQuote = quotes[selectedIndex]?.data;
  const selectedCost = selectedQuote ? describeCost(selectedQuote, sponsored, t) : null;

  return (
    <Drawer open={open} onOpenChange={(next) => { if (!isMinting) onOpenChange(next); }}>
      <DrawerContent column glass className="border-t border-white/10" hideHandle data-mint-chain-sheet>
        <DrawerHeader className="border-b border-white/10 text-left">
          <DrawerTitle className="text-white">{t('mintChain.title', { defaultValue: 'Mint post' })}</DrawerTitle>
          <p className="text-white/50 text-sm">{t('mintChain.subtitle', { defaultValue: 'Choose a chain. Prices are live and update every minute.' })}</p>
        </DrawerHeader>
        <div className="p-4 space-y-2" role="radiogroup" aria-label={t('mintChain.title', { defaultValue: 'Mint post' })}>
          {MINT_LATER_CHAINS.map((chain, i) => {
            const q = quotes[i];
            const cost = q.data ? describeCost(q.data, sponsored, t) : null;
            const isSelected = chain.id === selected;
            return (
              <button
                key={chain.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={isMinting}
                onClick={() => setSelected(chain.id as ChainId)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-left disabled:opacity-60',
                  isSelected ? 'bg-white/10 border border-white/25' : 'bg-white/5 border border-white/10 hover:bg-white/10',
                )}
              >
                <img src={chain.icon} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                <span className="flex-1 min-w-0 text-white font-medium truncate">{chain.name}</span>
                <span className="flex flex-col items-end text-right shrink-0">
                  {q.isLoading ? (
                    <span className="h-4 w-16 rounded bg-white/10 animate-pulse" />
                  ) : cost ? (
                    <>
                      <span className="text-white text-sm font-semibold tabular-nums">{cost.primary}</span>
                      <span className="text-white/50 text-xs tabular-nums">{cost.secondary}</span>
                    </>
                  ) : (
                    <span className="text-white/40 text-xs">{t('mintChain.priceUnavailable', { defaultValue: 'Price unavailable' })}</span>
                  )}
                </span>
                <span className="w-5 shrink-0 flex justify-center">
                  {isSelected && <Check className="w-5 h-5 text-white" />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={isMinting}
            onClick={() => onConfirm(selected)}
            className="w-full py-3 rounded-xl bg-white text-black font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isMinting && <Loader2 className="w-4 h-4 animate-spin" />}
            {selectedCost
              ? t('mintChain.confirmWithCost', { defaultValue: 'Mint on {{chain}} · {{cost}}', chain: selectedChain?.name, cost: selectedCost.primary })
              : t('mintChain.confirm', { defaultValue: 'Mint on {{chain}}', chain: selectedChain?.name })}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
