import { useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from '@/components/ui/drawer';

interface QuickBuyButtonProps {
  symbol: string;
  tokenType: 'stock' | 'crypto';
}

const PRESET_AMOUNTS = [1, 10, 100, 1000, 10000];

export function QuickBuyButton({ symbol, tokenType }: QuickBuyButtonProps) {
  const [open, setOpen] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [confirming, setConfirming] = useState(false);

  const activeAmount = selectedAmount ?? (customAmount ? parseFloat(customAmount) : null);
  const isValid = activeAmount != null && activeAmount > 0 && isFinite(activeAmount);

  const handlePreset = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmount('');
  };

  const handleCustomChange = (val: string) => {
    const cleaned = val.replace(/[^0-9.]/g, '');
    setCustomAmount(cleaned);
    setSelectedAmount(null);
  };

  const handleConfirm = () => {
    setConfirming(true);
    setTimeout(() => {
      toast.info('Coming soon — Quick Buy is under development', {
        description: `Buy $${activeAmount?.toLocaleString()} of ${symbol} will be available soon.`,
      });
      setConfirming(false);
      setOpen(false);
      setSelectedAmount(null);
      setCustomAmount('');
    }, 600);
  };

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={cn(
          "p-1.5 rounded-xl transition-all",
          "bg-gradient-to-br from-white/20 via-white/10 to-white/5",
          "backdrop-blur-xl border border-white/30",
          "shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]",
          "hover:from-white/30 hover:via-white/15 hover:to-white/10",
          "hover:shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-1px_0_rgba(255,255,255,0.15)]",
          "text-white"
        )}
        title={`Quick Buy ${symbol}`}
      >
        <ShoppingCart className="w-4 h-4" />
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent glass>
          <DrawerTitle className="sr-only">Quick Buy {symbol}</DrawerTitle>
          <div className="px-5 pt-3 pb-2">
            <span className="text-white text-sm font-semibold">Quick Buy ${symbol}</span>
          </div>

          <div className="px-5 pb-3">
            <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-2">Select Amount (USD)</p>
            <div className="grid grid-cols-3 gap-1.5">
              {PRESET_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  onClick={() => handlePreset(amount)}
                  className={cn(
                    "py-2.5 rounded-xl text-xs font-medium transition-all border",
                    selectedAmount === amount
                      ? "bg-white/20 border-white/30 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
                      : "bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white"
                  )}
                >
                  ${amount >= 1000 ? `${(amount / 1000)}K` : amount}
                </button>
              ))}
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  data-vaul-no-drag
                  value={customAmount}
                  onChange={(e) => handleCustomChange(e.target.value)}
                  placeholder="Custom"
                  className={cn(
                    "w-full py-2.5 pl-5 pr-1 rounded-xl text-xs font-medium transition-all border bg-transparent outline-none",
                    customAmount
                      ? "bg-white/20 border-white/30 text-white"
                      : "bg-white/5 border-white/10 text-zinc-400 placeholder:text-zinc-600"
                  )}
                />
              </div>
            </div>
          </div>

          <div className="px-5 py-2 border-t border-white/5">
            <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1.5">Pay with</p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-zinc-300">ETH</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-zinc-300">USDT</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-zinc-300">DHB</span>
            </div>
          </div>

          <div className="px-5 py-4">
            <button
              disabled={!isValid || confirming}
              onClick={handleConfirm}
              className={cn(
                "w-full py-3 rounded-xl text-sm font-semibold transition-all",
                "bg-gradient-to-br from-white/20 via-white/10 to-white/5",
                "backdrop-blur-xl border border-white/30",
                "shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]",
                isValid && !confirming
                  ? "text-white hover:from-white/30 hover:via-white/15 hover:to-white/10"
                  : "text-zinc-600 opacity-50 cursor-not-allowed"
              )}
            >
              {confirming ? 'Processing...' : isValid ? `Buy $${activeAmount?.toLocaleString()} of ${symbol}` : 'Select an amount'}
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
