import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { invokeAi } from '@/lib/ai-invoke';
import { payForJob } from '@/lib/ai-payment';
import { avatarRequestKey, matchingAvatarQuote, readAvatarFile, loadPreparedAvatar, savePreparedAvatar, type AvatarQuote, type AvatarSubmission } from '@/lib/creator/avatar';
import type { VideoPaywallModalProps } from './VideoPaywallModal';

export function AvatarVideoPaywall({ open, onOpenChange, onConfirm, avatarPrompt = '.', isGenerating }: VideoPaywallModalProps) {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const [input, setInput] = useState<AvatarSubmission>({ imageDataUrl: '', audioDataUrl: '', rightsConfirmed: false });
  const [quote, setQuote] = useState<AvatarQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef({ key: '', open, owner: walletAddress });
  const key = avatarRequestKey(walletAddress, avatarPrompt, input);
  active.current = { key, open, owner: walletAddress };
  useEffect(() => { setQuote(null); }, [key]);
  useEffect(() => {
    setInput({ imageDataUrl: '', audioDataUrl: '', rightsConfirmed: false }); setQuote(null);
    let cancelled = false;
    if (walletAddress && open) void loadPreparedAvatar(walletAddress).then(saved => { if (!cancelled && saved) setInput(previous => previous.imageDataUrl || previous.audioDataUrl ? previous : saved); }).catch(() => {});
    return () => { cancelled = true; };
  }, [walletAddress, open]);
  const current = (captured: typeof active.current) => captured.owner === active.current.owner && captured.key === active.current.key && active.current.open;
  const getQuote = async () => {
    const result = await invokeAi('ai-quote', { body: { kind: 'video', modelId: 'kling-avatar-v2', avatar: input, avatarPrompt } });
    if (result.error || !result.data || (result.data as { error?: string }).error) throw new Error((result.data as { error?: string })?.error || t('creator.priceRetry'));
    const data = result.data as AvatarQuote;
    if (!data.inputDigest || !(data.priceDhb > 0) || !Number.isInteger(data.durationSeconds)) throw new Error(t('creator.priceRetry'));
    return data;
  };
  const prepare = async () => {
    const captured = active.current; setBusy(true);
    try { const next = await getQuote(); if (current(captured)) setQuote(next); }
    catch (error) { if (current(captured)) toast.error(error instanceof Error ? error.message : t('creator.priceRetry')); }
    finally { setBusy(false); }
  };
  const pay = async () => {
    if (!quote || !walletAddress) return;
    const captured = active.current, reviewed = quote; setBusy(true);
    try {
      const fresh = await getQuote();
      if (!current(captured) || !matchingAvatarQuote(reviewed, fresh)) throw new Error(t('creator.priceRetry'));
      const reuse = input.inputDigest === fresh.inputDigest && input.acceptedPriceDhb === fresh.priceDhb; const prepared = { ...input, txHash: reuse ? input.txHash : undefined, clientJobId: (reuse ? input.clientJobId : undefined) ?? crypto.randomUUID(), inputDigest: fresh.inputDigest, acceptedPriceDhb: fresh.priceDhb };
      await savePreparedAvatar(walletAddress, prepared);
      if (!current(captured)) throw new Error(t('creator.priceRetry'));
      const txHash = prepared.txHash ?? await payForJob(fresh.priceDhb);
      await savePreparedAvatar(walletAddress, { ...prepared, txHash });
      // A receipt remains reusable when an account changes while its wallet signs.
      if (!current(captured)) throw new Error(t('creator.priceRetry'));
      onConfirm({ avatar: prepared }, txHash);
    } catch (error) { toast.error(error instanceof Error ? error.message : t('creator.priceRetry')); }
    finally { setBusy(false); }
  };
  const pick = async (file: File | undefined, kind: 'image' | 'audio') => {
    if (!file) return;
    const captured = active.current;
    try { const data = await readAvatarFile(file, kind); if (current(captured)) setInput(previous => ({ ...previous, clientJobId: undefined, txHash: undefined, [kind === 'image' ? 'imageDataUrl' : 'audioDataUrl']: data })); }
    catch { toast.error(t('creator.avatarRequirements')); }
  };
  return <Drawer open={open} onOpenChange={next => { if (!busy) onOpenChange(next); }}>
    <DrawerContent column glass className="max-h-[85dvh] overflow-y-auto p-4">
      <DrawerHeader><DrawerTitle>{t('creator.avatarTitle')}</DrawerTitle></DrawerHeader>
      <p className="mb-4 text-sm text-zinc-400">{t('creator.avatarRequirements')}</p>
      <label className="mb-3 block text-sm">{t('creator.avatarPortrait')}<input className="mt-2 block w-full" type="file" accept="image/png" disabled={busy} onChange={event => void pick(event.target.files?.[0], 'image')} /></label>
      <label className="mb-3 block text-sm">{t('creator.avatarAudio')}<input className="mt-2 block w-full" type="file" accept="audio/wav,audio/x-wav,.wav" disabled={busy} onChange={event => void pick(event.target.files?.[0], 'audio')} /></label>
      <label className="mb-4 flex gap-2 text-sm"><input type="checkbox" checked={input.rightsConfirmed} disabled={busy} onChange={event => setInput(previous => ({ ...previous, rightsConfirmed: event.target.checked }))} />{t('creator.avatarPermission')}</label>
      {quote && <p className="mb-3 text-sm">{t('creator.avatarQuote', { seconds: quote.durationSeconds, amount: quote.priceDhb })}</p>}
      <Button disabled={busy || isGenerating || !input.imageDataUrl || !input.audioDataUrl || !input.rightsConfirmed || !walletAddress} onClick={() => void (quote ? pay() : prepare())}>{busy ? t('paywall.paying') : quote ? t('paywall.payAmount', { amount: quote.priceDhb, action: t('paywall.generate') }) : t('creator.avatarPrepare')}</Button>
    </DrawerContent>
  </Drawer>;
}
