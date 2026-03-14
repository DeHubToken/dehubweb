/**
 * DmTipDialog Component
 * =====================
 * Drawer for sending a DHB tip inside a DM conversation.
 * Matches the liquid glass aesthetic of TipModal.
 */

import { useState } from 'react';
import { Gem, Loader2 } from 'lucide-react';
import dehubCoin from '@/assets/dehub-coin.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { toast } from 'sonner';
import { dhbText } from '@/lib/dhb-toast';
import {
  getWalletAddress,
  switchChain,
  parseTxError,
} from '@/lib/contracts/aa-utils';
import { BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { sendTip } from '@/lib/contracts/stream-controller';
import { apiCall } from '@/lib/api/dehub/core';

const QUICK_AMOUNTS = [500, 1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 1_000_000];

interface DmTipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientAddress: string;
  recipientName: string;
  conversationId: string;
}

export function DmTipDialog({
  open,
  onOpenChange,
  recipientAddress,
  recipientName,
  conversationId,
}: DmTipDialogProps) {
  const [amount, setAmount] = useState('');
  const [isSending, setIsSending] = useState(false);

  const parsedAmount = parseFloat(amount);
  const isValidAmount = !Number.isNaN(parsedAmount) && parsedAmount >= 1;

  const handleQuickAmount = (val: number) => {
    setAmount(String(val));
  };

  const handleTip = async () => {
    if (!isValidAmount) return;

    setIsSending(true);
    try {
      const chainId = BASE_CHAIN_ID;

      await switchChain(chainId);
      const signerAddress = await getWalletAddress();

      toast.loading('Sending tip...', { id: 'dm-tip' });

      const confirmedTxHash = await sendTip({
        tokenId: 0,
        amount: parsedAmount,
        to: recipientAddress,
        chainId,
      });

      // Notify backend — this creates the inline tip message (msgType:'tip') in the conversation
      // and registers it for Alchemy webhook confirmation.
      // DO NOT emit sendMessage via socket — backend handles the tip message creation.
      try {
        await apiCall('/api/dm/tip-notify', {
          method: 'POST',
          body: {
            txHash: confirmedTxHash,
            conversationId,
            senderAddress: signerAddress,
          },
          requiresAuth: true,
        });
      } catch (notifyErr) {
        console.warn('[DmTip] tip-notify failed (non-fatal):', notifyErr);
      }

      toast.success(dhbText(`Sent ${parsedAmount.toLocaleString()} DHB to ${recipientName}! 🎉`), { id: 'dm-tip' });
      setAmount('');
      onOpenChange(false);
    } catch (error: unknown) {
      console.error('[DmTip] Failed:', error);
      const message = parseTxError(error as Error);
      toast.error(message || 'Tip failed', { id: 'dm-tip' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass className="px-4 pb-6">
        <DrawerHeader className="pb-3">
          <DrawerTitle className="text-white text-lg flex items-center justify-center gap-2">
            <Gem className="w-5 h-5 text-white" />
            Send Tip
          </DrawerTitle>
          {recipientName && (
            <p className="text-white/60 text-sm mt-1">
              Tip {recipientName}
            </p>
          )}
        </DrawerHeader>
        <div className="flex flex-col gap-4">
          {/* Quick amounts */}
          <div>
            <p className="text-white/60 text-xs mb-2">Quick amounts</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleQuickAmount(val)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    amount === String(val)
                      ? 'bg-amber-500/30 text-amber-400 border border-amber-500/50'
                      : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
                  }`}
                >
                  <span className="inline-flex items-center gap-1">{val.toLocaleString()} <img src={dehubCoin} alt="DHB" className="w-4 h-4" style={{ marginTop: '-1px' }} /></span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom amount */}
          <div>
            <p className="text-white/60 text-xs mb-2">Or enter amount</p>
            <div className="relative">
              <img src={dehubCoin} alt="DHB" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" />
              <Input
                type="number"
                min={1}
                step={0.1}
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-11 bg-white/5 border-white/10 text-white placeholder:text-white/40 h-12"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-2">
            <LiquidGlassBubble
              shimmer={false}
              className="flex-1 cursor-pointer"
              onClick={isSending ? undefined : () => onOpenChange(false)}
            >
              <span className="block text-center text-white text-sm font-medium">
                Close
              </span>
            </LiquidGlassBubble>
            <Button
              variant="glass"
              className="flex-1 bg-yellow-500/25 hover:bg-yellow-500/35 border-yellow-500/40 text-yellow-300"
              onClick={handleTip}
              disabled={isSending || !isValidAmount}
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>Send</>
              )}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
