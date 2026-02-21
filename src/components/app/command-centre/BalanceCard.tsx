import { TrendingUp, TrendingDown, Loader2, Wallet } from 'lucide-react';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import dehubCoin from '@/assets/dehub-coin.png';
import bnbLogo from '@/assets/bnb-logo.png';
import usdtLogo from '@/assets/usdt-logo.png';
import { useAuth } from '@/contexts/AuthContext';
import { getDHBBalance } from '@/lib/contracts/stream-controller';
import { fromWei } from '@/lib/contracts/dhb-token';
import { getDPayTransactions } from '@/lib/api/dpay';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/** Placeholder currencies the platform supports alongside DHB */
const otherCurrencies = [
  { symbol: 'ETH', name: 'Ethereum', balance: '0.00', logo: null },
  { symbol: 'USDT', name: 'Tether', balance: '0.00', logo: usdtLogo },
  { symbol: 'BNB', name: 'BNB', balance: '0.00', logo: bnbLogo },
];

export function BalanceCard() {
  const { walletAddress, isAuthenticated } = useAuth();

  // Fetch on-chain DHB balance
  const { data: rawBalance, isLoading: balanceLoading } = useQuery({
    queryKey: ['dhb-balance', walletAddress?.toLowerCase()],
    queryFn: async () => {
      if (!walletAddress) return BigInt(0);
      return getDHBBalance(walletAddress);
    },
    enabled: !!walletAddress,
    staleTime: 60_000,
  });

  const balance = rawBalance ? Number(fromWei(rawBalance)) : 0;
  const formattedBalance = Math.round(balance).toLocaleString();

  if (!isAuthenticated) {
    return (
      <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 flex items-center justify-center h-64">
        <p className="text-zinc-500 text-sm">Sign in to view your balance</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 flex flex-col">
      {/* Header */}
      <div className="mb-4">
        <span className="text-zinc-400 text-sm">Total balance</span>
        <div className="flex items-center gap-2 mt-1">
          <img src={dehubCoin} alt="DeHub" className="w-8 h-8 sm:w-9 sm:h-9" />
          {balanceLoading ? (
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          ) : (
            <span className="text-3xl sm:text-4xl font-bold text-white">{formattedBalance}</span>
          )}
        </div>
      </div>

      {/* Other currencies */}
      <div className="space-y-2 flex-1">
        <span className="text-zinc-500 text-xs uppercase tracking-wider font-medium">Other assets</span>
        <div className="space-y-1.5">
          {otherCurrencies.map((c) => (
            <div key={c.symbol} className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-2">
              {c.logo ? (
                <img src={c.logo} alt={c.symbol} className="w-6 h-6 rounded-full" />
              ) : (
                <span className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                  {c.symbol.charAt(0)}
                </span>
              )}
                <div>
                  <span className="text-sm text-white">{c.symbol}</span>
                  <span className="text-xs text-zinc-500 ml-1.5">{c.name}</span>
                </div>
              </div>
              <span className="text-sm text-zinc-400">{c.balance}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Full Wallet button */}
      <Button
        variant="glass"
        className="w-full mt-4 rounded-xl"
        onClick={() => toast.info('Full wallet coming soon')}
      >
        <Wallet className="w-4 h-4 mr-2" />
        Full Wallet
      </Button>
    </div>
  );
}
