import { Loader2 } from 'lucide-react';
import { TranslatableText } from '@/components/app/TranslatableText';
import { GlassFilterRow } from '@/components/app/feeds/GlassFilterRow';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { getDPayTransactions, type DPayTransaction } from '@/lib/api/dpay';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getAccountInfo } from '@/lib/api/dehub/users';
import { format, subHours, subDays, subWeeks, subMonths } from 'date-fns';
import { useState, useMemo } from 'react';
import { useOnchainDHBTransfers } from '@/hooks/use-onchain-dhb-transfers';

const timeFilters = ['1h', '1d', '1w', '1m', 'Max'];

function getFilterStartDate(filter: string): Date | null {
  const now = new Date();
  switch (filter) {
    case '1h': return subHours(now, 1);
    case '1d': return subDays(now, 1);
    case '1w': return subWeeks(now, 1);
    case '1m': return subMonths(now, 1);
    default: return null;
  }
}

interface UnifiedTransaction {
  id: string;
  type: string;
  amount: number;
  createdAt: string;
  isCredit: boolean;
  description: string;
  counterpartyAddress?: string;
  counterpartyUsername?: string;
}

function formatDPayTx(tx: DPayTransaction, t: (key: string, opts?: any) => string): UnifiedTransaction {
  const amount = tx.amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
  let description: string;
  let isCredit = false;
  switch (tx.type) {
    case 'buy':
      description = `Coin Purchase: $${amount}`;
      isCredit = true;
      break;
    case 'sell':
      description = t('commandCentre.txSold', { amount });
      break;
    case 'transfer':
      description = t('commandCentre.txTransfer', { amount });
      break;
    default:
      description = `${tx.type} — ${amount} DHB`;
  }
  return { id: tx.id, type: tx.type, amount: tx.amount, createdAt: tx.createdAt, isCredit, description };
}

export function RecentTransactions() {
  const { isAuthenticated, walletAddress } = useAuth();
  const [activeFilter, setActiveFilter] = useState('1m');
  const { t } = useTranslation();

  const { data: dpayTxs = [], isLoading: dpayLoading } = useQuery({
    queryKey: ['dpay', 'transactions'],
    queryFn: getDPayTransactions,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  // On-chain DHB transfers (Base chain)
  const { data: onchainTransfers = [], isLoading: onchainLoading } = useOnchainDHBTransfers(walletAddress);

  const { data: ppvPurchases = [], isLoading: ppvLoading } = useQuery({
    queryKey: ['ppv-purchases', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const addr = walletAddress.toLowerCase();
      const { data, error } = await supabase
        .from('ppv_purchases')
        .select('*')
        .or(`buyer_address.ilike.${addr},creator_address.ilike.${addr}`)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) { console.warn('[RecentTx] PPV query error:', error); return []; }
      return data || [];
    },
    enabled: isAuthenticated && !!walletAddress,
    staleTime: 30_000,
  });

  // Fetch tip records (sent and received)
  const { data: tipRecords = [], isLoading: tipsLoading } = useQuery({
    queryKey: ['tip-records', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const addr = walletAddress.toLowerCase();
      const { data, error } = await supabase
        .from('tip_records')
        .select('*')
        .or(`sender_address.ilike.${addr},receiver_address.ilike.${addr}`)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) { console.warn('[RecentTx] Tips query error:', error); return []; }
      return data || [];
    },
    enabled: isAuthenticated && !!walletAddress,
    staleTime: 30_000,
  });

  // Resolve usernames for counterparty addresses in tips
  const counterpartyAddresses = useMemo(() => {
    if (!walletAddress || tipRecords.length === 0) return [];
    const addr = walletAddress.toLowerCase();
    const unique = new Set<string>();
    tipRecords.forEach((tip: any) => {
      const isSender = tip.sender_address?.toLowerCase() === addr;
      const counterparty = isSender ? tip.receiver_address : tip.sender_address;
      if (counterparty) unique.add(counterparty.toLowerCase());
    });
    return Array.from(unique);
  }, [tipRecords, walletAddress]);

  const { data: usernameMap = {} } = useQuery({
    queryKey: ['tip-usernames', counterpartyAddresses],
    queryFn: async () => {
      const map: Record<string, string> = {};
      // Resolve up to 10 addresses to avoid too many API calls
      const toResolve = counterpartyAddresses.slice(0, 10);
      const results = await Promise.allSettled(
        toResolve.map(async (addr) => {
          try {
            const user = await getAccountInfo(addr);
            if (user?.username) map[addr] = user.username;
            else if (user?.displayName) map[addr] = user.displayName;
          } catch { /* ignore */ }
        })
      );
      return map;
    },
    enabled: counterpartyAddresses.length > 0,
    staleTime: 5 * 60_000,
  });

  const isLoading = dpayLoading || ppvLoading || tipsLoading || onchainLoading;

  const recent = useMemo(() => {
    const unified: UnifiedTransaction[] = [];
    const addr = walletAddress?.toLowerCase() || '';

    dpayTxs.forEach(tx => unified.push(formatDPayTx(tx, t)));

    ppvPurchases.forEach((p: any) => {
      const isBuyer = p.buyer_address?.toLowerCase() === addr;
      const amount = Number(p.amount).toLocaleString(undefined, { maximumFractionDigits: 0 });
      unified.push({
        id: p.id,
        type: 'ppv',
        amount: Number(p.amount),
        createdAt: p.created_at,
        isCredit: !isBuyer,
        description: isBuyer ? t('commandCentre.txPpvUnlock', { amount }) : t('commandCentre.txPpvSale', { amount }),
      });
    });

    // Add tip records
    tipRecords.forEach((tip: any) => {
      const isSender = tip.sender_address?.toLowerCase() === addr;
      const amount = Number(tip.amount).toLocaleString(undefined, { maximumFractionDigits: 0 });
      const counterpartyAddr = isSender
        ? tip.receiver_address?.toLowerCase()
        : tip.sender_address?.toLowerCase();
      const counterpartyName = usernameMap[counterpartyAddr]
        ? `@${usernameMap[counterpartyAddr]}`
        : `${counterpartyAddr?.slice(0, 6)}...${counterpartyAddr?.slice(-4)}`;

      unified.push({
        id: tip.id,
        type: 'tip',
        amount: Number(tip.amount),
        createdAt: tip.created_at,
        isCredit: !isSender,
        description: isSender
          ? t('commandCentre.txTipSent', { name: counterpartyName, amount })
          : t('commandCentre.txTipReceived', { name: counterpartyName, amount }),
        counterpartyAddress: counterpartyAddr,
        counterpartyUsername: usernameMap[counterpartyAddr],
      });
    });

    // Add on-chain DHB transfers (deduplicate against DPay txs by txHash)
    const dpayHashes = new Set(dpayTxs.map(tx => tx.txHash?.toLowerCase()).filter(Boolean));
    // Collect DPay buy txHashes so we can label matching on-chain transfers as purchases
    const dpayBuyHashes = new Set(
      dpayTxs.filter(tx => tx.type === 'buy').map(tx => tx.txHash?.toLowerCase()).filter(Boolean)
    );
    // Also match by amount+time for buys without txHash linkage
    const dpayBuys = dpayTxs.filter(tx => tx.type === 'buy');
    const matchesDPayBuyByAmountTime = (amount: number, timestamp: number) => {
      return dpayBuys.some(buy => {
        const amountMatch = Math.abs(buy.amount - amount) < 1; // within 1 DHB
        const buyTime = new Date(buy.createdAt).getTime() / 1000;
        const timeMatch = Math.abs(buyTime - timestamp) < 300; // within 5 minutes
        return amountMatch && timeMatch;
      });
    };
    
    onchainTransfers.forEach(transfer => {
      const txHashLower = transfer.txHash?.toLowerCase();
      // Skip if already captured by DPay API (exact hash match)
      if (txHashLower && dpayHashes.has(txHashLower)) return;

      // Skip if this is a purchase duplicate (gateway wallet, matching buy hash, or amount+time match)
      const isPurchaseDuplicate = transfer.isFiatPurchase 
        || (txHashLower && dpayBuyHashes.has(txHashLower))
        || (transfer.isIncoming && matchesDPayBuyByAmountTime(transfer.amount, transfer.timestamp));

      if (isPurchaseDuplicate) return;

      const amountStr = transfer.formattedAmount;
      let description: string;
      if (transfer.isIncoming) {
        const fromShort = `${transfer.from.slice(0, 6)}...${transfer.from.slice(-4)}`;
        description = `Received ${amountStr} DHB from ${fromShort}`;
      } else {
        const toShort = `${transfer.to.slice(0, 6)}...${transfer.to.slice(-4)}`;
        description = `Sent ${amountStr} DHB to ${toShort}`;
      }

      unified.push({
        id: `onchain-${transfer.txHash}-${transfer.from}`,
        type: 'transfer',
        amount: transfer.amount,
        createdAt: new Date(transfer.timestamp * 1000).toISOString(),
        isCredit: transfer.isIncoming,
        description,
      });
    });

    // Filter by time window
    const startDate = getFilterStartDate(activeFilter);
    const filtered = startDate
      ? unified.filter(tx => new Date(tx.createdAt) >= startDate)
      : unified;

    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return filtered.slice(0, 15);
  }, [dpayTxs, ppvPurchases, tipRecords, onchainTransfers, walletAddress, activeFilter, usernameMap, t]);

  return (
    <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold">{t('commandCentre.recentTransactions')}</h3>
        <Button variant="glass" size="sm" className="text-xs h-8 rounded-xl">
          {t('commandCentre.viewAll')}
        </Button>
      </div>

      {/* Time Filters */}
      <div className="mb-4 w-fit">
        <GlassFilterRow
          items={timeFilters.map((f) => ({ key: f, label: f }))}
          activeKey={activeFilter}
          onSelect={(key) => setActiveFilter(key)}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
        </div>
      ) : recent.length === 0 ? (
        <div className="text-center py-8 text-zinc-500 text-sm">
          {t('commandCentre.noTransactionsYet')}
        </div>
      ) : (
        <div className="space-y-0 divide-y divide-zinc-800">
          {recent.map((tx) => {
            const dateStr = format(new Date(tx.createdAt), 'dd MMM');
            return (
              <div key={tx.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tx.isCredit ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  <TranslatableText text={tx.description} className="text-sm text-zinc-400 truncate" as="p" hideControls />
                </div>
                <span className="text-zinc-500 text-sm whitespace-nowrap ml-4">{dateStr}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
