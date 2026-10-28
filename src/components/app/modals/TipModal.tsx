import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { tokenLabel } from '@/lib/token-label';
/**
 * Tip Modal Component
 * ===================
 * Drawer for tipping creators on posts or profiles.
 *
 * **It does not ask which network.** The first thing on screen when somebody
 * sends money should not be a question about infrastructure, and it was one
 * only their wallet could answer anyway. The tip leaves from whichever of Base
 * or BNB actually holds the amount, Base first, decided at send time. Anyone
 * who wants to pin a chain sets it once in Settings → Assets.
 *
 * Ethereum was on the old picker and is deliberately not in the automatic set:
 * DHB exists there, but the built-in wallet only signs as its **Safe** on Base
 * and BNB, so an Ethereum tip would arrive from the owner EOA — a different
 * backend account — and go uncredited.
 *
 * The balance shown is the larger of the two chains, because that is what the
 * "All" button can actually send.
 */

import { emitPostTipped, commentTipKey } from '@/lib/tip-events';
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { DhbCoin } from '@/components/app/DhbAmount';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import Gem from "@/components/ui/cut-icons/diamond";

import { ButtonLoader } from '@/components/app/DeHubLoader';
import dehubCoin from '@/assets/dehub-coin.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { getChainById, type ChainId } from '@/components/app/ChainSelector';
import { useTipPayment, MIN_TIP_DHB, MAX_TIP_DHB, MIN_DIRECT_TIP, DIRECT_QUICK_AMOUNTS } from '@/hooks/use-tip-payment';
import { useTipNetwork } from '@/hooks/use-tip-network';
import { useAuth } from '@/contexts/AuthContext';
// NOTE: stream-controller and pay-chain reach wallet/contract code (wagmi +
// web3auth) and this modal is statically imported by eager feed cards — both
// are dynamically imported when the modal opens to keep the wallet stack out
// of the entry bundle (scripts/check-entry-bundle.mjs fails the build
// otherwise).
import { BASE_CHAIN_ID, BNB_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { getAccountInfo, registerTipMessage, bindTipMessage, cancelTipMessage, TIP_MESSAGE_MAX_LENGTH } from '@/lib/api/dehub';
import { emitTipMessageSent } from '@/lib/tip-events';
import { Globe, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { fundTipFromSource } from '@/lib/tip-funding-run';
import type { TipFundingSource } from '@/lib/tip-funding';
import usdcLogo from '@/assets/usdc-logo.png';
import usdtLogo from '@/assets/usdt-logo.png';

// Reads wallet balances (wallet stack), so it loads with the open drawer.
const TipPayWith = lazy(() => import('@/components/app/tips/TipPayWith'));
const CreatorSupportAd = lazy(() => import('@/components/app/tips/CreatorSupportAd'));

const QUICK_AMOUNTS = [500, 1000, 5000, 10000, 25000, 50000, 100000, 1000000];

/** Chains a tip may be sent from automatically, in order. Base first, always. */
const AUTO_TIP_CHAINS: ChainId[] = [BASE_CHAIN_ID as ChainId, BNB_CHAIN_ID as ChainId];

interface TipModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creatorAddress?: string;
  creatorName?: string;
  tokenId?: string;
  context?: string;
  /** Tipping a comment's author: recorded on the tip so the comment shows its
   *  own total, and kept out of the post's tip count. */
  commentId?: string;
}

export function TipModal({
  open,
  onOpenChange,
  creatorAddress,
  creatorName,
  tokenId,
  context,
  commentId,
}: TipModalProps) {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();
  const [amount, setAmount] = useSurfaceDraft("components/app/modals/TipModal.tsx:amount", '', JSON.stringify([creatorAddress, tokenId, commentId]));
  // The message that goes with a post tip. Kept as a draft like a reply, so
  // closing the sheet doesn't lose it.
  const [message, setMessage] = useSurfaceDraft("components/app/modals/TipModal.tsx:message", '', JSON.stringify([creatorAddress, tokenId]));
  const [messagePrivate, setMessagePrivate] = useState(false);
  /** The server's id for the message registered with the tip in flight. */
  const tipMessageId = useRef<string | null>(null);
  const tipLanded = useRef(false);
  const [balances, setBalances] = useState<Record<number, number> | null>(null);
  const lastTipAmount = useRef(0);
  const [recipientPrivate, setRecipientPrivate] = useState(false);
  const [privacyChecking, setPrivacyChecking] = useState(false);
  const resolvedTokenId = tokenId || context;
  // A message goes with a tip on a post, not on a comment or a chat.
  const canMessage = !commentId && /^[1-9]\d*$/.test(String(resolvedTokenId ?? ''));
  const trimmedMessage = message.trim();
  const messageTooLong = message.length > TIP_MESSAGE_MAX_LENGTH;
  const { pinnedChainId } = useTipNetwork();
  // Set when the tip is paid from another token: it is turned into DHB on
  // Base first, so the tip itself always leaves from Base.
  const [payWith, setPayWith] = useState<TipFundingSource | null>(null);
  const [funding, setFunding] = useState(false);
  // Each open starts in DHB, so a saved DHB draft is never read as USDC.
  useEffect(() => { if (open) setPayWith(null); }, [open]);
  const sendInFlight = useRef(false);
  const [preparing, setPreparing] = useState(false);

  // USDC/USDT: paid as is to the creator; the typed amount is in that token.
  const directToken = payWith?.direct ?? null;
  const directLogo = directToken?.symbol === 'USDT' ? usdtLogo : usdcLogo;
  const directBalance = directToken && payWith ? Number(payWith.balance) / 10 ** payWith.decimals : null;
  const changePayWith = (source: TipFundingSource | null) => {
    // 5,000 DHB is not 5,000 USDC: a new unit clears the amount.
    if (source?.direct || directToken) setAmount('');
    setPayWith(source);
  };

  const parsedAmount = parseAbbreviatedAmount(amount);
  const isValidAmount = !Number.isNaN(parsedAmount) && parsedAmount >= (directToken ? MIN_DIRECT_TIP : MIN_TIP_DHB)
    && (directBalance == null || parsedAmount <= directBalance);

  // Base first, then BNB, then Base again as the place to fail — it is the one
  // chain the tipper can actually top up in-app. A pinned setting wins outright:
  // somebody who went to Settings to say "always BNB" meant it.
  const autoChainId = AUTO_TIP_CHAINS.find(id => (balances?.[id] ?? 0) >= parsedAmount);
  const tipChainId = payWith ? (BASE_CHAIN_ID as ChainId) : pinnedChainId ?? autoChainId ?? (BASE_CHAIN_ID as ChainId);

  const { tip, isTipping } = useTipPayment({
    creatorAddress,
    chainId: tipChainId,
    tokenId: resolvedTokenId,
    commentId,
    onSuccess: () => {
      // Comment tips pay the comment's author, not the post — the post's
      // counter must not move for them.
      if (!commentId && resolvedTokenId && lastTipAmount.current > 0) {
        queryClient.cancelQueries({ queryKey: ['post-tip-count', resolvedTokenId] });
        queryClient.setQueryData(['post-tip-count', resolvedTokenId], (old: number | undefined) => (old || 0) + lastTipAmount.current);
        queryClient.invalidateQueries({ queryKey: ['post-tip-count', resolvedTokenId], refetchType: 'none' });
      }
      if (commentId) emitPostTipped(commentTipKey(commentId));
      else if (resolvedTokenId) emitPostTipped(resolvedTokenId);
      setAmount.complete(amount, '');
      tipLanded.current = true;
      if (tipMessageId.current) setMessage.complete(message, '');
      onOpenChange(false);
    },
    onConfirmed: (txHash) => {
      const messageId = tipMessageId.current;
      tipMessageId.current = null;
      if (messageId && resolvedTokenId) {
        // The webhook usually posts it first; this binds the hash in case it
        // was slower, then the comments list fetches the wall and lands it.
        (txHash ? bindTipMessage(messageId, txHash) : Promise.resolve(null))
          .catch(() => null)
          .finally(() => emitTipMessageSent(String(resolvedTokenId)));
      }
      if (commentId && resolvedTokenId) {
        queryClient.invalidateQueries({ queryKey: ['comment-tips', resolvedTokenId] });
      } else if (resolvedTokenId) {
        queryClient.invalidateQueries({ queryKey: ['post-tip-count', resolvedTokenId] });
      }
    },
  });

  // Read once per open, both chains at a time. Keying this on the amount would
  // put an RPC round trip behind every keystroke; the pick above is pure and
  // re-derives from what is already here.
  useEffect(() => {
    if (!open || !walletAddress) return;
    let cancelled = false;
    import('@/lib/contracts/stream-controller')
      .then(m =>
        Promise.all(
          AUTO_TIP_CHAINS.map(id =>
            m.getDHBBalance(walletAddress, id).catch(() => BigInt(0)),
          ),
        ),
      )
      .then(raw => {
        if (cancelled) return;
        const next: Record<number, number> = {};
        AUTO_TIP_CHAINS.forEach((id, i) => {
          next[id] = Math.floor((Number(raw[i]) / 1e18) * 100) / 100;
        });
        setBalances(next);
      })
      .catch(() => { if (!cancelled) setBalances(null); });
    return () => { cancelled = true; };
  }, [open, walletAddress]);

  useEffect(() => {
    if (!open || !creatorAddress) return;
    let cancelled = false;
    setPrivacyChecking(true);
    getAccountInfo(creatorAddress)
      .then((profile) => { if (!cancelled) setRecipientPrivate(profile?.hideBadgeAndBalance === true); })
      .catch(() => { if (!cancelled) setRecipientPrivate(false); })
      .finally(() => { if (!cancelled) setPrivacyChecking(false); });
    return () => { cancelled = true; };
  }, [open, creatorAddress]);

  function parseAbbreviatedAmount(val: string): number {
    const trimmed = val.trim().toLowerCase();
    const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(k|m)?$/);
    if (!match) return NaN;
    const num = parseFloat(match[1]);
    const suffix = match[2];
    if (suffix === 'k') return num * 1000;
    if (suffix === 'm') return num * 1000000;
    return num;
  }

  const chainName = getChainById(tipChainId)?.name ?? _copy("copy.9414886b1ebf", { defaultValue: "chain" });
  // What "All" can actually send: the bigger of the two, since either is
  // reachable without the tipper doing anything.
  const dhbBalance = balances
    ? Math.max(...AUTO_TIP_CHAINS.map(id => balances[id] ?? 0))
    : null;

  const handleSendTip = async () => {
    if (!isValidAmount || sendInFlight.current) return;
    if (!creatorAddress) return;
    sendInFlight.current = true;
    setPreparing(true);
    try {
      try {
        const profile = await getAccountInfo(creatorAddress);
        if (profile?.hideBadgeAndBalance) {
          setRecipientPrivate(true);
          toast.error(_copy("copy.412ae55409b3", { defaultValue: "This account has disabled tips while private balance mode is on." }));
          return;
        }
      } catch {
        toast.error(_copy("copy.babd987b2954", { defaultValue: "Could not verify the recipient privacy setting. No tip was sent." }));
        return;
      }
      // Write the message first: the server refuses here (comments off,
      // reply limits) before any money moves, and it is waiting when the
      // tip's confirmation arrives so the creator's notification carries it.
      tipMessageId.current = null;
      tipLanded.current = false;
      if (canMessage && trimmedMessage && !recipientPrivate) {
        if (messageTooLong) return;
        const registered = await registerTipMessage({
          tokenId: resolvedTokenId!,
          amount: parsedAmount,
          content: trimmedMessage,
          isPrivate: messagePrivate,
        }).catch(() => null);
        if (!registered?.result || !registered.messageId) {
          toast.error(registered?.error || t('tip.messageFailed', 'Your message could not be added. No tip was sent.'));
          return;
        }
        tipMessageId.current = registered.messageId;
      }
      if (directToken) {
        lastTipAmount.current = 0;
        await tip(parsedAmount, directToken);
        return;
      }
      if (payWith) {
        if (!walletAddress) return;
        setFunding(true);
        const ready = await fundTipFromSource(payWith, parsedAmount, walletAddress, t).finally(() => setFunding(false));
        if (!ready) return;
      }
      lastTipAmount.current = parsedAmount;
      await tip(parsedAmount);
    } finally {
      // A tip that never went out must not leave its message waiting for the
      // next tip of the same amount.
      if (tipMessageId.current && !tipLanded.current) {
        void cancelTipMessage(tipMessageId.current).catch(() => {});
        tipMessageId.current = null;
      }
      sendInFlight.current = false;
      setPreparing(false);
    }
  };

  const handleQuickAmount = (val: number) => setAmount(String(val));

  const handleAll = () => {
    if (directBalance != null) {
      if (directBalance >= MIN_DIRECT_TIP) setAmount(String(Math.floor(directBalance * 100) / 100));
      return;
    }
    if (dhbBalance != null && dhbBalance >= MIN_TIP_DHB) {
      setAmount(String(Math.floor(dhbBalance)));
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        column
        glass
        /* `scrollable`, never `overflow-y-auto` on the content itself: vaul
           ships `[data-vaul-drawer]{touch-action:none}` on exactly this
           element, so a scroller put here is untouchable on a phone — the
           sheet clipped at 85dvh with the amount field and Send button below
           the cut and no way to reach them. A mouse wheel ignores
           touch-action, which is why it only ever broke on mobile. */
        scrollable
        className="max-h-[85dvh] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <DrawerHeader className="pb-3">
          <DrawerTitle className="text-white text-lg flex items-center justify-center gap-2">
            <Gem className="w-5 h-5 text-white" />
            {t('tip.title', 'Send Tip')}
          </DrawerTitle>
          {creatorName && (
            <p className="text-white/60 text-sm mt-1 text-center">
              {t('tip.toCreator', 'Tip {{name}}', { name: creatorName })}
            </p>
          )}
        </DrawerHeader>
        <div className="flex flex-col gap-4">
          {open && walletAddress && resolvedTokenId && !commentId && !isTipping && !funding && !recipientPrivate && !privacyChecking && creatorAddress?.toLowerCase() !== walletAddress.toLowerCase() ? (
            <Suspense fallback={null}><CreatorSupportAd key={resolvedTokenId} postId={resolvedTokenId} walletAddress={walletAddress} /></Suspense>
          ) : null}
          {recipientPrivate ? (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
              {t(
                'tip.privateBalanceNotice',
                'This account has private balance mode on, so DeHub cannot send tokens or tips to it.',
              )}
            </div>
          ) : null}
          <div>
            <p className="text-white/60 text-xs mb-2">{t('tip.quickAmounts', 'Quick amounts')}</p>
            <div className="flex flex-wrap gap-2">
              {(directToken ? DIRECT_QUICK_AMOUNTS : QUICK_AMOUNTS).map((val) => (
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
                  <span className="inline-flex items-center gap-1">
                    {val.toLocaleString()}{' '}
                    <img src={directToken ? directLogo : dehubCoin} alt={directToken?.symbol ?? tokenLabel()} className="w-4 h-4" style={{ marginTop: '-1px' }} />
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-white/60 text-xs">{t('tip.customAmount', 'Or enter amount')}</p>
              {directToken && directBalance != null ? (
                <p className="text-white/30 text-xs">
                  {directBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} {directToken.symbol}
                </p>
              ) : dhbBalance != null && (
                <p className="text-white/30 text-xs">
                  {dhbBalance.toLocaleString()} <DhbCoin />{_copy("copy.73cd2a424191", { defaultValue: " · via {{value1}}", value1: chainName })}
                </p>
              )}
            </div>
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <img src={directToken ? directLogo : dehubCoin} alt={directToken?.symbol ?? tokenLabel()} className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" />
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder={directToken ? _copy("copy.e6d53f2e5db0", { defaultValue: "e.g. 5" }) : _copy("copy.ecc6cfdd0163", { defaultValue: "e.g. 500, 1.5k, 2m" })}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-11 bg-white/5 border-white/10 text-white placeholder:text-white/40 h-12 rounded-xl"
                />
              </div>
              <button
                type="button"
                onClick={handleAll}
                disabled={directToken ? (directBalance ?? 0) < MIN_DIRECT_TIP : dhbBalance == null || dhbBalance < MIN_TIP_DHB}
                className="h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >{_copy("copy.a52ace420f21", { defaultValue: "All" })}</button>
            </div>
          </div>

          {canMessage && !recipientPrivate ? (
            <div data-tip-message>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="tip-message" className="text-white/60 text-xs">{t('tip.addMessage', 'Add a message (optional)')}</label>
                {message.length >= TIP_MESSAGE_MAX_LENGTH - 40 ? (
                  <span className={`text-xs tabular-nums ${messageTooLong ? 'text-red-400' : 'text-white/40'}`}>
                    {message.length} / {TIP_MESSAGE_MAX_LENGTH}
                  </span>
                ) : null}
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 focus-within:border-white/25 transition-colors">
                <textarea
                  id="tip-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  maxLength={TIP_MESSAGE_MAX_LENGTH + 20}
                  enterKeyHint="send"
                  placeholder={t('tip.messagePlaceholder', 'Say something with your tip')}
                  className="block w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[15px] text-white placeholder:text-white/40 outline-none"
                />
                <div className="flex items-center justify-end px-2 pb-2">
                  <button
                    type="button"
                    onClick={() => setMessagePrivate(v => !v)}
                    aria-pressed={messagePrivate}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/80 hover:bg-white/15 transition-colors"
                  >
                    {messagePrivate ? <Lock className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                    {messagePrivate
                      ? t('tip.messagePrivate', 'Only {{name}}', { name: creatorName || t('tip.theCreator', 'the creator') })
                      : t('tip.messagePublic', 'Public')}
                  </button>
                </div>
              </div>
              {trimmedMessage && !messagePrivate ? (
                <p className="text-white/40 text-[11px] mt-1.5">{t('tip.messageWallNote', 'Shows on the tip wall once the tip goes through.')}</p>
              ) : null}
            </div>
          ) : null}

          {open && walletAddress && !recipientPrivate ? (
            <Suspense fallback={null}>
              <TipPayWith amountDhb={isValidAmount && !directToken ? parsedAmount : 0} value={payWith} onChange={changePayWith} direct recipientName={creatorName} />
            </Suspense>
          ) : null}

          <div className="flex gap-3 mt-2">
            <Button
              variant="glass"
              className="flex-1"
              onClick={isTipping || funding || preparing ? undefined : () => onOpenChange(false)}
              disabled={isTipping || funding || preparing}
            >
              {t('common.close', 'Close')}
            </Button>
            <Button
              variant="glass"
              className="flex-1"
              onClick={handleSendTip}
              disabled={isTipping || funding || preparing || privacyChecking || recipientPrivate || !isValidAmount || (canMessage && messageTooLong)}
            >
              {isTipping || funding || preparing ? (
                <>
                  <ButtonLoader className="mr-2" />
                  {t('tip.sending', 'Sending...')}
                </>
              ) : (
                canMessage && trimmedMessage ? t('tip.sendWithMessage', 'Send with message') : t('tip.send', 'Send')
              )}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
