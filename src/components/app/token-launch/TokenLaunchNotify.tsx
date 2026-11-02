import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import Check from '@/components/ui/cut-icons/check';
import { useAuth } from '@/contexts/AuthContext';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { KitButton } from '@/components/app/page-kit/PageKit';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  getTokenLaunchStatus,
  isValidLaunchEmail,
  joinTokenLaunch,
} from '@/lib/api/dehub/token-launch';

/** A signed-out signup is remembered on this device so nobody is asked twice. */
const JOINED_KEY = 'dehub.tokenLaunch.joined';

function readJoined(): string | null {
  try { return localStorage.getItem(JOINED_KEY); } catch { return null; }
}
function writeJoined(masked: string) {
  try { localStorage.setItem(JOINED_KEY, masked || '1'); } catch { /* private mode */ }
}

/**
 * Shown wherever Buy Tokens used to start a purchase: the token is launching
 * soon, and people can ask to be emailed when it does. With an email on the
 * account it is one tap; otherwise they type one.
 */
export function TokenLaunchNotify({ className, compact }: { className?: string; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const [localJoined, setLocalJoined] = useState<string | null>(() => readJoined());
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const status = useQuery({
    queryKey: ['token-launch-notify', walletAddress],
    queryFn: getTokenLaunchStatus,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  useEffect(() => { setError(''); }, [email]);

  const joinedEmail = status.data?.joined ? (status.data.email || '1') : localJoined;
  const accountEmail = isAuthenticated ? status.data?.accountEmail ?? null : null;
  const loading = isAuthenticated && status.isLoading && !localJoined;

  const submit = async (useAccountEmail: boolean) => {
    if (!useAccountEmail && !isValidLaunchEmail(email)) {
      setError(t('tokenLaunch.invalidEmail'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await joinTokenLaunch(useAccountEmail
        ? { useAccountEmail: true, locale: i18n.language }
        : { email: email.trim(), locale: i18n.language });
      writeJoined(result.email);
      setLocalJoined(result.email || '1');
      queryClient.setQueryData(['token-launch-notify', walletAddress], {
        joined: true, email: result.email, accountEmail,
      });
    } catch (err) {
      const code = (err as { errorCode?: string })?.errorCode;
      setError(code === 'INVALID_EMAIL' ? t('tokenLaunch.invalidEmail') : t('tokenLaunch.failed'));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit(false);
  };

  return (
    <div
      data-page-bento
      data-kit-section
      data-token-launch
      className={cn('rounded-xl bg-zinc-900 text-center', compact ? 'p-4' : 'px-5 py-7', className)}
    >
      <span className={cn('mx-auto flex items-center justify-center', compact ? 'mb-3 h-12 w-12' : 'mb-4 h-16 w-16')}>
        <ThemedIcon icon="buy" alt="" className="h-full w-full object-contain" />
      </span>
      <p data-kit-eyebrow className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {t('tokenLaunch.eyebrow')}
      </p>
      <h2 className="mt-1 text-[19px] font-semibold text-white">{t('tokenLaunch.title')}</h2>

      {joinedEmail ? (
        <div className="mt-4 flex flex-col items-center gap-2" role="status">
          <span className="flex items-center gap-2 rounded-[10px] bg-emerald-500/15 px-3 py-2 text-[14px] font-semibold text-emerald-400">
            <Check className="h-4 w-4" />
            {t('tokenLaunch.joinedTitle')}
          </span>
          <p className="max-w-xs text-[13px] leading-relaxed text-zinc-400">
            {joinedEmail.includes('@')
              ? t('tokenLaunch.joinedBody', { email: joinedEmail })
              : t('tokenLaunch.joinedBodyNoEmail')}
          </p>
        </div>
      ) : (
        <>
          <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-zinc-400">{t('tokenLaunch.body')}</p>
          {loading ? (
            <Loader2 className="mx-auto mt-5 h-5 w-5 animate-spin text-zinc-500" />
          ) : accountEmail ? (
            <div className="mx-auto mt-5 flex max-w-xs flex-col gap-2">
              <KitButton onClick={() => void submit(true)} disabled={busy} className="w-full">
                {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : t('tokenLaunch.notifyMe')}
              </KitButton>
              <p className="text-[12px] text-zinc-500">{t('tokenLaunch.sendTo', { email: accountEmail })}</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="mx-auto mt-5 flex max-w-xs flex-col gap-2 text-left">
              <label htmlFor="token-launch-email" className="sr-only">{t('tokenLaunch.emailLabel')}</label>
              <Input
                id="token-launch-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('tokenLaunch.emailPlaceholder')}
                aria-invalid={!!error}
                className="h-11 rounded-[10px] bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
              <KitButton type="submit" disabled={busy || !email.trim()} className="w-full">
                {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : t('tokenLaunch.notifyMe')}
              </KitButton>
            </form>
          )}
          {error ? <p className="mt-2 text-[12.5px] text-red-400" role="alert">{error}</p> : null}
          <p className="mx-auto mt-3 max-w-xs text-[11.5px] text-zinc-500">{t('tokenLaunch.privacy')}</p>
        </>
      )}
    </div>
  );
}
