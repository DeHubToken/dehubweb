/**
 * Verify & Unlock Button for hold-gated content drawers.
 * =====================================================
 * DHB gates count wallet balances and stakes across Base and BNB. Other tokens
 * use their own contract, chain and decimals. Delegated badges are not holdings.
 *
 * Falling short used to end at a line of red text. When the gate is DHB it now
 * turns into the same top-up step PPV uses, so the missing DHB can be bought out
 * of whatever is already in the wallet without leaving the sheet.
 *
 * Bundle note: this renders inside eager feed cards, so nothing here may
 * statically import the wallet stack (scripts/check-entry-bundle.mjs fails the
 * build otherwise). Contract modules are pulled in inside the click handler.
 */
import { useCallback, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { useAuth } from '@/contexts/AuthContext';
import { BASE_CHAIN_ID, getChainConfig, fromWei } from '@/lib/contracts/dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';
import { PPVTopUpStep } from './PPVTopUpStep';
import type { PPVShortfall } from '@/hooks/use-ppv-payment';
import { DHB_HOLDINGS_TOKENS, isDhbHoldingsGate, ownedDhbHoldings } from '@/lib/holdings-gate';

interface VerifyUnlockButtonProps {
  requiredAmount: number;
  currency: string;
  /** ERC-20 the hold is measured in. Absent means the chain's DHB. */
  tokenAddress?: string;
  /** Chain the hold token lives on. Absent means Base. */
  chainId?: number;
  onUnlocked: () => void;
}

function formatAmount(value: number): string {
  return Math.floor(value).toLocaleString();
}

export function VerifyUnlockButton({
  requiredAmount,
  currency,
  tokenAddress,
  chainId = BASE_CHAIN_ID,
  onUnlocked,
}: VerifyUnlockButtonProps) {
  const { walletAddress, openLoginModal } = useAuth();
  const [isChecking, setIsChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [shortfall, setShortfall] = useState<PPVShortfall | null>(null);

  const verify = useCallback(async () => {
    if (!walletAddress) {
      openLoginModal();
      return;
    }

    setIsChecking(true);
    setMessage(null);
    setShortfall(null);

    try {
      const [{ getERC20Balance }, { isAutoSwapSupported }] = await Promise.all([
        import('@/lib/contracts/aa-utils'),
        import('@/lib/contracts/uniswap-swap'),
      ]);

      const gateToken = tokenAddress || getChainConfig(chainId as ChainId).dhbToken;
      if (!gateToken) {
        setMessage('This post does not say which token it is gated on.');
        return;
      }

      const isDhb = isDhbHoldingsGate(currency, tokenAddress, [chainId]);
      let balance: number;
      if (isDhb) {
        const { getAccountInfo } = await import('@/lib/api/dehub/users');
        const account = await getAccountInfo(walletAddress);
        const staked = ownedDhbHoldings((account.balanceData ?? []).map(row => ({ ...row, walletBalance: 0 })));
        balance = staked;
        if (balance < requiredAmount) {
          const liquid = await Promise.all(DHB_HOLDINGS_TOKENS.map(token =>
            getERC20Balance(token.address, walletAddress, token.chainId as ChainId),
          ));
          balance += liquid.reduce((sum, value) => sum + Number(fromWei(value, 18)), 0);
        }
      } else {
        const { getERC20Metadata } = await import('@/lib/wallet/tokens');
        const [balanceWei, metadata] = await Promise.all([
          getERC20Balance(gateToken, walletAddress, chainId as ChainId),
          getERC20Metadata(gateToken, chainId as ChainId),
        ]);
        balance = Number(fromWei(balanceWei, metadata.decimals));
      }

      if (balance >= requiredAmount) {
        toast.success('Content unlocked! 🎉');
        onUnlocked();
        return;
      }

      // Only DHB can be bought from inside the sheet — the swap routes are
      // DHB's. A gate on someone else's token still gets the honest numbers.
      if (isDhb) {
        setShortfall({
          needDhb: requiredAmount - balance,
          balanceDhb: balance,
          priceDhb: requiredAmount,
          chainId: chainId as ChainId,
          canTopUpInApp: isAutoSwapSupported(chainId as ChainId),
        });
        return;
      }

      setMessage(
        `You hold ${formatAmount(balance)} ${currency}. This post needs ${formatAmount(requiredAmount)}.`,
      );
    } catch (err) {
      console.error('[HoldGate] Balance check failed:', err);
      setMessage('Could not read your balance just now.');
    } finally {
      setIsChecking(false);
    }
  }, [walletAddress, openLoginModal, tokenAddress, chainId, requiredAmount, currency, onUnlocked]);

  if (shortfall) {
    return (
      <PPVTopUpStep
        shortfall={shortfall}
        formatCompact={formatAmount}
        // Funded — re-read the balance rather than trusting the swap's own
        // arithmetic, since the gate is checked against what is held.
        onFunded={verify}
        onCancel={() => setShortfall(null)}
        onClose={() => setShortfall(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <LiquidGlassBubble
        onClick={isChecking ? undefined : verify}
        className={`w-full py-3 ${isChecking ? 'opacity-60' : 'cursor-pointer'}`}
      >
        <span className="flex items-center justify-center gap-2 text-white text-sm font-medium">
          {isChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {isChecking ? 'Checking your balance…' : 'Verify & Unlock'}
        </span>
      </LiquidGlassBubble>
      {message && (
        <p className="text-center text-red-400 text-xs">{message}</p>
      )}
    </div>
  );
}
