import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Send from '@/components/ui/cut-icons/send';
import User from '@/components/ui/cut-icons/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { DhbCoin } from '@/components/app/DhbAmount';
import { APP_TOKENS_QUERY_KEY, useAppTokens } from '@/hooks/use-app-tokens';
import {
  findAppTokenRecipient, newAppTokenKey, sendAppTokens,
  type AppTokenEntry, type AppTokenPerson,
} from '@/lib/api/dehub/app-tokens';
import dehubCoin from '@/assets/dehub-coin.png';

/**
 * App tokens in the wallet: DHB held on DeHub, not on a chain. The row opens
 * the balance and its history; Send moves app tokens to another account and
 * never touches a chain.
 */

const fmt = (amount: string | number) =>
  Number(amount).toLocaleString(undefined, { maximumFractionDigits: 6 });

function personName(p?: AppTokenPerson) {
  if (!p) return '';
  return p.username ? `@${p.username}` : `${p.address.slice(0, 6)}…${p.address.slice(-4)}`;
}

function EntryRow({ entry }: { entry: AppTokenEntry }) {
  const { t } = useTranslation();
  const who = personName(entry.counterparty);
  const label = {
    opening: t('appTokens.kindOpening'),
    send: t('appTokens.kindSent', { name: who }),
    receive: t('appTokens.kindReceived', { name: who }),
    spend: t('appTokens.kindSpent'),
    refund: t('appTokens.kindRefund'),
    deposit: t('appTokens.kindDeposit'),
    adjust: t('appTokens.kindAdjust'),
  }[entry.kind];
  const positive = !entry.amount.startsWith('-');
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-white truncate">{label}</p>
        <p className="text-xs text-zinc-500 truncate">
          {new Date(entry.at).toLocaleString()}{entry.note ? ` · ${entry.note}` : ''}
        </p>
      </div>
      <span className={`shrink-0 text-sm font-medium ${positive ? 'text-emerald-400' : 'text-white'}`}>
        {positive ? '+' : '−'}{fmt(entry.amount.replace('-', ''))} <DhbCoin />
      </span>
    </div>
  );
}

/** The DHB row at the top of the wallet list, plus its drawer. */
export function AppTokensRow({ onSend }: { onSend: () => void }) {
  const { t } = useTranslation();
  const { data, isLoading } = useAppTokens();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-900/60 transition-colors text-left"
      >
        <img src={dehubCoin} alt="" className="w-9 h-9 rounded-full shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">DHB</p>
          <p className="text-xs text-zinc-500 truncate">{t('appTokens.rowHint')}</p>
        </div>
        <span className="text-sm font-medium text-white">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-zinc-500" /> : fmt(data?.balance ?? 0)}
        </span>
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent data-wallet-page className="bg-zinc-950 border-zinc-800">
          <DrawerHeader>
            <DrawerTitle className="text-white">{t('appTokens.title')}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <p className="text-2xl font-bold text-white">{fmt(data?.balance ?? 0)} <DhbCoin /></p>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">{t('appTokens.explainer')}</p>
            </div>
            <Button variant="glass" className="w-full h-11 rounded-xl gap-2" onClick={() => { setOpen(false); onSend(); }}>
              <Send className="w-4 h-4" />
              {t('wallet.send')}
            </Button>
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500 mb-1">{t('appTokens.history')}</p>
              {data?.entries?.length ? (
                <div className="divide-y divide-white/5">
                  {data.entries.map((e, i) => <EntryRow key={`${e.at}-${i}`} entry={e} />)}
                </div>
              ) : (
                <p className="py-4 text-sm text-zinc-500">{t('appTokens.noHistory')}</p>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

/** Send app tokens to a username or address. Nothing goes on chain. */
export function AppTokenSendDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useAppTokens(open);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [recipient, setRecipient] = useState<AppTokenPerson | null>(null);
  const [looking, setLooking] = useState(false);
  const [sending, setSending] = useState(false);
  // One key per attempt: kept across a retry of the same send, replaced once it lands.
  const keyRef = useRef(newAppTokenKey());

  const balance = Number(data?.balance ?? 0);
  const value = Number(amount);
  const tooMuch = value > balance;
  const canSend = !!recipient && value > 0 && !tooMuch && !sending;

  useEffect(() => {
    setRecipient(null);
    const text = to.trim();
    if (text.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLooking(true);
      try {
        const found = await findAppTokenRecipient(text);
        if (!cancelled) setRecipient(found);
      } catch {
        if (!cancelled) setRecipient(null);
      } finally {
        if (!cancelled) setLooking(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [to]);

  // A changed send is a new send, so it gets a new key.
  useEffect(() => { keyRef.current = newAppTokenKey(); }, [to, amount]);

  const send = async () => {
    if (!canSend || !recipient) return;
    setSending(true);
    try {
      await sendAppTokens({ to: recipient.address, amount: amount.trim(), key: keyRef.current, purpose: 'transfer', note: note.trim() || undefined });
      toast.success(t('appTokens.sent', { amount: fmt(amount), name: personName(recipient) }));
      keyRef.current = newAppTokenKey();
      setTo(''); setAmount(''); setNote('');
      void queryClient.invalidateQueries({ queryKey: [APP_TOKENS_QUERY_KEY] });
      onOpenChange(false);
    } catch (err: any) {
      const code = err?.errorCode;
      toast.error(
        code === 'INSUFFICIENT' ? t('appTokens.errorInsufficient')
          : code === 'RATE_LIMIT' ? t('appTokens.errorRateLimit')
          : code === 'NO_RECIPIENT' ? t('appTokens.errorNoRecipient')
          : code === 'SELF' ? t('appTokens.errorSelf')
          : err?.message || t('appTokens.errorGeneric'),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!sending) onOpenChange(v); }}>
      <DialogContent data-wallet-page className="bg-black/60 backdrop-blur-[24px] backdrop-saturate-[180%] border-white/10 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{t('appTokens.sendTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-xs leading-relaxed text-zinc-400">{t('appTokens.sendHint')}</p>

          <div className="space-y-2">
            <label className="text-sm text-zinc-400" htmlFor="app-token-to">{t('appTokens.to')}</label>
            <Input
              id="app-token-to"
              value={to}
              onChange={e => setTo(e.target.value)}
              placeholder={t('appTokens.toPlaceholder')}
              autoComplete="off"
              className="bg-white/5 border-white/10 text-white"
            />
            {looking ? (
              <p className="text-xs text-zinc-500 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" />{t('appTokens.looking')}</p>
            ) : recipient ? (
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                {recipient.avatarImageUrl
                  ? <img src={recipient.avatarImageUrl} alt="" className="w-6 h-6 rounded" />
                  : <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center"><User className="w-3 h-3 text-zinc-400" /></div>}
                <span className="text-sm text-white truncate">{recipient.displayName || personName(recipient)}</span>
                {recipient.displayName && <span className="text-xs text-zinc-500 truncate">{personName(recipient)}</span>}
              </div>
            ) : to.trim().length >= 2 ? (
              <p className="text-xs text-zinc-500">{t('appTokens.errorNoRecipient')}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-zinc-400" htmlFor="app-token-amount">{t('appTokens.amount')}</label>
              <button type="button" className="text-xs text-zinc-400 hover:text-white" onClick={() => setAmount(String(balance))}>
                {t('appTokens.available', { amount: fmt(balance) })}
              </button>
            </div>
            <Input
              id="app-token-amount"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
              placeholder="0"
              className="bg-white/5 border-white/10 text-white"
            />
            {tooMuch && <p className="text-xs text-red-400">{t('appTokens.errorInsufficient')}</p>}
          </div>

          <Input
            value={note}
            maxLength={140}
            onChange={e => setNote(e.target.value)}
            placeholder={t('appTokens.notePlaceholder')}
            className="bg-white/5 border-white/10 text-white"
          />

          <Button variant="glass" className="w-full h-11 rounded-xl" disabled={!canSend} onClick={send}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('appTokens.sendButton')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
