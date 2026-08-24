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
  unlinkEmailLogin,
  type EmailLinkStatusResponse,
} from '@/lib/api/dehub';

/**
 * "Sign-in email" — lets an account that logs in with a wallet attach an
 * email address it can sign in with instead, and take it off again.
 *
 * The backend owns every rule (cooldowns, caps, collisions, which links may
 * be removed); this component only shuttles the handshake and surfaces the
 * server's copy verbatim.
 *
 * The form sits UNDER the row rather than in its action slot: an email field
 * plus a button does not fit beside the label on a phone, and the settings
 * row grid does not wrap.
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
      .catch(
        () =>
          alive &&
          setStatus({ status: false, linked: false, email: null, canLink: true, source: null }),
      );
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
      const result = await confirmEmailLink(email.trim(), code.trim());
      setAwaitingCode(false);
      setCode('');
      setEmail('');
      setStatus({
        status: true,
        linked: true,
        email: result.email ?? maskLocal(email.trim()),
        canLink: true,
        source: 'wallet-email',
      });
      toast.success(t('settings.emailSignInDone', 'You can now sign in with this email'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await unlinkEmailLogin();
      setStatus({ status: true, linked: false, email: null, canLink: true, source: null });
      setEmail('');
      setCode('');
      setAwaitingCode(false);
      toast.success(
        t('settings.emailSignInRemoved', 'Removed — this email can no longer sign you in'),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const linked = !!status?.linked;
  // A login this flow did not write (a social signup) already works on other
  // devices and must not be replaced from here — show it, offer nothing.
  const foreignLogin = !!status && !status.linked && status.canLink === false;
  const loading = status === null;

  return (
    <div className="space-y-3">
      <SettingsRow
        icon={<Mail />}
        title={t('settings.emailSignIn', 'Sign-in email')}
        description={
          linked
            ? t('settings.emailSignInLinked', 'Code login is active for {{email}}', {
                email: status?.email ?? '',
              })
            : foreignLogin
              ? t('settings.emailSignInExisting', 'You already sign in with {{email}}', {
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
              disabled={busy}
              className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-xl"
              onClick={remove}
            >
              {busy ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                t('settings.emailSignInRemove', 'Remove')
              )}
            </Button>
          ) : loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
          ) : null
        }
      />

      {!linked && !foreignLogin && !loading && (
        <div className="flex flex-col gap-2 pl-8 sm:flex-row sm:items-center">
          {awaitingCode ? (
            <>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 sm:w-28 sm:text-center"
              />
              <div className="flex items-center gap-2">
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
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  className="text-zinc-400 hover:text-white rounded-xl"
                  onClick={() => {
                    setAwaitingCode(false);
                    setCode('');
                  }}
                >
                  {t('settings.cancel', 'Cancel')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 sm:w-64"
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
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Local stand-in for the rare case confirm answers without the masked copy. */
function maskLocal(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}
