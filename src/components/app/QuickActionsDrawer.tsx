import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bug, Loader2 } from "lucide-react";
import RefreshCw from "@/components/ui/cut-icons/refresh";
import Users from "@/components/ui/cut-icons/communities";
import LogOut from "@/components/ui/cut-icons/sign-out";

import X from "@/components/ui/cut-icons/close";

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { useAuth } from '@/contexts/AuthContext';
import { useSubmitFeatureRequest } from '@/hooks/use-feature-requests';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { ProfilesSection } from './settings/ProfilesSection';
import { captureBugScreenshot, describePageBug, enrichPageBugContext, type PageBugContext } from '@/lib/page-bug-report';

export default function QuickActionsDrawer({ context, initialReport, onClose }: { context: PageBugContext; initialReport: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { isAuthenticated, openLoginModal, disconnect, walletAddress } = useAuth();
  const [view, setView] = useState<'menu' | 'report' | 'profiles'>(initialReport ? 'report' : 'menu');
  const [message, setMessage] = useSurfaceDraft('quick-page-bug', '', context.page);
  const [details, setDetails] = useState(context);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const submit = useSubmitFeatureRequest();
  const submitted = useRef(false);
  const owner = useRef(walletAddress);
  useEffect(() => { if (walletAddress !== owner.current) onClose(); }, [walletAddress, onClose]);
  useEffect(() => {
    if (view !== 'report') return;
    let live = true;
    setCapturing(true);
    const deadline = setTimeout(() => { if (live) { live = false; setCapturing(false); } }, 5000);
    void enrichPageBugContext(context).then(value => { if (live) setDetails(value); });
    void captureBugScreenshot().then(file => { if (live) { setScreenshot(file); setCapturing(false); } });
    return () => { live = false; clearTimeout(deadline); };
  }, [view, context]);
  useEffect(() => {
    if (!screenshot) { setPreview(null); return; }
    const url = URL.createObjectURL(screenshot);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [screenshot]);
  const close = () => { if (!busy && !submit.isPending) onClose(); };
  const send = async () => {
    if (!message.trim() || submitted.current || capturing) return;
    if (!isAuthenticated) { onClose(); openLoginModal(); return; }
    submitted.current = true;
    setError(false);
    try {
      await submit.mutateAsync({ title: message.trim().replace(/\s+/g, ' ').slice(0, 120), description: describePageBug(message, details), category: 'bug_fix', mediaFiles: screenshot ? [screenshot] : [] });
      if (setMessage.complete(message, '')) onClose();
    } catch { setError(true); } finally { submitted.current = false; }
  };
  const row = 'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm hover:bg-white/10 disabled:opacity-50';
  return <Drawer open onOpenChange={open => { if (!open) close(); }} dismissible={!busy && !submit.isPending}>
    <DrawerContent data-quick-actions-ui column className="px-4 pb-6 text-white">
      <DrawerHeader className="px-0 pr-10 text-left">
        <DrawerTitle>{view === 'report' ? t('quickActions.question') : view === 'profiles' ? t('sidebar.switchAccount') : t('quickActions.title')}</DrawerTitle>
        <DrawerDescription>{view === 'report' ? t('quickActions.publicNotice') : t('quickActions.hint')}</DrawerDescription>
      </DrawerHeader>
      <button aria-label={t('common.close')} className="absolute right-4 top-4 p-2" disabled={busy || submit.isPending} onClick={close}><X className="h-5 w-5" /></button>
      {view === 'menu' && <div>
        <button className={row} onClick={() => setView('report')}><Bug size={20} />{t('settings.reportBug')}</button>
        <button className={row} onClick={() => window.location.reload()}><RefreshCw size={20} />{t('quickActions.refresh')}</button>
        <button className={row} onClick={() => setView('profiles')}><Users size={20} />{t('sidebar.switchAccount')}</button>
        <button className={row} disabled={!isAuthenticated || busy} onClick={async () => { setBusy(true); try { await disconnect(); onClose(); } catch { setError(true); setBusy(false); } }}><LogOut size={20} />{t('quickActions.logout')}</button>
      </div>}
      {view === 'profiles' && <div className="max-h-[65dvh] overflow-y-auto"><ProfilesSection onSelect={onClose} /></div>}
      {view === 'report' && <div className="space-y-3 overflow-y-auto">
        <textarea aria-label={t('quickActions.question')} placeholder={t('quickActions.placeholder')} value={message} onChange={e => setMessage(e.target.value)} maxLength={1500} rows={4} className="w-full resize-none rounded-xl border border-white/10 bg-white/5 p-3 text-sm placeholder:text-muted-foreground" />
        <p className="break-all text-xs text-muted-foreground">{context.page}</p>
        <p className="text-xs text-muted-foreground">{t('quickActions.deviceNotice')}</p>
        {capturing && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />{t('quickActions.capturing')}</p>}
        {preview && <div className="relative"><img src={preview} alt={t('quickActions.screenshot')} className="max-h-40 rounded-lg border border-border object-contain" /><button className="absolute right-2 top-2 rounded-full bg-black/60 p-2" aria-label={t('quickActions.removeScreenshot')} onClick={() => setScreenshot(null)}><X size={16} /></button></div>}
        {!capturing && !preview && <p className="text-xs text-muted-foreground">{t('quickActions.noScreenshot')}</p>}
        <label className="block text-sm">{t('quickActions.attachScreenshot')}<input type="file" accept="image/*" className="mt-1 block w-full text-xs" onChange={event => { const file = event.target.files?.[0]; if (file && file.type.startsWith('image/') && file.size <= 20 * 1024 * 1024) { setScreenshot(file); setError(false); } else if (file) setError(true); event.target.value = ''; }} /></label>
        <button onClick={send} disabled={!message.trim() || capturing || submit.isPending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black ring-1 ring-black/10 disabled:opacity-40">{submit.isPending && <Loader2 size={16} className="animate-spin" />}{t(isAuthenticated ? 'quickActions.send' : 'quickActions.signIn')}</button>
      </div>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{t('quickActions.failed')}</p>}
    </DrawerContent>
  </Drawer>;
}
