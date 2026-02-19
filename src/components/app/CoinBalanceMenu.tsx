import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Copy, Send, ArrowLeft, CreditCard, Bitcoin, Search, Check, History, Lock, Minus, LogOut } from 'lucide-react';
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
import { useTranslation } from 'react-i18next';
import dehubCoin from '@/assets/dehub-coin.png';
import usdcLogo from '@/assets/usdc-logo.png';
import { useAuth } from '@/contexts/AuthContext';
import { ChainSelector, type ChainId, SUPPORTED_CHAINS, getChainById } from './ChainSelector';

interface CoinBalanceMenuProps {
  balance: number;
  variant: 'desktop' | 'mobile';
  onAuthRequired?: () => boolean;
}

interface WalletMenuContentProps {
  balance: number;
  onClose?: () => void;
}

type MenuView = 'main' | 'buy' | 'send' | 'history' | 'stake';

// Mock users for send functionality
const MOCK_USERS = [
  { id: '1', username: 'alex_web3', avatar: null },
  { id: '2', username: 'crypto_queen', avatar: null },
  { id: '3', username: 'defi_degen', avatar: null },
  { id: '4', username: 'nft_collector', avatar: null },
  { id: '5', username: 'blockchain_dev', avatar: null },
];

// Mock transaction history
const MOCK_TRANSACTIONS = [
  { id: '1', type: 'received', amount: 500, from: 'alex_web3', date: '2024-01-15' },
  { id: '2', type: 'sent', amount: 200, to: 'crypto_queen', date: '2024-01-14' },
  { id: '3', type: 'staked', amount: 1000, date: '2024-01-13' },
  { id: '4', type: 'earned', amount: 50, description: 'Staking reward', date: '2024-01-12' },
  { id: '5', type: 'received', amount: 300, from: 'nft_collector', date: '2024-01-10' },
];

export function CoinBalanceMenu({ balance, variant, onAuthRequired }: CoinBalanceMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { walletAddress, isAuthenticated, disconnect } = useAuth();
  const navigate = useNavigate();

  const handleOpenChange = (open: boolean) => {
    if (open && onAuthRequired && !onAuthRequired()) {
      return;
    }
    setIsOpen(open);
    if (!open) resetMenu();
  };
  const [menuView, setMenuView] = useState<MenuView>('main');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<typeof MOCK_USERS[0] | null>(null);
  const [sendAmount, setSendAmount] = useState('');
  const [stakeAmount, setStakeAmount] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedChainId, setSelectedChainId] = useState<ChainId>(8453);

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

  const { t } = useTranslation();

  const handleLogout = async () => {
    try {
      await disconnect();
      toast.success(t('settings.loggedOut'));
    } catch {
      toast.error(t('settings.logoutFailed'));
    } finally {
      setIsOpen(false);
      resetMenu();
    }
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

  const handleSendCoins = () => {
    if (!selectedUser || !sendAmount) return;
    toast.success(`Sent ${sendAmount} coins to @${selectedUser.username}`);
    setIsOpen(false);
    setMenuView('main');
    setSelectedUser(null);
    setSendAmount('');
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
    setSearchQuery('');
    setSelectedUser(null);
    setSendAmount('');
    setStakeAmount('');
  };

  const filteredUsers = MOCK_USERS.filter((user) =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const coinButton = (
    <div 
      className={`group flex items-center justify-center cursor-pointer transition-colors ${variant === 'desktop' ? 'bg-zinc-900 rounded-full p-2 hover:bg-zinc-800' : 'w-8 h-8 rounded-full'}`}
    >
      <img 
        src={dehubCoin} 
        alt="coins" 
        className={`transition-all duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_rgba(255,215,0,0.6)] ${variant === 'mobile' ? 'h-[26px] w-[26px]' : 'h-5 w-5'}`}
      />
    </div>
  );

  // Mock dollar value calculation (e.g., 1 coin = $0.05)
  const rawDollarValue = balance * 0.05;
  const dollarValue = rawDollarValue === 0 ? '0' : rawDollarValue.toFixed(2);
  
  // Format balance: show 0 when zero, otherwise show with 2 decimals if has decimals
  const formatBalance = (value: number) => {
    if (value === 0) return '0';
    return value % 1 === 0 ? value.toLocaleString() : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const selectedChain = getChainById(selectedChainId);
  
  const mainMenuContent = (
    <div className="space-y-1">
      {/* Balance display with chain selector */}
      <div className="px-3 py-3 mb-2 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 space-y-2">
        {/* DeHub Coin Balance */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={dehubCoin} alt="coins" className="w-5 h-5" />
            <span className="text-white font-semibold">{formatBalance(balance)}</span>
          </div>
          <ChainSelector
            selectedChainId={selectedChainId}
            onChainChange={setSelectedChainId}
            variant="icon"
          />
        </div>
        {/* USD Balance with USDC logo */}
        <div className="flex items-center gap-2">
          <img src={usdcLogo} alt="USD" className="w-5 h-5" />
          <span className="text-zinc-400 font-medium">${dollarValue}</span>
        </div>
      </div>
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
        onClick={handleCopyAddress}
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
        onClick={() => setMenuView('send')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Send className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Send Coins</span>
      </button>
      <button
        onClick={() => setMenuView('history')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <History className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Transactions</span>
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

  const sendMenuContent = (
    <div className="space-y-3">
      <button
        onClick={() => setMenuView('main')}
        className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">Back</span>
      </button>

      {!selectedUser ? (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-zinc-400"
            />
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {filteredUsers.map((user) => (
              <button
                key={user.id}
                onClick={() => setSelectedUser(user)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white text-sm font-medium">
                  {user.username[0].toUpperCase()}
                </div>
                <span className="text-white">@{user.username}</span>
              </button>
            ))}
            {filteredUsers.length === 0 && (
              <p className="text-center text-zinc-400 py-4">No users found</p>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-medium">
              {selectedUser.username[0].toUpperCase()}
            </div>
            <div>
              <p className="text-white font-medium">@{selectedUser.username}</p>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-xs text-zinc-400 hover:text-zinc-300"
              >
                Change
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Amount</label>
            <div className="relative">
              <img src={dehubCoin} alt="coins" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" />
              <Input
                type="number"
                placeholder="0"
                value={sendAmount}
                onChange={(e) => setSendAmount(e.target.value)}
                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-zinc-400"
              />
            </div>
          </div>
          <Button
            onClick={handleSendCoins}
            disabled={!sendAmount || Number(sendAmount) <= 0}
            className="w-full bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 hover:border-white/40 text-white disabled:opacity-50"
          >
            Send Coins
          </Button>
        </div>
      )}
    </div>
  );

  const historyMenuContent = (
    <div className="space-y-3">
      <button
        onClick={() => setMenuView('main')}
        className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">Back</span>
      </button>
      
      <h3 className="text-white font-medium text-sm">Transactions</h3>
      
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {MOCK_TRANSACTIONS.map((tx) => (
          <div
            key={tx.id}
            className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10"
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                tx.type === 'received' || tx.type === 'earned' 
                  ? 'bg-white/10' 
                  : tx.type === 'staked' 
                    ? 'bg-white/10' 
                    : 'bg-white/10'
              }`}>
                {tx.type === 'received' || tx.type === 'earned' ? (
                  <Plus className="w-4 h-4 text-white" />
                ) : tx.type === 'staked' ? (
                  <Lock className="w-4 h-4 text-white" />
                ) : (
                  <Send className="w-4 h-4 text-white" />
                )}
              </div>
              <div>
                <p className="text-white text-sm font-medium capitalize">{tx.type}</p>
                <p className="text-xs text-zinc-400">
                  {tx.from && `from @${tx.from}`}
                  {tx.to && `to @${tx.to}`}
                  {tx.description && tx.description}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-white">
                {tx.type === 'received' || tx.type === 'earned' ? '+' : '-'}{tx.amount}
              </p>
              <p className="text-xs text-zinc-400">{tx.date}</p>
            </div>
          </div>
        ))}
      </div>
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
      case 'buy':
        return buyMenuContent;
      case 'send':
        return sendMenuContent;
      case 'history':
        return historyMenuContent;
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
      <DrawerContent glass className="px-4 pb-8">
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
  const { walletAddress } = useAuth();
  const [menuView, setMenuView] = useState<MenuView>('main');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<typeof MOCK_USERS[0] | null>(null);
  const [sendAmount, setSendAmount] = useState('');
  const [stakeAmount, setStakeAmount] = useState('');
  const [copied, setCopied] = useState(false);

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
    toast.info('Card payments coming soon!');
    onClose?.();
  };

  const handleBuyWithCrypto = () => {
    toast.info('Crypto payments coming soon!');
    onClose?.();
  };

  const handleSendCoins = () => {
    if (!selectedUser || !sendAmount) return;
    toast.success(`Sent ${sendAmount} coins to @${selectedUser.username}`);
    onClose?.();
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

  const filteredUsers = MOCK_USERS.filter((user) =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const rawDollarValue = balance * 0.05;
  const dollarValue = rawDollarValue === 0 ? '0' : rawDollarValue.toFixed(2);
  
  const formatBalance = (value: number) => {
    if (value === 0) return '0';
    return value % 1 === 0 ? value.toLocaleString() : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

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

  if (menuView === 'send') {
    return (
      <div className="space-y-3">
        <button
          onClick={() => setMenuView('main')}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>

        {!selectedUser ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-zinc-400"
              />
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {filteredUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => setSelectedUser(user)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white text-sm font-medium">
                    {user.username[0].toUpperCase()}
                  </div>
                  <span className="text-white">@{user.username}</span>
                </button>
              ))}
              {filteredUsers.length === 0 && (
                <p className="text-center text-zinc-400 py-4">No users found</p>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-medium">
                {selectedUser.username[0].toUpperCase()}
              </div>
              <div>
                <p className="text-white font-medium">@{selectedUser.username}</p>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="text-xs text-zinc-400 hover:text-zinc-300"
                >
                  Change
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Amount</label>
              <div className="relative">
                <img src={dehubCoin} alt="coins" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" />
                <Input
                  type="number"
                  placeholder="0"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-zinc-400"
                />
              </div>
            </div>
            <Button
              onClick={handleSendCoins}
              disabled={!sendAmount || Number(sendAmount) <= 0}
              className="w-full bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 hover:border-white/40 text-white disabled:opacity-50"
            >
              Send Coins
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (menuView === 'history') {
    return (
      <div className="space-y-3">
        <button
          onClick={() => setMenuView('main')}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>
        
        <h3 className="text-white font-medium text-sm">Transactions</h3>
        
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {MOCK_TRANSACTIONS.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/10">
                  {tx.type === 'received' || tx.type === 'earned' ? (
                    <Plus className="w-4 h-4 text-white" />
                  ) : tx.type === 'staked' ? (
                    <Lock className="w-4 h-4 text-white" />
                  ) : (
                    <Send className="w-4 h-4 text-white" />
                  )}
                </div>
                <div>
                  <p className="text-white text-sm font-medium capitalize">{tx.type}</p>
                  <p className="text-xs text-zinc-400">
                    {tx.from && `from @${tx.from}`}
                    {tx.to && `to @${tx.to}`}
                    {tx.description && tx.description}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-white">
                  {tx.type === 'received' || tx.type === 'earned' ? '+' : '-'}{tx.amount}
                </p>
                <p className="text-xs text-zinc-400">{tx.date}</p>
              </div>
            </div>
          ))}
        </div>
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
        <div className="flex items-center gap-2">
          <img src={usdcLogo} alt="USD" className="w-5 h-5" />
          <span className="text-zinc-400 font-medium">${dollarValue}</span>
        </div>
      </div>
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
        onClick={handleCopyAddress}
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
        onClick={() => setMenuView('send')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Send className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Send Coins</span>
      </button>
      <button
        onClick={() => setMenuView('history')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <History className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Transactions</span>
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