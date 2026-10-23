import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import {
  approveAuthorizeRequest,
  AUTHORIZE_PARAMS,
  describeAuthorizeRequest,
  type AuthorizeRequest,
} from '@/lib/api/dehub/mastodon-apps';

/**
 * /oauth/authorize — where a Mastodon app (Ivory, Ice Cubes, Tusky, Elk…)
 * sends someone signing in to "dehub.io". Shows the app and what it asks for;
 * Allow mints a one-time code (dehub-stream-backend src/mastodon) and sends
 * the person back to the app with it, Cancel sends them back without.
 * Not indexed: every URL here is one app's one sign-in attempt.
 */

const SCOPE_KEYS: Record<string, string> = {
  read: 'mastodonApps.scopeRead',
  write: 'mastodonApps.scopeWrite',
  follow: 'mastodonApps.scopeFollow',
  push: 'mastodonApps.scopePush',
  profile: 'mastodonApps.scopeProfile',
};

/** One line per kind of access, however finely the app split its scopes. */
function scopeLines(scopes: string[]): string[] {
  const tops = [...new Set(scopes.map((scope) => scope.split(':')[0]))];
  return ['read', 'write', 'follow', 'push', 'profile'].filter((top) => tops.includes(top)).map((top) => SCOPE_KEYS[top]);
}

export default function OAuthAuthorizePage() {
  const { t } = useTranslation();
  const { user, walletAddress, isAuthenticated, openLoginModal } = useAuth() as any;
  const [query] = useSearchParams();
  const params = useMemo(() => {
    const out: Record<string, string> = {};
    for (const name of AUTHORIZE_PARAMS) {
      const value = query.get(name);
      if (value) out[name] = value;
    }
    return out;
  }, [query]);
  const [request, setRequest] = useState<AuthorizeRequest | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let active = true;
    if (!params.client_id) {
      setInvalid(true);
      return;
    }
    describeAuthorizeRequest(params)
      .then((data) => active && setRequest(data))
      .catch(() => active && setInvalid(true));
    return () => {
      active = false;
    };
  }, [params]);

  const backToApp = (to: string) => {
    setLeaving(true);
    window.location.assign(to);
  };

  const allow = async () => {
    setBusy(true);
    try {
      const result = await approveAuthorizeRequest(params);
      if (result.redirectTo) backToApp(result.redirectTo);
      else setCode(result.code);
    } catch {
      toast.error(t('mastodonApps.failed'));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    if (!request || request.outOfBand) {
      window.location.assign('/app');
      return;
    }
    const back = new URL(request.redirectUri);
    back.searchParams.set('error', 'access_denied');
    if (params.state) back.searchParams.set('state', params.state);
    backToApp(back.toString());
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t('mastodonApps.copied'));
    } catch {
      // The code is selectable; copying by hand still works.
    }
  };

  const name = user?.displayName || user?.username || walletAddress || '';

  return (
    <div data-glass-page data-theme-page-surface className="relative z-[1] flex min-h-screen items-center justify-center bg-black p-4 text-white">
      <SEOHead title={t('mastodonApps.authTitle')} description={t('mastodonApps.seoDescription')} noindex noCanonical />
      <main className="w-full max-w-md rounded-2xl border border-white/15 bg-white/[0.03] p-6">
        <div className="mb-4 flex items-center gap-2 text-white/70">
          <ShieldCheck className="size-5" />
          <h1 className="text-lg font-semibold text-white">{t('mastodonApps.authTitle')}</h1>
        </div>

        {invalid ? (
          <p role="alert" className="text-sm text-white/70">{t('mastodonApps.invalid')}</p>
        ) : !request ? (
          <div className="h-24 animate-pulse rounded-xl bg-white/5" />
        ) : code ? (
          <div className="space-y-3">
            <p className="text-sm text-white/70">{t('mastodonApps.codeTitle')}</p>
            <code className="block break-all rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm select-all">{code}</code>
            <Button onClick={() => void copyCode()}>{t('mastodonApps.copy')}</Button>
          </div>
        ) : leaving ? (
          <p className="text-sm text-white/70">{t('mastodonApps.redirecting', { app: request.name })}</p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-base font-medium">{t('mastodonApps.authWants', { app: request.name })}</p>
              {request.website ? (
                <a href={request.website} target="_blank" rel="noopener noreferrer" className="text-xs text-white/50 underline">
                  {request.website}
                </a>
              ) : null}
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-white/80">
              {scopeLines(request.scopes).map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
            {!isAuthenticated ? (
              <Button className="w-full" onClick={() => openLoginModal()}>
                {t('mastodonApps.authSignIn')}
              </Button>
            ) : (
              <>
                <p className="break-all text-xs text-white/50">{t('mastodonApps.authSignedInAs', { name })}</p>
                <div className="flex gap-3">
                  <Button className="flex-1" disabled={busy} onClick={() => void allow()}>
                    {t('mastodonApps.allow')}
                  </Button>
                  <Button className="flex-1" variant="outline" disabled={busy} onClick={cancel}>
                    {t('mastodonApps.cancel')}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
