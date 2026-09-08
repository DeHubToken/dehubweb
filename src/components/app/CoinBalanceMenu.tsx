import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Copy, ArrowLeft, CreditCard, Bitcoin, Check, Lock, Minus } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import dehubCoin from '@/assets/dehub-coin.png';
import usdcLogo from '@/assets/usdc-logo.png';
import { useAuth } from '@/contexts/AuthContext';
import { useWalletLocked } from '@/hooks/use-wallet-locked';
import { useWalletAddresses } from '@/hooks/use-wallet-addresses';
import { useTokenPrices } from '@/hooks/use-token-prices';
import { CopyAddressRows } from '@/components/app/wallet/CopyAddressRows';

/**
 * Shown at the top of the wallet menu whenever the built-in wallet's key is not
 * in memory. Opening the wallet is the moment a user is most likely to be about
 * to do something that signs, and until this existed the lock state was
 * invisible: the menu offered Buy / Send / Stake as normal and each one failed
 * on a locked wallet with an error and nothing to press.
 */
function UnlockWalletRow({ onUnlock }: { onUnlock: () => void }) {
  return (
    <button
      onClick={onUnlock}
      className="w-full flex items-center gap-3 px-3 py-2.5 mb-1 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/15 transition-colors text-left"
    >
      <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
        <Lock className="w-4 h-4 text-white" />
      </div>
      <div>
        <span className="text-white font-medium block">Unlock wallet</span>
        <span className="text-zinc-400 text-xs">Needed to post, tip or send</span>
      </div>
    </button>
  );
}

interface CoinBalanceMenuProps {
  balance: number;
  variant: 'desktop' | 'mobile';
  onAuthRequired?: () => boolean;
}

interface WalletMenuContentProps {
  balance: number;
  onClose?: () => void;
}

type MenuView = 'main' | 'buy' | 'stake' | 'receive';

export function CoinBalanceMenu({ balance, variant, onAuthRequired }: CoinBalanceMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { walletAddress, requestWalletUnlock } = useAuth();
  const walletLocked = useWalletLocked();
  const navigate = useNavigate();

  const handleOpenChange = (open: boolean) => {
    if (open && onAuthRequired && !onAuthRequired()) {
      return;
    }
    setIsOpen(open);
    if (!open) resetMenu();
  };
  const [menuView, setMenuView] = useState<MenuView>('main');
  const [stakeAmount, setStakeAmount] = useState('');
  const [copied, setCopied] = useState(false);
  const { hasChoice: hasAddressChoice } = useWalletAddresses();

  const formattedWalletAddress = useMemo(() => {
    if (!walletAddress) return null;
    return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
  }, [walletAddress]);

  const handleCopyAddress = () => {
    if (!walletAddress) {
      toast.error('No wallet connected');
      return;
    }

    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    toast.success('Address copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBuyWithCard = () => {
    setIsOpen(false);
    setMenuView('main');
    navigate('/app/buy');
  };

  const handleBuyWithCrypto = () => {
    setIsOpen(false);
    setMenuView('main');
    navigate('/app/buy');
  };

  const handleStakeCoins = () => {
    if (!stakeAmount || Number(stakeAmount) <= 0) return;
    toast.success(`Staked ${stakeAmount} coins`);
    setIsOpen(false);
    setMenuView('main');
    setStakeAmount('');
  };

  const handleStakeAll = () => {
    if (balance <= 0) {
      toast.error('No coins to stake');
      return;
    }
    setStakeAmount(balance.toString());
  };

  const resetMenu = () => {
    setMenuView('main');
    setStakeAmount('');
  };

  const coinButton = (
    <div 
      className={`group flex items-center justify-center cursor-pointer transition-colors ${variant === 'desktop' ? 'bg-zinc-900 rounded-xl p-2 hover:bg-zinc-800' : 'w-8 h-8 rounded-xl'}`}
    >
      <img 
        src={dehubCoin} 
        alt="coins" 
        className={`transition-all duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_rgba(255,215,0,0.6)] ${variant === 'mobile' ? 'h-[26px] w-[26px]' : 'h-5 w-5'}`}
      />
    </div>
  );

  // The live DHB quote, not the 0.05 placeholder this used to multiply by —
  // that was ~50x the real price, so the figure under the balance was wrong by
  // that much for everyone who saw it.
  const { data: prices } = useTokenPrices();
  const dhbPrice = prices?.DHB ?? 0;
  const dollarValue = (balance * dhbPrice).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Format balance: show 0 when zero, otherwise show with 2 decimals if has decimals
  const formatBalance = (value: number) => {
    if (value === 0) return '0';
    return value % 1 === 0 ? value.toLocaleString() : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const mainMenuContent = (
    <div className="space-y-1">
      {/* Balance display */}
      <div className="px-3 py-3 mb-2 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 space-y-2">
        {/* DeHub Coin Balance */}
        <div className="flex items-center gap-2">
          <img src={dehubCoin} alt="coins" className="w-5 h-5" />
          <span className="text-white font-semibold">{formatBalance(balance)}</span>
        </div>
        {/* USD Balance with USDC logo */}
        {/* Held back until a quote is in: rendering $0.00 against a real
            balance reads as "your coins are worthless", not as "loading". */}
        {dhbPrice > 0 && (
          <div className="flex items-center gap-2">
            <img src={usdcLogo} alt="USD" className="w-5 h-5" />
            <span className="text-zinc-400 font-medium">${dollarValue}</span>
          </div>
        )}
      </div>
      {walletLocked && <UnlockWalletRow onUnlock={requestWalletUnlock} />}
      <button
        onClick={() => setMenuView('buy')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Plus className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Buy Coins</span>
      </button>
      <button
        onClick={() => {
          toast.info('Cash out coming soon!');
        }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Minus className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Cash Out</span>
      </button>
      <button
        onClick={() => (hasAddressChoice ? setMenuView('receive') : handleCopyAddress())}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          {copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4 text-white" />}
        </div>
        <div className="flex flex-col">
          <span className="text-white font-medium">Receive Coins</span>
          <span className="text-xs text-zinc-400">{formattedWalletAddress ?? 'Connect wallet'}</span>
        </div>
      </button>
      <button
        onClick={() => { setIsOpen(false); navigate('/app/stake'); }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Lock className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Stake Coins</span>
      </button>

    </div>
  );

  const buyMenuContent = (
    <div className="space-y-1">
      <button
        onClick={() => setMenuView('main')}
        className="flex items-center gap-2 text-zinc-400 hover:text-white mb-3 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">Back</span>
      </button>
      <button
        onClick={handleBuyWithCard}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <CreditCard className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Buy with Card</span>
      </button>
      <button
        onClick={handleBuyWithCrypto}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Bitcoin className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Buy with Crypto</span>
      </button>
    </div>
  );

  const stakeMenuContent = (
    <div className="space-y-4">
      <button
        onClick={() => setMenuView('main')}
        className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">Back</span>
      </button>
      
      <div className="p-3 bg-white/5 backdrop-blur-md rounded-xl border border-white/10">
        <div className="flex items-center gap-2 mb-1">
          <Lock className="w-4 h-4 text-white" />
          <span className="text-white font-medium text-sm">Staking</span>
        </div>
        <p className="text-xs text-zinc-400">Stake your coins to earn rewards over time.</p>
      </div>
      
      <div>
        <label className="text-sm text-zinc-400 mb-1 block">Amount to Stake</label>
        <div className="relative">
          <img src={dehubCoin} alt="coins" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" />
          <Input
            type="number"
            placeholder="0"
            value={stakeAmount}
            onChange={(e) => setStakeAmount(e.target.value)}
            className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-zinc-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:ring-0 focus:border-white/10 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <p className="text-xs text-zinc-400 mt-1">Available: {balance.toLocaleString()} coins</p>
      </div>
      
      <div className="flex gap-2">
        <Button
          onClick={handleStakeAll}
          variant="outline"
          className="flex-1 bg-white/5 backdrop-blur-md border-white/10 text-white hover:bg-white/10"
        >
          Stake All
        </Button>
        <Button
          onClick={handleStakeCoins}
          disabled={!stakeAmount || Number(stakeAmount) <= 0 || Number(stakeAmount) > balance}
          className="flex-1 bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20"
        >
          Stake
        </Button>
      </div>
    </div>
  );

  const getMenuContent = () => {
    switch (menuView) {
      case 'receive':
        return <CopyAddressRows onBack={() => setMenuView('main')} />;
      case 'buy':
        return buyMenuContent;
      case 'stake':
        return stakeMenuContent;
      default:
        return mainMenuContent;
    }
  };

  // Use Drawer (sheet) for both desktop and mobile
  return (
    <Drawer open={isOpen} onOpenChange={handleOpenChange} modal={true}>
      <DrawerTrigger asChild>
        {coinButton}
      </DrawerTrigger>
      <DrawerContent column glass hideHandle={false} className="px-4 pt-1 pb-8">
        <DrawerHeader className="sr-only">
          <DrawerTitle>Coin Menu</DrawerTitle>
        </DrawerHeader>
        {getMenuContent()}
      </DrawerContent>
    </Drawer>
  );
}

// Export standalone wallet menu content for use in other drawers
export function WalletMenuContent({ balance, onClose }: WalletMenuContentProps) {
  const { walletAddress, requestWalletUnlock } = useAuth();
  const walletLocked = useWalletLocked();
  const navigate = useNavigate();
  const [menuView, setMenuView] = useState<MenuView>('main');
  const [stakeAmount, setStakeAmount] = useState('');
  const [copied, setCopied] = useState(false);
  const { hasChoice: hasAddressChoice } = useWalletAddresses();

  const formattedWalletAddress = useMemo(() => {
    if (!walletAddress) return null;
    return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
  }, [walletAddress]);

  const handleCopyAddress = () => {
    if (!walletAddress) {
      toast.error('No wallet connected');
      return;
    }
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    toast.success('Address copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBuyWithCard = () => {
    onClose?.();
    navigate('/app/buy');
  };

  const handleBuyWithCrypto = () => {
    onClose?.();
    navigate('/app/buy');
  };

  const handleStakeCoins = () => {
    if (!stakeAmount || Number(stakeAmount) <= 0) return;
    toast.success(`Staked ${stakeAmount} coins`);
    onClose?.();
  };

  const handleStakeAll = () => {
    if (balance <= 0) {
      toast.error('No coins to stake');
      return;
    }
    setStakeAmount(balance.toString());
  };

  // Live DHB quote — see the note on the same calculation in CoinBalanceMenu.
  const { data: prices } = useTokenPrices();
  const dhbPrice = prices?.DHB ?? 0;
  const dollarValue = (balance * dhbPrice).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const formatBalance = (value: number) => {
    if (value === 0) return '0';
    return value % 1 === 0 ? value.toLocaleString() : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  if (menuView === 'receive') {
    return <CopyAddressRows onBack={() => setMenuView('main')} />;
  }

  if (menuView === 'buy') {
    return (
      <div className="space-y-1">
        <button
          onClick={() => setMenuView('main')}
          className="flex items-center gap-2 text-zinc-400 hover:text-white mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>
        <button
          onClick={handleBuyWithCard}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
            <CreditCard className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-medium">Buy with Card</span>
        </button>
        <button
          onClick={handleBuyWithCrypto}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
            <Bitcoin className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-medium">Buy with Crypto</span>
        </button>
      </div>
    );
  }

  if (menuView === 'stake') {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setMenuView('main')}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>
        
        <div className="p-3 bg-white/5 backdrop-blur-md rounded-xl border border-white/10">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="w-4 h-4 text-white" />
            <span className="text-white font-medium text-sm">Staking</span>
          </div>
          <p className="text-xs text-zinc-400">Stake your coins to earn rewards over time.</p>
        </div>
        
        <div>
          <label className="text-sm text-zinc-400 mb-1 block">Amount to Stake</label>
          <div className="relative">
            <img src={dehubCoin} alt="coins" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" />
            <Input
              type="number"
              placeholder="0"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-zinc-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:ring-0 focus:border-white/10 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <p className="text-xs text-zinc-400 mt-1">Available: {balance.toLocaleString()} coins</p>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleStakeAll}
            className="flex-1 bg-white/5 border-white/10 text-white hover:bg-white/10"
          >
            Max
          </Button>
          <Button
            onClick={handleStakeCoins}
            disabled={!stakeAmount || Number(stakeAmount) <= 0}
            className="flex-1 bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 hover:border-white/40 text-white disabled:opacity-50"
          >
            Stake
          </Button>
        </div>
      </div>
    );
  }

  // Main menu
  return (
    <div className="space-y-1">
      <div className="px-3 py-3 mb-2 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 space-y-2">
        <div className="flex items-center gap-2">
          <img src={dehubCoin} alt="coins" className="w-5 h-5" />
          <span className="text-white font-semibold">{formatBalance(balance)}</span>
        </div>
        {/* Held back until a quote is in: rendering $0.00 against a real
            balance reads as "your coins are worthless", not as "loading". */}
        {dhbPrice > 0 && (
          <div className="flex items-center gap-2">
            <img src={usdcLogo} alt="USD" className="w-5 h-5" />
            <span className="text-zinc-400 font-medium">${dollarValue}</span>
          </div>
        )}
      </div>
      {walletLocked && <UnlockWalletRow onUnlock={requestWalletUnlock} />}
      <button
        onClick={() => setMenuView('buy')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Plus className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Buy Coins</span>
      </button>
      <button
        onClick={() => {
          toast.info('Cash out coming soon!');
        }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Minus className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Cash Out</span>
      </button>
      <button
        onClick={() => (hasAddressChoice ? setMenuView('receive') : handleCopyAddress())}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          {copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4 text-white" />}
        </div>
        <div className="flex flex-col">
          <span className="text-white font-medium">Receive Coins</span>
          <span className="text-xs text-zinc-400">{formattedWalletAddress ?? 'Connect wallet'}</span>
        </div>
      </button>
      <button
        onClick={() => setMenuView('stake')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Lock className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Stake Coins</span>
      </button>
    </div>
  );
}
