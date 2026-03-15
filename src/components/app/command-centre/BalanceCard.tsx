import { Loader2, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FundActions } from './FundActions';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import dehubCoin from '@/assets/dehub-coin.png';
import btcLogo from '@/assets/btc-logo.png';
import usdtLogo from '@/assets/usdt-logo.png';
import ethLogo from '@/assets/eth-logo.png';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useAllChainsTokens } from '@/hooks/use-wallet-tokens';
import { BASE_CHAIN_ID, BNB_CHAIN_ID, CHAIN_CONFIGS } from '@/lib/contracts/dhb-token';

const OTHER_SYMBOLS = ['ETH', 'BTC', 'USDT'] as const;
const LOGOS: Record<string, string> = { ETH: ethLogo, BTC: btcLogo, USDT: usdtLogo };
const NAMES: Record<string, string> = { ETH: 'Ethereum', BTC: 'Bitcoin', USDT: 'Tether' };

export function BalanceCard() {
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Real on-chain token balances across Base, BNB Chain, Ethereum
  const { allTokens, isLoading: tokensLoading } = useAllChainsTokens();

  const formattedDhbBalance = useMemo(() => {
    const isCanonicalDHB = (tokenAddress: string, chainId: number) => {
      if (chainId === BASE_CHAIN_ID) return tokenAddress.toLowerCase() === CHAIN_CONFIGS[BASE_CHAIN_ID].dhbToken.toLowerCase();
      if (chainId === BNB_CHAIN_ID) return tokenAddress.toLowerCase() === CHAIN_CONFIGS[BNB_CHAIN_ID].dhbToken.toLowerCase();
      return false;
    };

    let hasSmallBalance = false;
    const total = allTokens
      .filter(t => t.symbol === 'DHB' && isCanonicalDHB(t.address, t.chainId))
      .reduce((sum, t) => {
        if (t.formattedBalance === '<0.01') {
          hasSmallBalance = true;
          return sum;
        }
        const val = parseFloat(t.formattedBalance);
        return sum + (isNaN(val) ? 0 : val);
      }, 0);

    if (total > 0) return Math.floor(total).toLocaleString();
    return hasSmallBalance ? '<0.01' : '0';
  }, [allTokens]);

  // Aggregate balances per symbol across chains
  const otherBalances = useMemo(() => {
    return OTHER_SYMBOLS.map(symbol => {
      const matching = allTokens.filter(t => t.symbol === symbol);
      let hasSmallBalance = false;
      const total = matching.reduce((sum, t) => {
        if (t.formattedBalance === '<0.01') {
          hasSmallBalance = true;
          return sum;
        }
        const val = parseFloat(t.formattedBalance);
        return sum + (isNaN(val) ? 0 : val);
      }, 0);
      return {
        symbol,
        name: NAMES[symbol],
        logo: LOGOS[symbol],
        balance: total > 0
          ? total < 0.01 ? '<0.01' : total.toFixed(4).replace(/\.?0+$/, '')
          : hasSmallBalance ? '<0.01' : '0',
      };
    });
  }, [allTokens]);

  const isLoading = tokensLoading;

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
        <div className="flex items-center gap-2 mt-1">
          <img src={dehubCoin} alt="DeHub" className="w-8 h-8 sm:w-9 sm:h-9" />
          {isLoading ? (
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          ) : (
            <span className="text-3xl sm:text-4xl font-bold text-white">{formattedDhbBalance}</span>
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

      {/* Action buttons */}
      <div className="flex gap-2 mt-4">
        <FundActions />
        <Button
          variant="glass"
          className="flex-1 h-9 rounded-xl flex items-center justify-center"
          onClick={() => navigate('/app/wallet', { state: { from: 'command-centre' } })}
        >
          <Wallet className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}