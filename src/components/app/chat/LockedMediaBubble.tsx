/**
 * A pay-to-unlock photo or video in a DM.
 *
 * The other person sees the server's blurred preview with the price and an
 * Unlock button. Paying is an ordinary chat tip to the sender; the server
 * checks it and hands back a signed URL to the real file. The sender sees
 * their own photo with its price and whether it has been unlocked yet.
 *
 * The real file only ever comes from GET /dm/locked/:id, never from the
 * message itself, so nothing here can show it to someone who has not paid.
 */
import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Lock, LockOpen, Check, Play } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AuthContext } from '@/contexts/AuthContext';
import {
  getLockedMedia,
  getMediaUrl,
  unlockLockedMedia,
  type DmLockStatus,
  type DmMessage,
} from '@/lib/api/dehub';
import { onDmMediaUnlocked } from '@/lib/api/dehub/dm-socket';
import { getERC20Balance } from '@/lib/contracts/aa-utils';
import { getChainConfig, BASE_CHAIN_ID, BNB_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { sendTip } from '@/lib/contracts/stream-controller';
import { toastTxError } from '@/lib/tx-error-toast';
import type { ChainId } from '@/components/app/ChainSelector';

export const lockedMediaKey = (messageId: string) => ['dm-locked', messageId] as const;

const formatPrice = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

/** Base first, BNB if Base can't cover it, null if neither can. */
async function pickChain(address: string, price: number): Promise<ChainId | null> {
  const [base, bnb] = await Promise.all([
    getERC20Balance(getChainConfig(BASE_CHAIN_ID).dhbToken, address, BASE_CHAIN_ID).catch(() => null),
    getERC20Balance(getChainConfig(BNB_CHAIN_ID).dhbToken, address, BNB_CHAIN_ID).catch(() => null),
  ]);
  const has = (v: unknown) => v !== null && v !== undefined && Number(v) / 1e18 >= price;
  if (has(base)) return BASE_CHAIN_ID as ChainId;
  if (has(bnb)) return BNB_CHAIN_ID as ChainId;
  return null;
}

interface LockedMediaBubbleProps {
  message: DmMessage;
  onOpenImage?: (url: string) => void;
}

export function LockedMediaBubble({ message, onOpenImage }: LockedMediaBubbleProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const auth = useContext(AuthContext);
  const lock = message.lock!;
  const mine = message.author === 'me';
  const isTemp = message._id.startsWith('temp-');
  const [paying, setPaying] = useState(false);

  const { data: status } = useQuery<DmLockStatus>({
    queryKey: lockedMediaKey(message._id),
    queryFn: () => getLockedMedia(message._id),
    enabled: !isTemp && lock.ready !== false,
    staleTime: 30 * 60_000,
    // While a payment is confirming, look again every few seconds.
    refetchInterval: q => (q.state.data?.pendingTxHash ? 4000 : false),
  });

  const signedIn = !!auth?.walletAddress;
  useEffect(() => (!signedIn ? undefined : onDmMediaUnlocked(data => {
    if (data.messageId !== message._id) return;
    void queryClient.invalidateQueries({ queryKey: lockedMediaKey(message._id) });
    if (mine) toast.success(t('dmPaidLock.lockedUnlockedByThem', { defaultValue: 'Your locked {{kind}} was unlocked: +{{amount}} DHB', kind: lock.kind === 'video' ? 'video' : 'photo', amount: formatPrice(data.amount) }));
  })), [signedIn, message._id, mine, lock.kind, queryClient, t]);

  const view = status?.lock ?? lock;
  const realUrl = view.mediaUrl || (mine ? lock.mediaUrl : undefined);
  const pending = !!status?.pendingTxHash || paying;
  const previewUrl = getMediaUrl(view.previewUrl || message.mediaUrls?.[0]?.url || '') || undefined;
  const kindWord = lock.kind === 'video' ? t('dmPaidLock.lockedVideo', 'video') : t('dmPaidLock.lockedPhoto', 'photo');

  const handleUnlock = async () => {
    if (paying || !status?.payTo) return;
    const me = auth?.walletAddress;
    if (!me) {
      toast.error(t('dmPaidLock.lockedSignIn', 'Sign in to unlock this.'));
      return;
    }
    setPaying(true);
    const toastId = `dm-unlock-${message._id}`;
    try {
      toast.loading(t('dmPaidLock.lockedPaying', { defaultValue: 'Paying {{price}} DHB…', price: formatPrice(lock.price) }), { id: toastId });
      const chainId = await pickChain(me, lock.price);
      if (!chainId) {
        toast.error(t('dmPaidLock.lockedNotEnough', { defaultValue: 'You need {{price}} DHB on Base or BNB to unlock this.', price: formatPrice(lock.price) }), { id: toastId });
        return;
      }
      const tip = await sendTip({ tokenId: 0, amount: lock.price, to: status.payTo, chainId, skipBalanceCheck: true });
      let res = await unlockLockedMedia(message._id, tip.hash);
      if (res.status === 'pending') {
        toast.loading(t('dmPaidLock.lockedConfirming', 'Confirming payment…'), { id: toastId });
        await tip.confirmed?.catch(() => null);
        res = await unlockLockedMedia(message._id, tip.hash).catch(() => res);
      }
      queryClient.setQueryData(lockedMediaKey(message._id), res);
      if (res.status === 'unlocked') toast.success(t('dmPaidLock.lockedUnlocked', 'Unlocked'), { id: toastId, duration: 2000 });
      else toast.message(t('dmPaidLock.lockedStillConfirming', 'Payment sent. It opens as soon as it confirms.'), { id: toastId });
    } catch (err) {
      toastTxError(err, t('dmPaidLock.lockedPayFailed', 'Could not unlock'), { id: toastId });
    } finally {
      setPaying(false);
    }
  };

  const priceLabel = `${formatPrice(lock.price)} ${lock.symbol || 'DHB'}`;

  // ── Sender, or someone who has paid: the real thing ──
  if (realUrl) {
    const src = getMediaUrl(realUrl) || realUrl;
    return (
      <div data-dm-locked="open" className="relative inline-block max-w-full">
        {lock.kind === 'video' ? (
          <video src={src} controls playsInline preload="metadata" className="max-w-full max-h-64 rounded-lg bg-black" />
        ) : (
          <img
            src={src}
            alt={t('dmPaidLock.lockedAlt', 'Locked photo')}
            className="max-w-full max-h-64 rounded-lg object-cover cursor-zoom-in"
            onClick={() => onOpenImage?.(src)}
          />
        )}
        <span data-on-media className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          {mine ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
          {priceLabel}
          {mine && (view.unlockCount ?? 0) > 0 && (
            <>
              <span className="opacity-60">·</span>
              <Check className="h-3 w-3" />
              {t('dmPaidLock.lockedUnlockedTag', 'Unlocked')}
            </>
          )}
        </span>
        {mine && !(view.unlockCount ?? 0) && (
          <p className="mt-1 text-[11px] opacity-60">{t('dmPaidLock.lockedNotYet', 'Not unlocked yet')}</p>
        )}
      </div>
    );
  }

  // ── Sender's own upload still processing ──
  if (mine) {
    return (
      <div className="flex items-center gap-2 min-w-[160px] py-4 px-3 rounded-lg bg-black/20">
        <Loader2 className="w-5 h-5 animate-spin opacity-60 flex-shrink-0" />
        <span className="text-sm opacity-70">{t('dmPaidLock.lockedUploading', { defaultValue: 'Locking your {{kind}}…', kind: kindWord })}</span>
      </div>
    );
  }

  // ── Recipient, not paid yet: blur + price + Unlock ──
  return (
    <div data-dm-locked="closed" data-keep-dark data-on-media className="relative text-white w-[240px] max-w-full overflow-hidden rounded-lg bg-zinc-900" style={{ aspectRatio: '4 / 5' }}>
      {previewUrl && <img src={previewUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover" />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/60" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 backdrop-blur-md">
          {lock.kind === 'video' ? <Play className="h-5 w-5 fill-current" /> : <Lock className="h-5 w-5" />}
        </span>
        <span className="text-xs font-medium opacity-80">
          {t('dmPaidLock.lockedTitle', { defaultValue: 'Locked {{kind}}', kind: kindWord })}
        </span>
        <button
          type="button"
          data-keep-white
          onClick={handleUnlock}
          disabled={pending || !status}
          className={cn(
            'mt-1 inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-black/55 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur-md transition-transform hover:bg-black/70 active:scale-95',
            (pending || !status) && 'opacity-80',
          )}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
          {pending
            ? t('dmPaidLock.lockedConfirming', 'Confirming payment…')
            : t('dmPaidLock.lockedUnlockFor', { defaultValue: 'Unlock for {{price}}', price: priceLabel })}
        </button>
      </div>
    </div>
  );
}

export default LockedMediaBubble;
