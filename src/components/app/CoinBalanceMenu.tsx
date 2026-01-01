import { useState } from 'react';
import { Plus, Copy, Send, ArrowLeft, CreditCard, Bitcoin, Search, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import dehubCoin from '@/assets/dehub-coin.png';

interface CoinBalanceMenuProps {
  balance: number;
  variant: 'desktop' | 'mobile';
}

type MenuView = 'main' | 'buy' | 'send';

// Mock users for send functionality
const MOCK_USERS = [
  { id: '1', username: 'alex_web3', avatar: null },
  { id: '2', username: 'crypto_queen', avatar: null },
  { id: '3', username: 'defi_degen', avatar: null },
  { id: '4', username: 'nft_collector', avatar: null },
  { id: '5', username: 'blockchain_dev', avatar: null },
];

export function CoinBalanceMenu({ balance, variant }: CoinBalanceMenuProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [menuView, setMenuView] = useState<MenuView>('main');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<typeof MOCK_USERS[0] | null>(null);
  const [sendAmount, setSendAmount] = useState('');
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

  const resetMenu = () => {
    setMenuView('main');
    setSearchQuery('');
    setSelectedUser(null);
    setSendAmount('');
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
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
          <Plus className="w-4 h-4 text-green-500" />
        </div>
        <span className="text-white font-medium">Buy Coins</span>
      </button>
      <button
        onClick={handleCopyAddress}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
          {copied ? <Check className="w-4 h-4 text-blue-500" /> : <Copy className="w-4 h-4 text-blue-500" />}
        </div>
        <div className="flex flex-col">
          <span className="text-white font-medium">Receive Coins</span>
          <span className="text-xs text-zinc-500">{walletAddress}</span>
        </div>
      </button>
      <button
        onClick={() => setMenuView('send')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
          <Send className="w-4 h-4 text-purple-500" />
        </div>
        <span className="text-white font-medium">Send Coins</span>
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
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
          <CreditCard className="w-4 h-4 text-orange-500" />
        </div>
        <span className="text-white font-medium">Buy with Card</span>
      </button>
      <button
        onClick={handleBuyWithCrypto}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800 transition-colors text-left"
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
            />
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {filteredUsers.map((user) => (
              <button
                key={user.id}
                onClick={() => setSelectedUser(user)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-white text-sm font-medium">
                  {user.username[0].toUpperCase()}
                </div>
                <span className="text-white">@{user.username}</span>
              </button>
            ))}
            {filteredUsers.length === 0 && (
              <p className="text-center text-zinc-500 py-4">No users found</p>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-white font-medium">
              {selectedUser.username[0].toUpperCase()}
            </div>
            <div>
              <p className="text-white font-medium">@{selectedUser.username}</p>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-xs text-zinc-500 hover:text-zinc-300"
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
                className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
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

  const getMenuContent = () => {
    switch (menuView) {
      case 'buy':
        return buyMenuContent;
      case 'send':
        return sendMenuContent;
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
          className="w-64 bg-zinc-900 border-zinc-800 p-2"
          sideOffset={8}
        >
          {getMenuContent()}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetMenu(); }}>
      <SheetTrigger asChild>
        {coinButton}
      </SheetTrigger>
      <SheetContent side="bottom" className="bg-zinc-900 border-zinc-800 rounded-t-2xl">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-white flex items-center gap-2">
            <img src={dehubCoin} alt="coins" className="w-6 h-6" />
            {balance.toLocaleString()} Coins
          </SheetTitle>
        </SheetHeader>
        {getMenuContent()}
      </SheetContent>
    </Sheet>
  );
}