import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import dehubCoin from '@/assets/dehub-coin.png';
import bnbLogo from '@/assets/bnb-logo.png';
import usdtLogo from '@/assets/usdt-logo.png';
import ethLogo from '@/assets/eth-logo.png';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useBadgeBalance } from '@/hooks/use-badge-balance';
import { useAllChainsTokens } from '@/hooks/use-wallet-tokens';

const OTHER_SYMBOLS = ['ETH', 'BNB', 'USDT'] as const;
const LOGOS: Record<string, string> = { ETH: ethLogo, BNB: bnbLogo, USDT: usdtLogo };
const NAMES: Record<string, string> = { ETH: 'Ethereum', BNB: 'BNB', USDT: 'Tether' };

export function BalanceCard() {
  const { walletAddress, isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  // DHB balance (holdings + staking across all chains) — same source as badges/leaderboard
  const { badgeBalance, isLoading: badgeLoading } = useBadgeBalance(walletAddress);

  // Real on-chain token balances across Base, BNB Chain, Ethereum
  const { allTokens, isLoading: tokensLoading } = useAllChainsTokens();

  // Aggregate balances per symbol across chains
  const otherBalances = useMemo(() => {
    return OTHER_SYMBOLS.map(symbol => {
      const matching = allTokens.filter(t => t.symbol === symbol);
      const total = matching.reduce((sum, t) => {
        const val = parseFloat(t.formattedBalance);
        return sum + (isNaN(val) ? 0 : val);
      }, 0);
      return {
        symbol,
        name: NAMES[symbol],
        logo: LOGOS[symbol],
        balance: total > 0
          ? total < 0.01 ? total.toFixed(6) : total.toFixed(4).replace(/\.?0+$/, '')
          : '0.00',
      };
    });
  }, [allTokens]);

  const formattedBalance = Math.round(badgeBalance ?? 0).toLocaleString();
  const isLoading = badgeLoading || tokensLoading;

  if (!isAuthenticated) {
    return (
      <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 flex items-center justify-center h-64">
        <p className="text-zinc-500 text-sm">{t('commandCentre.signInBalance')}</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 flex flex-col">
      {/* Header */}
      <div className="mb-4">
        <span className="text-zinc-400 text-sm">{t('commandCentre.totalDhbBalance')}</span>
        <div className="flex items-center gap-2 mt-1">
          <img src={dehubCoin} alt="DeHub" className="w-8 h-8 sm:w-9 sm:h-9" />
          {isLoading ? (
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          ) : (
            <span className="text-3xl sm:text-4xl font-bold text-white">{formattedBalance}</span>
          )}
        </div>
      </div>

      {/* Other currencies */}
      <div className="space-y-2 flex-1">
        <span className="text-zinc-500 text-xs uppercase tracking-wider font-medium">{t('commandCentre.otherAssets')}</span>
        <div className="space-y-1.5">
          {otherBalances.map((c) => (
            <div key={c.symbol} className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-2">
                <img src={c.logo} alt={c.symbol} className="w-6 h-6 rounded-full" />
                <div>
                  <span className="text-sm text-white">{c.symbol}</span>
                  <span className="text-xs text-zinc-500 ml-1.5">{c.name}</span>
                </div>
              </div>
              <span className="text-sm text-zinc-400">
                {tokensLoading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : c.balance}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Wallet button */}
      <Button
        variant="glass"
        className="w-full mt-4 rounded-xl"
        onClick={() => navigate('/app/wallet')}
      >
        Wallet
      </Button>
    </div>
  );
}
