import { useState } from 'react';
import { Plus, Copy, Send, ArrowLeft, CreditCard, Bitcoin, Search, Check, History, Coins } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import dehubCoin from '@/assets/dehub-coin.png';

interface CoinBalanceMenuProps {
  balance: number;
  variant: 'desktop' | 'mobile';
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

export function CoinBalanceMenu({ balance, variant }: CoinBalanceMenuProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [menuView, setMenuView] = useState<MenuView>('main');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<typeof MOCK_USERS[0] | null>(null);
  const [sendAmount, setSendAmount] = useState('');
  const [stakeAmount, setStakeAmount] = useState('');
  const [copied, setCopied] = useState(false);

  // TODO: Replace with actual wallet address
  const walletAddress = '0x1234...5678';

  const handleCopyAddress = () => {
    navigator.clipboard.writeText('0x1234567890abcdef1234567890abcdef12345678');
    setCopied(true);
    toast({
      title: 'Address Copied',
      description: 'Wallet address copied to clipboard',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBuyWithCard = () => {
    toast({
      title: 'Coming Soon',
      description: 'Card payments will be available soon',
    });
    setIsOpen(false);
    setMenuView('main');
  };

  const handleBuyWithCrypto = () => {
    toast({
      title: 'Coming Soon',
      description: 'Crypto payments will be available soon',
    });
    setIsOpen(false);
    setMenuView('main');
  };

  const handleSendCoins = () => {
    if (!selectedUser || !sendAmount) return;
    toast({
      title: 'Coins Sent',
      description: `Sent ${sendAmount} coins to @${selectedUser.username}`,
    });
    setIsOpen(false);
    setMenuView('main');
    setSelectedUser(null);
    setSendAmount('');
  };

  const handleStakeCoins = () => {
    if (!stakeAmount || Number(stakeAmount) <= 0) return;
    toast({
      title: 'Coins Staked',
      description: `Successfully staked ${stakeAmount} coins`,
    });
    setIsOpen(false);
    setMenuView('main');
    setStakeAmount('');
  };

  const handleStakeAll = () => {
    if (balance <= 0) {
      toast({
        title: 'No Coins',
        description: 'You have no coins to stake',
        variant: 'destructive',
      });
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
    <div className={`flex items-center gap-1.5 bg-zinc-900 rounded-full cursor-pointer hover:bg-zinc-800 transition-colors ${variant === 'desktop' ? 'px-2.5 py-1.5' : 'px-2 py-1'}`}>
      <img src={dehubCoin} alt="coins" className={variant === 'desktop' ? 'h-5 w-5' : 'h-4 w-4'} />
      <span className={`font-semibold text-white ${variant === 'desktop' ? 'text-sm' : 'text-xs'}`}>
        {balance.toLocaleString()}
      </span>
    </div>
  );

  const mainMenuContent = (
    <div className="space-y-1">
      <button
        onClick={() => setMenuView('buy')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
          <Plus className="w-4 h-4 text-green-500" />
        </div>
        <span className="text-white font-medium">Buy Coins</span>
      </button>
      <button
        onClick={handleCopyAddress}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
          {copied ? <Check className="w-4 h-4 text-blue-500" /> : <Copy className="w-4 h-4 text-blue-500" />}
        </div>
        <div className="flex flex-col">
          <span className="text-white font-medium">Receive Coins</span>
          <span className="text-xs text-zinc-400">{walletAddress}</span>
        </div>
      </button>
      <button
        onClick={() => setMenuView('send')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
          <Send className="w-4 h-4 text-purple-500" />
        </div>
        <span className="text-white font-medium">Send Coins</span>
      </button>
      <button
        onClick={() => setMenuView('history')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center">
          <History className="w-4 h-4 text-cyan-500" />
        </div>
        <span className="text-white font-medium">Transaction History</span>
      </button>
      <button
        onClick={() => setMenuView('stake')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
          <Coins className="w-4 h-4 text-yellow-500" />
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
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
          <CreditCard className="w-4 h-4 text-orange-500" />
        </div>
        <span className="text-white font-medium">Buy with Card</span>
      </button>
      <button
        onClick={handleBuyWithCrypto}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
          <Bitcoin className="w-4 h-4 text-yellow-500" />
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
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-sm font-medium">
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
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
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
      
      <h3 className="text-white font-medium text-sm">Transaction History</h3>
      
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {MOCK_TRANSACTIONS.map((tx) => (
          <div
            key={tx.id}
            className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10"
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                tx.type === 'received' || tx.type === 'earned' 
                  ? 'bg-green-500/20' 
                  : tx.type === 'staked' 
                    ? 'bg-yellow-500/20' 
                    : 'bg-red-500/20'
              }`}>
                {tx.type === 'received' || tx.type === 'earned' ? (
                  <Plus className={`w-4 h-4 ${tx.type === 'received' || tx.type === 'earned' ? 'text-green-500' : ''}`} />
                ) : tx.type === 'staked' ? (
                  <Coins className="w-4 h-4 text-yellow-500" />
                ) : (
                  <Send className="w-4 h-4 text-red-500" />
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
              <p className={`text-sm font-medium ${
                tx.type === 'received' || tx.type === 'earned' 
                  ? 'text-green-500' 
                  : tx.type === 'staked' 
                    ? 'text-yellow-500' 
                    : 'text-red-500'
              }`}>
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
      
      <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
        <div className="flex items-center gap-2 mb-1">
          <Coins className="w-4 h-4 text-yellow-500" />
          <span className="text-yellow-500 font-medium text-sm">Staking</span>
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
          className="flex-1 border-white/10 bg-white text-black hover:bg-white/90"
        >
          Stake All
        </Button>
        <Button
          onClick={handleStakeCoins}
          disabled={!stakeAmount || Number(stakeAmount) <= 0 || Number(stakeAmount) > balance}
          className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white"
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

  if (variant === 'desktop') {
    return (
      <DropdownMenu open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetMenu(); }}>
        <DropdownMenuTrigger asChild>
          {coinButton}
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          align="end" 
          glass
          className="w-64 p-2"
          sideOffset={8}
        >
          {getMenuContent()}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Drawer open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetMenu(); }}>
      <DrawerTrigger asChild>
        {coinButton}
      </DrawerTrigger>
      <DrawerContent glass className="px-4 pb-8">
        <DrawerHeader className="mb-2">
          <DrawerTitle className="text-white flex items-center gap-2">
            <img src={dehubCoin} alt="coins" className="w-6 h-6" />
            {balance.toLocaleString()} Coins
          </DrawerTitle>
        </DrawerHeader>
        {getMenuContent()}
      </DrawerContent>
    </Drawer>
  );
}