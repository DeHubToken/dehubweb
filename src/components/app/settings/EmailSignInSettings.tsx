import { useEffect, useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SettingsRow } from './SettingsRow';
import {
  getEmailLinkStatus,
  requestEmailLinkCode,
  confirmEmailLink,
  type EmailLinkStatusResponse,
} from '@/lib/api/dehub';

/**
 * "Sign-in email" — lets an account that logs in with a wallet attach an
 * email address it can sign in with instead. The backend owns every rule
 * (cooldowns, caps, collisions); this component only shuttles the two-step
 * handshake and surfaces the server's copy verbatim.
 */
export function EmailSignInSettings() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<EmailLinkStatusResponse | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getEmailLinkStatus()
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus({ status: false, linked: false, email: null }));
    return () => {
      alive = false;
    };
  }, []);

  const sendCode = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await requestEmailLinkCode(email.trim());
      setAwaitingCode(true);
      toast.success(t('settings.emailSignInSent', 'Check your inbox for the code'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!email.trim() || !code.trim()) return;
    setBusy(true);
    try {
      await confirmEmailLink(email.trim(), code.trim());
      setAwaitingCode(false);
      setCode('');
      setStatus({ status: true, linked: true, email: maskLocal(email.trim()) });
      toast.success(t('settings.emailSignInDone', 'You can now sign in with this email'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const linked = !!status?.linked;

  return (
    <SettingsRow
      icon={<Mail />}
      title={t('settings.emailSignIn', 'Sign-in email')}
      description={
        linked
          ? t('settings.emailSignInLinked', 'Code login is active for {{email}}', {
              email: status?.email ?? '',
            })
          : t(
              'settings.emailSignInDesc',
              'Attach an email address to sign in without your wallet.',
            )
      }
      action={
        linked ? (
          <Button
            variant="outline"
            size="sm"
            className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-xl"
            onClick={() => setStatus({ status: true, linked: false, email: null })}
          >
            {t('settings.emailSignInReplace', 'Change')}
          </Button>
        ) : awaitingCode ? (
          <div className="flex items-center gap-2">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-24 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 text-center"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy || code.length !== 6}
              className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-xl"
              onClick={confirm}
            >
              {busy ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                t('settings.emailSignInConfirm', 'Confirm')
              )}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-44 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !/.+@.+\..+/.test(email)}
              className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-xl"
              onClick={sendCode}
            >
              {busy ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                t('settings.emailSignInSend', 'Send code')
              )}
            </Button>
          </div>
        )
      }
    />
  );
}

/** Local stand-in until the server's masked copy replaces it after confirm. */
function maskLocal(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}
