import { useState } from 'react';
import { Copy, CreditCard, Send, ArrowDownToLine, ArrowUpFromLine, Check, Clock, User, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { createOnrampSession } from '@/lib/api/dpay';
import { toast } from 'sonner';

export function FundActions() {
  const { walletAddress } = useAuth();
  const [copied, setCopied] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawTarget, setWithdrawTarget] = useState('');

  const handleBuy = async () => {
    try {
      const res = await createOnrampSession({
        walletAddress: walletAddress || '',
        currency: 'USD',
        amount: 50,
        tokenSymbol: 'DHB',
      });
      const url = (res as any)?.url || (res as any)?.redirectUrl;
      if (url) {
        window.open(url, '_blank');
      } else {
        toast.error('Unable to open payment gateway');
      }
    } catch {
      toast.error('Failed to start purchase session');
    }
  };

  const handleCopyAddress = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    toast.success('Address copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex gap-2">
      {/* Add Funds */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="glass" className="text-sm h-9 px-4 rounded-lg">
            <ArrowDownToLine className="w-3.5 h-3.5 mr-1.5" />
            Add funds
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 bg-zinc-900 border-zinc-800">
          <DropdownMenuItem onClick={handleBuy} className="gap-2 cursor-pointer">
            <CreditCard className="w-4 h-4" />
            Buy
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCopyAddress} className="gap-2 cursor-pointer">
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            Transfer to me
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Withdraw */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="glass" className="text-sm h-9 px-4 rounded-lg">
            <ArrowUpFromLine className="w-3.5 h-3.5 mr-1.5" />
            Withdraw
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 bg-zinc-900 border-zinc-800">
          <DropdownMenuItem onClick={() => setWithdrawOpen(true)} className="gap-2 cursor-pointer">
            <Send className="w-4 h-4" />
            Transfer
          </DropdownMenuItem>
          <DropdownMenuItem disabled className="gap-2 cursor-pointer opacity-50">
            <Wallet className="w-4 h-4" />
            Bank Card
            <span className="ml-auto text-[10px] text-zinc-500 font-medium">SOON</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Transfer Dialog */}
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Transfer DHB</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm text-zinc-400">Wallet address or username</label>
              <Input
                placeholder="0x... or @username"
                value={withdrawTarget}
                onChange={(e) => setWithdrawTarget(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <Button
              variant="glass"
              className="w-full"
              disabled={!withdrawTarget.trim()}
              onClick={() => {
                toast.info('Transfer feature coming soon');
                setWithdrawOpen(false);
                setWithdrawTarget('');
              }}
            >
              <Send className="w-4 h-4 mr-2" />
              Send
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
