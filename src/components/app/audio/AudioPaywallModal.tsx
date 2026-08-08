/**
 * Audio generation paywall.
 * =========================
 * Only three of the nine audio tools reach this: music, voice changer and
 * dubbing. The other six cost a fraction of a cent a run and stay free, the
 * same way the editor's voiceover button always has — see the note in
 * audio-models.constants.ts.
 *
 * The payment sequence is copied from Model3dPaywallModal deliberately, and
 * must stay that way. It carries fixes that were paid for in real money: the
 * receipt status is checked (a reverted transfer resolves rather than throws,
 * so skipping it hands out free generations), the loading toast is dismissed on
 * every early return, and the drawer cannot be closed mid-transfer.
 *
 * ── Metered, unlike the other paywalls ───────────────────────────────────────
 * Image and 3D charge per generation. These three charge per unit of LENGTH,
 * and the length is known before the call: the creator picks it for music, and
 * the composer reads it off the upload for the other two. `units` arrives
 * already computed so the number on the button is the number that is charged.
 */
import { useEffect, useState } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, AlertCircle, Lightbulb, Music2 } from 'lucide-react';
import {
  getAudioCostDhb,
  getAudioCostUsd,
  type AudioTaskSpec,
} from '@/constants/audio-models.constants';
import { supabase } from '@/integrations/supabase/client';
import dhbCoinImage from '@/assets/dehub-coin.png';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { toast } from 'sonner';
import { Interface } from 'ethers';
import {
  writeContractAA,
  getWalletAddress,
  getERC20Balance,
  switchChain,
  parseTxError,
} from '@/lib/contracts/aa-utils';
import { DHB_TOKEN, toWei, getChainConfig, BASE_CHAIN_ID, BNB_CHAIN_ID } from '@/lib/contracts/dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';

const DEHUB_AI_TREASURY = '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c';
const erc20TransferInterface = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

interface AudioPaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spec: AudioTaskSpec;
  /** Billable units, already computed from the chosen length or the upload. */
  units: number;
  /** Human summary of what is being charged for, e.g. "60s track". */
  quantityLabel: string;
  onConfirm: () => void;
}

export function AudioPaywallModal({
  open,
  onOpenChange,
  spec,
  units,
  quantityLabel,
  onConfirm,
}: AudioPaywallModalProps) {
  const [dhbPrice, setDhbPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  const { walletAddress } = useAuth();
  const { data: profile } = useDeHubProfile({
    userId: walletAddress || undefined,
    enabled: !!walletAddress,
  });
  const userBalance = profile?.badgeBalance ?? 0;

  useEffect(() => {
    if (open) void fetchDhbPrice();
  }, [open]);

  const fetchDhbPrice = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase.functions.invoke('get-dhb-price');
      if (fetchError) throw fetchError;
      const price = data?.prices?.DHB;
      if (!price) throw new Error('Failed to get DHB price');
      setDhbPrice(price);
    } catch (err) {
      console.error('Error fetching DHB price:', err);
      setError('Failed to fetch DHB price. Using fallback.');
      setDhbPrice(0.0006191);
    } finally {
      setLoading(false);
    }
  };

  const costUsd = getAudioCostUsd(spec, units);
  const costDhb = dhbPrice ? getAudioCostDhb(spec, dhbPrice, units) : 0;
  const hasEnoughBalance = userBalance >= costDhb;

  const formatDhb = (amount: number) => {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
    return amount.toFixed(0);
  };

  const handlePayAndGenerate = async () => {
    if (costDhb <= 0) return;
    setIsPaying(true);
    try {
      const signerAddress = await getWalletAddress();
      const amountWei = toWei(costDhb, DHB_TOKEN.decimals);

      const baseConfig = getChainConfig(BASE_CHAIN_ID);
      const bnbConfig = getChainConfig(BNB_CHAIN_ID);
      // A flaky RPC reads as a zero balance rather than aborting, matching the
      // image, video and 3D paywalls.
      const [baseBalance, bnbBalance] = await Promise.all([
        getERC20Balance(baseConfig.dhbToken, signerAddress, BASE_CHAIN_ID).catch(() => BigInt(0)),
        getERC20Balance(bnbConfig.dhbToken, signerAddress, BNB_CHAIN_ID).catch(() => BigInt(0)),
      ]);

      let payChainId: ChainId;
      if (baseBalance >= amountWei) {
        payChainId = BASE_CHAIN_ID;
      } else if (bnbBalance >= amountWei) {
        payChainId = BNB_CHAIN_ID;
      } else {
        const baseDhb = Number(baseBalance) / 1e18;
        const bnbDhb = Number(bnbBalance) / 1e18;
        toast.dismiss('audio-gen-payment');
        toast.error(
          `Insufficient DHB. Need ${formatDhb(costDhb)} DHB (Base: ${formatDhb(baseDhb)}, BNB: ${formatDhb(bnbDhb)})`,
        );
        setIsPaying(false);
        return;
      }

      const chainConfig = getChainConfig(payChainId);
      await switchChain(payChainId);

      toast.loading('Processing payment...', { id: 'audio-gen-payment' });
      const result = await writeContractAA(
        chainConfig.dhbToken,
        erc20TransferInterface,
        'transfer',
        [DEHUB_AI_TREASURY, amountWei],
        { context: `AI ${spec.label.toLowerCase()} payment`, chainId: payChainId },
      );
      // wait() resolves with status 0 for a REVERTED transaction rather than
      // throwing, so skipping the receipt would hand out a free generation
      // every time the transfer failed on chain.
      const receipt = await result.wait(1);
      if (receipt?.status !== 1) {
        throw new Error('The DHB transfer did not go through. Nothing has been charged.');
      }
      toast.success('Payment confirmed! Starting…', { id: 'audio-gen-payment' });
      onConfirm();
    } catch (err: unknown) {
      console.error('[AudioPaywall] Payment failed:', err);
      const msg = parseTxError(err);
      toast.dismiss('audio-gen-payment');
      toast.error(msg || 'Payment failed.');
    } finally {
      setIsPaying(false);
    }
  };

  return (
    // Locked while paying: dismissing mid-transfer only unmounts the UI, it
    // cannot recall the on-chain transfer, and the generation would be lost
    // with the money already gone.
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next && isPaying) return;
        onOpenChange(next);
      }}
    >
      <DrawerContent glass hideHandle={false} className="max-h-[85vh]">
        <DrawerHeader className="text-left pb-2">
          <DrawerTitle className="flex items-center gap-2 text-white">
            <Music2 className="w-5 h-5 text-cyan-400" />
            {spec.label}
          </DrawerTitle>
          <DrawerDescription className="text-zinc-400">
            Confirm payment to start
          </DrawerDescription>
        </DrawerHeader>

        <ScrollArea className="flex-1 overflow-y-auto px-4">
          <div className="space-y-3 pb-4">
            <div className="rounded-xl bg-zinc-800/50 p-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">{spec.emoji}</span>
                <div className="min-w-0">
                  <p className="font-medium text-white text-sm">{spec.label}</p>
                  <p className="text-xs text-zinc-500">{spec.description}</p>
                </div>
              </div>
            </div>

            {!!spec.tips?.length && (
              <div className="rounded-xl bg-zinc-800/30 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
                  Tips
                </p>
                <ul className="space-y-1">
                  {spec.tips.map((tip) => (
                    <li key={tip} className="text-xs leading-relaxed text-zinc-400">
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-xl bg-zinc-800/50 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Length</span>
                <span className="font-medium text-white">{quantityLabel}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-zinc-400">Estimated time</span>
                <span className="font-medium text-white">{spec.typicalDuration}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-zinc-700/60 pt-2 text-sm">
                <span className="text-zinc-400">Total</span>
                <span className="flex items-center gap-1.5 font-semibold text-white">
                  <img src={dhbCoinImage} alt="" className="h-4 w-4" />
                  {loading ? '…' : `${formatDhb(costDhb)} DHB`}
                  <span className="text-xs font-normal text-zinc-500">
                    (${costUsd.toFixed(2)})
                  </span>
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className="text-zinc-500">Your balance</span>
                <span className={hasEnoughBalance ? 'text-zinc-400' : 'text-red-400'}>
                  {formatDhb(userBalance)} DHB
                </span>
              </div>
            </div>

            {error && (
              <p className="flex items-center gap-1.5 text-xs text-amber-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 pt-2">
          <Button
            onClick={() => void handlePayAndGenerate()}
            disabled={loading || isPaying || !hasEnoughBalance || costDhb <= 0}
            className="w-full"
          >
            {isPaying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing
              </>
            ) : hasEnoughBalance ? (
              `Pay ${formatDhb(costDhb)} DHB`
            ) : (
              'Insufficient DHB'
            )}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
