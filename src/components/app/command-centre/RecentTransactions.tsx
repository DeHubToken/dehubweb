import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { getDPayTransactions, type DPayTransaction } from '@/lib/api/dpay';
import { useAuth } from '@/contexts/AuthContext';
import dehubCoin from '@/assets/dehub-coin.png';
import { format } from 'date-fns';

function formatTxDescription(tx: DPayTransaction): { text: string; isCredit: boolean } {
  const amount = tx.amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
  switch (tx.type) {
    case 'buy':
      return { text: `You purchased ${amount} DHB`, isCredit: true };
    case 'sell':
      return { text: `You sold ${amount} DHB`, isCredit: false };
    case 'transfer':
      return { text: `Transfer of ${amount} DHB`, isCredit: false };
    default:
      return { text: `${tx.type} — ${amount} DHB`, isCredit: false };
  }
}

export function RecentTransactions() {
  const { isAuthenticated } = useAuth();

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['dpay', 'transactions'],
    queryFn: getDPayTransactions,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  // Show only the latest 8 transactions
  const recent = transactions.slice(0, 8);

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
            const { text, isCredit } = formatTxDescription(tx);
            const dateStr = format(new Date(tx.createdAt), 'dd MMM');
            return (
              <div key={tx.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isCredit ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  <p className="text-sm text-zinc-400 truncate">{text}</p>
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
