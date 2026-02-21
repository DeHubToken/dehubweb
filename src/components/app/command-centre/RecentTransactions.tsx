import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { getDPayTransactions, type DPayTransaction } from '@/lib/api/dpay';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import dehubCoin from '@/assets/dehub-coin.png';
import { format } from 'date-fns';
import { useMemo } from 'react';

interface UnifiedTransaction {
  id: string;
  type: string;
  amount: number;
  createdAt: string;
  isCredit: boolean;
  description: string;
}

function formatDPayTx(tx: DPayTransaction): UnifiedTransaction {
  const amount = tx.amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
  let description: string;
  let isCredit = false;
  switch (tx.type) {
    case 'buy':
      description = `You purchased ${amount} DHB`;
      isCredit = true;
      break;
    case 'sell':
      description = `You sold ${amount} DHB`;
      break;
    case 'transfer':
      description = `Transfer of ${amount} DHB`;
      break;
    default:
      description = `${tx.type} — ${amount} DHB`;
  }
  return { id: tx.id, type: tx.type, amount: tx.amount, createdAt: tx.createdAt, isCredit, description };
}

export function RecentTransactions() {
  const { isAuthenticated, walletAddress } = useAuth();

  const { data: dpayTxs = [], isLoading: dpayLoading } = useQuery({
    queryKey: ['dpay', 'transactions'],
    queryFn: getDPayTransactions,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  // Fetch PPV purchases from database
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
        .limit(20);
      if (error) { console.warn('[RecentTx] PPV query error:', error); return []; }
      return data || [];
    },
    enabled: isAuthenticated && !!walletAddress,
    staleTime: 30_000,
  });

  const isLoading = dpayLoading || ppvLoading;

  // Merge and sort all transactions
  const recent = useMemo(() => {
    const unified: UnifiedTransaction[] = [];

    // DPay transactions
    dpayTxs.forEach(tx => unified.push(formatDPayTx(tx)));

    // PPV purchases
    ppvPurchases.forEach((p: any) => {
      const isBuyer = p.buyer_address?.toLowerCase() === walletAddress?.toLowerCase();
      const amount = Number(p.amount).toLocaleString(undefined, { maximumFractionDigits: 0 });
      unified.push({
        id: p.id,
        type: 'ppv',
        amount: Number(p.amount),
        createdAt: p.created_at,
        isCredit: !isBuyer, // credit for creator, debit for buyer
        description: isBuyer ? `PPV unlock — ${amount} DHB` : `PPV sale — ${amount} DHB`,
      });
    });

    // Sort newest first, take 8
    unified.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return unified.slice(0, 8);
  }, [dpayTxs, ppvPurchases, walletAddress]);

  return (
    <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">Recent transactions</h3>
        <Button variant="glass" size="sm" className="text-xs h-8 rounded-xl">
          View all
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
        </div>
      ) : recent.length === 0 ? (
        <div className="text-center py-8 text-zinc-500 text-sm">
          No transactions yet
        </div>
      ) : (
        <div className="space-y-0 divide-y divide-zinc-800">
          {recent.map((tx) => {
            const dateStr = format(new Date(tx.createdAt), 'dd MMM');
            return (
              <div key={tx.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tx.isCredit ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  <p className="text-sm text-zinc-400 truncate">{tx.description}</p>
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
