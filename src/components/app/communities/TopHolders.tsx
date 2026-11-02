/**
 * Top holders of a holder group, biggest first, from balances the database
 * verified. Shown in About (everyone) and the owner's Holders tab.
 */

import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import type { Community } from '@/hooks/use-communities';
import dehubCoin from '@/assets/dehub-coin.png';
import { formatHolderAmount, holderGateOf, isDehubToken, useCommunityHolders } from '@/hooks/use-holder-gate';
import { useWalletProfiles } from '@/hooks/use-wallet-profiles';
import { cn } from '@/lib/utils';

const PODIUM = ['text-amber-300', 'text-zinc-200', 'text-orange-300'];

function shortWallet(w: string) {
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

export function TopHolders({ community, limit = 10 }: { community: Community; limit?: number }) {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const gate = holderGateOf(community);
  const { data: holders, isLoading } = useCommunityHolders(community.id, !!gate);
  const eligible = (holders ?? []).filter(h => !gate || h.balance >= gate.min).slice(0, limit);
  const profiles = useWalletProfiles(eligible.map(h => h.wallet_address));

  if (!gate) return null;

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5" data-top-holders>
      <h3 className="text-white font-medium text-sm">
        {t('communities.holderGate.topHolders', { defaultValue: 'Top holders' })}
      </h3>
      {isLoading ? (
        <p className="text-zinc-500 text-xs mt-2">…</p>
      ) : eligible.length === 0 ? (
        <p className="text-zinc-500 text-xs mt-1">
          {t('communities.holderGate.noHolders', { defaultValue: 'Holders appear here once they join.' })}
        </p>
      ) : (
        <ol className="mt-2 space-y-1">
          {eligible.map((h, i) => {
            const mine = walletAddress?.toLowerCase() === h.wallet_address;
            return (
              <li
                key={h.wallet_address}
                className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm', mine && 'bg-white/[0.06]')}
              >
                <span className={cn('w-6 shrink-0 text-center text-xs font-semibold tabular-nums', PODIUM[i] ?? 'text-zinc-500')}>{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-white">{profiles[h.wallet_address]?.displayName || profiles[h.wallet_address]?.username || shortWallet(h.wallet_address)}</span>
                <span className="shrink-0 inline-flex items-center gap-1 tabular-nums text-xs text-zinc-400">
                  {isDehubToken(gate) && <img src={dehubCoin} alt="" className="w-3.5 h-3.5" />}
                  {formatHolderAmount(h.balance, gate.symbol)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
