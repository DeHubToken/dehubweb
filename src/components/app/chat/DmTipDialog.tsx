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
import { Interface } from 'ethers';
import {
  writeContractAA,
  getWalletAddress,
  getERC20Balance,
  switchChain,
  parseTxError,
} from '@/lib/contracts/aa-utils';
import { DHB_TOKEN, toWei, getChainConfig, BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { emitSendMessage } from '@/lib/api/dehub/dm-socket';
import { getAuthToken, DEHUB_API_BASE } from '@/lib/api/dehub/core';


const erc20TransferInterface = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

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
      const chainConfig = getChainConfig(chainId);

      await switchChain(chainId);
      const signerAddress = await getWalletAddress();

      const amountWei = toWei(parsedAmount, DHB_TOKEN.decimals);
      const balance = await getERC20Balance(chainConfig.dhbToken, signerAddress);

      if (balance < amountWei) {
        const balanceHuman = Number(balance) / 1e18;
        toast.error(`Insufficient DHB. Need ${parsedAmount.toLocaleString()} but have ${balanceHuman.toFixed(2)}`);
        setIsSending(false);
        return;
      }

      toast.loading('Sending tip...', { id: 'dm-tip' });

      const result = await writeContractAA(
        chainConfig.dhbToken,
        erc20TransferInterface,
        'transfer',
        [recipientAddress, amountWei],
        { context: 'DM tip', chainId }
      );

      await result.wait(1);

      // Send tip message via socket
      emitSendMessage({
        dmId: conversationId,
        content: `Tipped ${parsedAmount.toLocaleString()} DHB`,
        type: 'tip',
        tipTxHash: result.hash,
      });

      // Call tip-notify API for ranking
      try {
        const token = getAuthToken();
        if (token) {
          await fetch(`${DEHUB_API_BASE}/api/dm/tip-notify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              txHash: result.hash,
              receiverAddress: recipientAddress.toLowerCase(),
              amount: parsedAmount,
              chainId,
            }),
          });
        }
      } catch (notifyErr) {
        console.warn('[DmTip] tip-notify failed:', notifyErr);
      }

      toast.success(`Sent ${parsedAmount.toLocaleString()} DHB to ${recipientName}! 🎉`, { id: 'dm-tip' });
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
                  <span className="inline-flex items-center gap-1">{val.toLocaleString()} <img src={dehubCoin} alt="DHB" className="w-4 h-4" /></span>
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
