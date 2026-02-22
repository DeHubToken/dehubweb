import { useState } from 'react';
import { Copy, CreditCard, Send, ArrowDownToLine, ArrowUpFromLine, Check, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { createOnrampSession } from '@/lib/api/dpay';
import { toast } from 'sonner';

export function FundActions() {
  const { walletAddress } = useAuth();
  const [copied, setCopied] = useState(false);
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [withdrawTarget, setWithdrawTarget] = useState('');

  const handleBuy = async () => {
    setAddFundsOpen(false);
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
      {/* Add Funds Button */}
      <Button variant="glass" className="text-sm h-9 px-2.5 sm:px-4 rounded-lg" onClick={() => setAddFundsOpen(true)}>
        <ArrowDownToLine className="w-3.5 h-3.5 sm:mr-1.5" />
        <span className="hidden sm:inline">Add funds</span>
      </Button>

      {/* Withdraw Button */}
      <Button variant="glass" className="text-sm h-9 px-2.5 sm:px-4 rounded-lg" onClick={() => setWithdrawOpen(true)}>
        <ArrowUpFromLine className="w-3.5 h-3.5 sm:mr-1.5" />
        <span className="hidden sm:inline">Withdraw</span>
      </Button>

      {/* Add Funds Drawer */}
      <Drawer open={addFundsOpen} onOpenChange={setAddFundsOpen}>
        <DrawerContent glass hideHandle={false}>
          <div className="p-5 pb-8 space-y-2">
            <h3 className="text-white font-semibold text-base mb-4">Add Funds</h3>
            <button
              onClick={handleBuy}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] backdrop-blur-sm border border-white/10 transition-colors"
            >
              <CreditCard className="w-5 h-5 text-white/70" />
              <div className="text-left">
                <span className="text-sm font-medium text-white">Buy</span>
                <p className="text-xs text-white/40">Purchase with card</p>
              </div>
            </button>
            <button
              onClick={() => { handleCopyAddress(); setAddFundsOpen(false); }}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] backdrop-blur-sm border border-white/10 transition-colors"
            >
              {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5 text-white/70" />}
              <div className="text-left">
                <span className="text-sm font-medium text-white">Transfer to me</span>
                <p className="text-xs text-white/40">Copy your wallet address</p>
              </div>
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Withdraw Drawer */}
      <Drawer open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DrawerContent glass hideHandle={false}>
          <div className="p-5 pb-8 space-y-2">
            <h3 className="text-white font-semibold text-base mb-4">Withdraw</h3>
            <button
              onClick={() => { setWithdrawOpen(false); setTimeout(() => setTransferOpen(true), 200); }}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] backdrop-blur-sm border border-white/10 transition-colors"
            >
              <Send className="w-5 h-5 text-white/70" />
              <div className="text-left">
                <span className="text-sm font-medium text-white">Transfer</span>
                <p className="text-xs text-white/40">Send to wallet or username</p>
              </div>
            </button>
            <button
              disabled
              className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.06] border border-white/10 opacity-50 cursor-not-allowed"
            >
              <Wallet className="w-5 h-5 text-white/70" />
              <div className="text-left flex-1">
                <span className="text-sm font-medium text-white">Bank Card</span>
                <p className="text-xs text-white/40">Withdraw to bank</p>
              </div>
              <span className="text-[10px] text-white/30 font-medium bg-white/[0.06] px-2 py-0.5 rounded">SOON</span>
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Transfer Drawer */}
      <Drawer open={transferOpen} onOpenChange={setTransferOpen}>
        <DrawerContent glass hideHandle={false}>
          <div className="p-5 pb-8 space-y-4">
            <h3 className="text-white font-semibold text-base">Transfer DHB</h3>
            <div className="space-y-2">
              <label className="text-sm text-white/50">Wallet address or username</label>
              <Input
                placeholder="0x... or @username"
                value={withdrawTarget}
                onChange={(e) => setWithdrawTarget(e.target.value)}
                className="bg-white/[0.06] border-white/10 text-white backdrop-blur-sm"
              />
            </div>
            <Button
              variant="glass"
              className="w-full rounded-xl"
              disabled={!withdrawTarget.trim()}
              onClick={() => {
                toast.info('Transfer feature coming soon');
                setTransferOpen(false);
                setWithdrawTarget('');
              }}
            >
              <Send className="w-4 h-4 mr-2" />
              Send
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
