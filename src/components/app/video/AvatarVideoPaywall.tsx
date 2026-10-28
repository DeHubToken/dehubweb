import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { invokeAi } from '@/lib/ai-invoke';
import { payForJob } from '@/lib/ai-payment';
import { avatarRequestKey, readAvatarFile, loadPreparedAvatar, savePreparedAvatar, clearPreparedAvatar, type AvatarQuote, type AvatarSubmission } from '@/lib/creator/avatar';
import { admitAvatarPayment, resumeAvatarPayment, withAvatarAdmission } from '@/lib/creator/avatarPayment';
import type { VideoPaywallModalProps } from './VideoPaywallModal';

export function AvatarVideoPaywall({ open, onOpenChange, onConfirm, avatarPrompt = '.', isGenerating }: VideoPaywallModalProps) {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const [input, setInput] = useState<AvatarSubmission>({ imageDataUrl: '', audioDataUrl: '', rightsConfirmed: false });
  const [quote, setQuote] = useState<AvatarQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const effectivePrompt = input.clientJobId && input.phase !== 'prepared' ? input.prompt ?? avatarPrompt : avatarPrompt;
  const key = avatarRequestKey(walletAddress, effectivePrompt, input);
  const scope = useRef({ key: '', epoch: 0 });
  const identity = JSON.stringify([key, open, avatarPrompt]);
  if (scope.current.key !== identity) scope.current = { key: identity, epoch: scope.current.epoch + 1 };
  const epoch = scope.current.epoch;
  const admissionScope = useRef({ key, open, owner: walletAddress, epoch });
  admissionScope.current = { key, open, owner: walletAddress, epoch };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const pending = !!input.clientJobId && input.phase !== 'prepared';
  useEffect(() => { setQuote(null); }, [key]);
  useEffect(() => {
    setInput({ imageDataUrl: '', audioDataUrl: '', rightsConfirmed: false }); setQuote(null);
    let cancelled = false;
    if (walletAddress && open) void loadPreparedAvatar(walletAddress).then(saved => { if (!cancelled && saved) setInput(previous => previous.imageDataUrl || previous.audioDataUrl ? previous : saved); }).catch(() => {});
    return () => { cancelled = true; };
  }, [walletAddress, open]);
  const current = (captured: typeof admissionScope.current) => mounted.current && captured.epoch === admissionScope.current.epoch && captured.owner === admissionScope.current.owner && captured.key === admissionScope.current.key && admissionScope.current.open;
  const jobState = async (id: string) => {
    const result = await invokeAi('generate-video', { body: { avatarStatus: id } });
    if (result.error || !result.data || (result.data as { error?: string }).error) throw new Error(t('creatorFlow.recoveryPending'));
    return result.data as { txHash?: string; canStartNew: boolean };
  };
  const getQuote = async () => {
    const result = await invokeAi('ai-quote', { body: { kind: 'video', modelId: 'kling-avatar-v2', avatar: input, avatarPrompt: effectivePrompt } });
    if (result.error || !result.data || (result.data as { error?: string }).error) throw new Error((result.data as { error?: string })?.error || t('creator.priceRetry'));
    const data = result.data as AvatarQuote;
    if (!data.inputDigest || !(data.priceDhb > 0) || !Number.isInteger(data.durationSeconds)) throw new Error(t('creator.priceRetry'));
    return data;
  };
  const prepare = async () => {
    const captured = admissionScope.current; setBusy(true);
    try { const next = await getQuote(); if (current(captured)) setQuote(next); }
    catch (error) { if (current(captured)) toast.error(error instanceof Error ? error.message : t('creator.priceRetry')); }
    finally { setBusy(false); }
  };
  const pay = async () => {
    if (!quote || !walletAddress) return;
    const captured = admissionScope.current, reviewed = quote; setBusy(true);
    try {
      await withAvatarAdmission(walletAddress, () => admitAvatarPayment({ input: { ...input, prompt: effectivePrompt }, reviewed, newId: () => crypto.randomUUID(), current: () => current(captured),
        load: () => loadPreparedAvatar(walletAddress), save: async value => { await savePreparedAvatar(walletAddress,value); if (current(captured)) setInput(value); }, quote: getQuote, pay: payForJob,
        receipt: async id => (await jobState(id)).txHash,
        submit: (prepared, txHash) => onConfirm({ avatar: prepared }, txHash) }));
    } catch (error) { const message = error instanceof Error ? error.message : 'creator.priceRetry'; toast.error(message.startsWith('creator') ? t(message) : message); }
    finally { setBusy(false); }
  };
  const resume = async () => {
    if (!walletAddress) return;
    const captured = admissionScope.current; setBusy(true);
    try { await withAvatarAdmission(walletAddress, () => resumeAvatarPayment({
      current: () => current(captured), load: () => loadPreparedAvatar(walletAddress),
      save: async value => { await savePreparedAvatar(walletAddress, value); if (current(captured)) setInput(value); },
      receipt: async id => (await jobState(id)).txHash,
      submit: (prepared, txHash) => onConfirm({ avatar: prepared }, txHash),
    })); } catch (error) { toast.error(error instanceof Error ? t(error.message) : t('creatorFlow.recoveryPending')); }
    finally { setBusy(false); }
  };
  const newRun = async () => {
    if (!walletAddress || !input.clientJobId) return;
    const captured = admissionScope.current; setBusy(true);
    try { await withAvatarAdmission(walletAddress, async () => {
      const state = await jobState(input.clientJobId!);
      if (!current(captured) || !state.canStartNew) throw new Error(t('creatorFlow.recoveryPending'));
      await clearPreparedAvatar(walletAddress,input.clientJobId!);
      if (current(captured)) setInput({ imageDataUrl:'',audioDataUrl:'',rightsConfirmed:false });
    }); } catch (error) { toast.error(error instanceof Error ? t(error.message) : t('creatorFlow.recoveryPending')); } finally { setBusy(false); }
  };
  const pick = async (file: File | undefined, kind: 'image' | 'audio') => {
    if (!file) return;
    const captured = admissionScope.current;
    try { const data = await readAvatarFile(file, kind); if (current(captured)) setInput(previous => ({ ...previous, clientJobId: undefined, txHash: undefined, [kind === 'image' ? 'imageDataUrl' : 'audioDataUrl']: data })); }
    catch { toast.error(t('creator.avatarRequirements')); }
  };
  return <Drawer open={open} onOpenChange={next => { if (!busy) onOpenChange(next); }}>
    <DrawerContent column glass className="max-h-[85dvh] overflow-y-auto p-4">
      <DrawerHeader><DrawerTitle>{t('creator.avatarTitle')}</DrawerTitle></DrawerHeader>
      <p className="mb-4 text-sm text-zinc-400">{t('creator.avatarRequirements')}</p>
      <label className="mb-3 block text-sm">{t('creator.avatarPortrait')}<input className="mt-2 block w-full" type="file" accept="image/png" disabled={busy || pending} onChange={event => void pick(event.target.files?.[0], 'image')} /></label>
      <label className="mb-3 block text-sm">{t('creator.avatarAudio')}<input className="mt-2 block w-full" type="file" accept="audio/wav,audio/x-wav,.wav" disabled={busy || pending} onChange={event => void pick(event.target.files?.[0], 'audio')} /></label>
      <label className="mb-4 flex gap-2 text-sm"><input type="checkbox" checked={input.rightsConfirmed} disabled={busy || pending} onChange={event => setInput(previous => ({ ...previous, rightsConfirmed: event.target.checked }))} />{t('creator.avatarPermission')}</label>
      {quote && <p className="mb-3 text-sm">{t('creator.avatarQuote', { seconds: quote.durationSeconds, amount: quote.priceDhb })}</p>}
      <Button disabled={busy || isGenerating || !input.imageDataUrl || !input.audioDataUrl || !input.rightsConfirmed || !walletAddress} onClick={() => void (pending ? resume() : quote ? pay() : prepare())}>{busy ? t('work.paying') : pending ? t('creatorFlow.resumeRun') : quote ? t('work.payAmount', { amount: `${quote.priceDhb} DHB` }) : t('creator.avatarPrepare')}</Button>
      {pending && <Button variant="outline" disabled={busy} onClick={() => void newRun()}>{t('creatorFlow.newRun')}</Button>}
    </DrawerContent>
  </Drawer>;
}
