/**
 * `/apps/dev` — build a dehub mini app.
 *
 * One page that answers the three questions every other mini app platform
 * makes developers dig for: is my manifest right (a field-by-field check,
 * with Farcaster manifests accepted as they are), what will my link look like
 * in the feed, and does it run (launch any URL — localhost included — in the
 * real host, marked as a developer preview).
 *
 * It also signs the ownership block for you with your dehub wallet, so there
 * is no key or signature format to get wrong.
 */
import { useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { verifyMessage } from 'ethers';
import { AlertTriangle, CheckCircle2, Copy, Loader2, Play, Send, ShieldCheck } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { useAuth } from '@/contexts/AuthContext';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { signEncryptionMessage } from '@/lib/dm-e2ee/signer';
import { ownershipMessage, parseAppUrl } from '@/lib/miniapp/protocol';
import { checkManifest, fetchLatestRewards, createNotifyKey, fetchMyApps, submitApp, type ManifestCheck } from '@/lib/miniapp/registry';

const QUICKSTART = `<script src="https://dehub.io/sdk/miniapp.js"></script>
<script>
  // Hide the splash screen once your first screen is on.
  dehub.ready();

  // Who is using the app (null when signed out).
  const { user } = await dehub.context;

  // Sign in with dehub: a JWT for YOUR server to verify.
  const { token } = await dehub.auth.getToken();

  // Share back into the feed.
  dehub.actions.composePost({ text: 'I just scored 42', embedUrl: location.href });
</script>`;

const VERIFY = `import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/miniapp-auth'),
);

const { payload } = await jwtVerify(token, JWKS, {
  issuer: 'https://dehub.io',
  audience: 'app.example.com', // your domain
});
// payload.sub is the user's wallet address`;

const MANIFEST = `// https://app.example.com/.well-known/dehub.json
{
  "version": "1",
  "ownership": { "address": "0x…", "domain": "app.example.com", "signature": "0x…" },
  "app": {
    "name": "Example",
    "homeUrl": "https://app.example.com",
    "iconUrl": "https://app.example.com/icon-1024.png",
    "splashBackgroundColor": "#0B0B0B",
    "subtitle": "One line, 30 characters",
    "description": "What it does, 170 characters at most.",
    "category": "games",
    "tags": ["chess"]
  }
}`;

const PAY = `// In your app. DeHub shows the amount, your app and your wallet;
// the DHB goes straight to the wallet that signed your dehub.json.
const { txHash, receipt } = await dehub.actions.pay({ amount: 50, memo: 'Extra life' });

// On your server: the receipt is a JWT, checked against the same JWKS.
const { payload } = await jwtVerify(receipt, JWKS, {
  issuer: 'https://dehub.io',
  audience: 'app.example.com',
});
// payload.typ === 'payment', payload.amount, payload.token === 'DHB', payload.txHash`;

const NOTIFY = `// In your app: ask once. Only people who add your app can be notified.
await dehub.actions.addApp();

// On your server, with the notify key from "Your apps" above.
await fetch('https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/miniapp-notify', {
  method: 'POST',
  headers: { Authorization: 'Bearer dhmk_…', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    notificationId: 'daily-2026-09-30',   // same id twice in 24h is skipped
    title: 'Your turn',                    // 32 characters
    body: 'The board has moved.',          // 128 characters
    targetUrl: 'https://app.example.com/game/42',
    wallets: ['0x…'],                      // optional; omit for everyone who added you
  }),
});
// Limits per person: one every 30 seconds, ten a day.`;

const EMBED = `<meta name="dehub:miniapp" content='{"version":"1","imageUrl":"https://app.example.com/card-3x2.png","button":{"title":"Play","url":"https://app.example.com/?room=42"}}' />`;

function CodeBlock({ code }: { code: string }) {
  const { t } = useTranslation();
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl bg-black/60 p-3 text-[11px] leading-relaxed text-zinc-200 ring-1 ring-white/10">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(code);
          toast.success(t('miniApps.dev.copied'));
        }}
        aria-label={t('miniApps.dev.copy')}
        className="absolute right-2 top-2 rounded-md bg-zinc-800 p-1.5 text-zinc-300 hover:bg-zinc-700"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section data-feed-item className="space-y-3 rounded-2xl bg-zinc-900/60 p-4 ring-1 ring-white/[0.06]">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

export default function AppsDevPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { walletAddress, connectionSource } = useAuth();
  const [url, setUrl] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ManifestCheck | null>(null);
  const [signing, setSigning] = useState(false);
  const [ownership, setOwnership] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { data: rewards } = useQuery({ queryKey: ['miniapp-rewards'], queryFn: fetchLatestRewards, staleTime: 5 * 60_000 });
  const [notifyKey, setNotifyKey] = useState<{ slug: string; key: string } | null>(null);
  const makeNotifyKey = async (slug: string) => {
    try {
      setNotifyKey({ slug, key: await createNotifyKey(slug) });
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  const queryClient = useQueryClient();
  const { data: myApps } = useQuery({
    queryKey: ['miniapp-mine', walletAddress],
    queryFn: fetchMyApps,
    enabled: Boolean(walletAddress),
    staleTime: 30_000,
  });
  const contentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(contentRef, '[data-feed-nav-outer] > [data-page-bento]');

  const parsed = parseAppUrl(url, { dev: true });
  const isLocal = parsed?.protocol === 'http:';

  const submit = async () => {
    if (!parsed) return;
    setSubmitting(true);
    try {
      const { app, updated } = await submitApp(parsed.toString());
      toast.success(updated ? t('miniApps.dev.submitUpdated') : t('miniApps.dev.submitDone'));
      void queryClient.invalidateQueries({ queryKey: ['miniapp-mine'] });
      navigate(`/apps/${app.slug}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const check = async () => {
    if (!parsed) return;
    setChecking(true);
    setResult(null);
    try {
      setResult(await checkManifest(parsed.toString()));
    } catch {
      setResult({ ok: false, errors: [], warnings: [], error: t('miniApps.dev.checkFailed') });
    } finally {
      setChecking(false);
    }
  };

  const launch = () => {
    if (!parsed) return;
    const name = result?.manifest?.name;
    const qs = new URLSearchParams({ url: parsed.toString() });
    if (name) qs.set('name', name);
    navigate(`/apps/dev/run?${qs.toString()}`);
  };

  const signOwnership = async () => {
    if (!parsed || !walletAddress) return;
    setSigning(true);
    try {
      const domain = parsed.hostname.toLowerCase();
      const message = ownershipMessage(domain);
      const signature = await signEncryptionMessage(message, walletAddress, connectionSource);
      // The address that actually signed, which for an embedded wallet may be
      // its signing key rather than the address shown on the profile.
      const address = verifyMessage(message, signature).toLowerCase();
      setOwnership(JSON.stringify({ ownership: { address, domain, signature } }, null, 2));
    } catch (error) {
      toast.error((error as Error).message || t('miniApps.dev.signFailed'));
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="min-h-screen">
      <SEOHead
        title={t('miniApps.dev.seoTitle')}
        description={t('miniApps.dev.seoDescription')}
        url="https://dehub.io/apps/dev"
        image="https://dehub.io/og/apps.jpg"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'TechArticle',
          headline: 'Build a DeHub mini app',
          url: 'https://dehub.io/apps/dev',
        }}
      />

      <div
        data-feed-nav-outer
        className="sticky top-11 z-50 mx-auto max-w-3xl bg-black px-2 pb-0 pt-1 sm:px-3 sm:pt-1 lg:top-0 lg:pt-2"
      >
        <div data-page-bento className="space-y-2 rounded-2xl bg-zinc-900 px-4 py-3">
          <h1 className="text-xl font-bold text-white">{t('miniApps.dev.title')}</h1>
          <p className="text-xs leading-relaxed text-zinc-400">{t('miniApps.dev.intro')}</p>
          <Link to="/apps" className="text-xs font-medium text-zinc-300 underline underline-offset-2">
            {t('miniApps.dev.backToStore')}
          </Link>
        </div>
      </div>

      <div ref={contentRef} className="mx-auto max-w-3xl space-y-3 px-2 pb-24 pt-2 sm:px-3">
        <Section title={t('miniApps.dev.checkTitle')}>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (isLocal) launch();
              else void check();
            }}
          >
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://app.example.com"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg bg-black/60 px-3 py-2 font-mono text-sm text-white ring-1 ring-white/10 placeholder:text-zinc-600 focus:outline-none focus:ring-white/30"
            />
            <div className="flex gap-2">
              {!isLocal ? (
                <button
                  type="submit"
                  disabled={!parsed || checking}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
                >
                  {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {t('miniApps.dev.check')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={launch}
                disabled={!parsed}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40"
              >
                <Play className="h-4 w-4" /> {t('miniApps.dev.launch')}
              </button>
            </div>
          </form>
          {url && !parsed ? <p className="text-xs text-amber-400">{t('miniApps.dev.badUrl')}</p> : null}
          {isLocal ? <p className="text-xs text-zinc-400">{t('miniApps.dev.localNote')}</p> : null}

          {result ? (
            <div className="space-y-3">
              {result.error ? <p className="text-sm text-amber-400">{result.error}</p> : null}
              {!result.error ? (
                <p className={`flex items-center gap-1.5 text-sm font-medium ${result.ok ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {result.ok ? t('miniApps.dev.passed') : t('miniApps.dev.failed', { count: result.errors.length })}
                  {result.source === 'farcaster' ? (
                    <span className="ml-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] text-violet-300">
                      {t('miniApps.dev.farcasterImport')}
                    </span>
                  ) : null}
                </p>
              ) : null}
              {[...result.errors.map((p) => ({ ...p, level: 'error' })), ...result.warnings.map((p) => ({ ...p, level: 'warning' }))].map(
                (p, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <span className={`shrink-0 font-mono ${p.level === 'error' ? 'text-amber-400' : 'text-zinc-500'}`}>{p.field}</span>
                    <span className="text-zinc-300">{p.message}</span>
                  </div>
                ),
              )}
              {result.embed?.imageUrl ? (
                <div>
                  <p className="mb-1.5 text-xs text-zinc-500">{t('miniApps.dev.cardPreview')}</p>
                  <div className="max-w-sm overflow-hidden rounded-xl ring-1 ring-white/10">
                    <img src={result.embed.imageUrl} alt="" className="aspect-[3/2] w-full object-cover" />
                    <div className="bg-zinc-900 p-2">
                      <div className="rounded-lg bg-white py-1.5 text-center text-xs font-semibold text-black">
                        {result.embed.buttonTitle || t('miniApps.dev.open')}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              {result.ok && parsed && !isLocal ? (
                <div className="space-y-2 border-t border-white/10 pt-3">
                  <p className="text-xs leading-relaxed text-zinc-400">{t('miniApps.dev.submitBody')}</p>
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={submitting || !walletAddress}
                    className="flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {t('miniApps.dev.submit')}
                  </button>
                  {!walletAddress ? <p className="text-xs text-zinc-500">{t('miniApps.dev.submitSignIn')}</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </Section>

        {myApps && myApps.length > 0 ? (
          <Section title={t('miniApps.dev.yourAppsTitle')}>
            <div className="space-y-2">
              {myApps.map((app) => (
                <div key={app.slug} className="flex items-center gap-3 rounded-xl bg-black/40 p-2.5 ring-1 ring-white/10">
                  {app.icon_url ? (
                    <img src={app.icon_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded-lg bg-zinc-800" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{app.name}</p>
                    <p className="truncate text-xs text-zinc-400">
                      {app.status === 'suspended'
                        ? t('miniApps.dev.stateSuspended')
                        : app.tier === 'unlisted'
                          ? t('miniApps.dev.stateUnlisted')
                          : t('miniApps.dev.stateListed')}
                      {app.review_note ? ` · ${app.review_note}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(`https://dehub.io/apps/${app.slug}`);
                      toast.success(t('miniApps.dev.copied'));
                    }}
                    aria-label={t('miniApps.dev.copyLink')}
                    className="rounded-md bg-zinc-800 p-2 text-zinc-300 hover:bg-zinc-700"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <Link
                    to={`/apps/${app.slug}`}
                    className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700"
                  >
                    {t('miniApps.dev.open')}
                  </Link>
                  {app.owner_wallet ? (
                    <button
                      type="button"
                      onClick={() => void makeNotifyKey(app.slug)}
                      className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700"
                    >
                      {t('miniApps.dev.notifyKey')}
                    </button>
                  ) : null}
                </div>
              ))}
              {notifyKey ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-amber-300">{t('miniApps.dev.notifyKeyOnce', { name: notifyKey.slug })}</p>
                  <CodeBlock code={notifyKey.key} />
                </div>
              ) : null}
            </div>
          </Section>
        ) : null}

        <Section title={t('miniApps.dev.ownershipTitle')}>
          <p className="text-xs leading-relaxed text-zinc-400">{t('miniApps.dev.ownershipBody')}</p>
          <button
            type="button"
            onClick={() => void signOwnership()}
            disabled={!parsed || isLocal || !walletAddress || signing}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-40"
          >
            {signing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {parsed && !isLocal
              ? t('miniApps.dev.signFor', { domain: parsed.hostname })
              : t('miniApps.dev.signNeedsUrl')}
          </button>
          {!walletAddress ? <p className="text-xs text-zinc-500">{t('miniApps.dev.signInFirst')}</p> : null}
          {ownership ? <CodeBlock code={ownership} /> : null}
        </Section>

        <Section title={t('miniApps.dev.quickstartTitle')}>
          <p className="text-xs leading-relaxed text-zinc-400">{t('miniApps.dev.quickstartBody')}</p>
          <CodeBlock code={QUICKSTART} />
        </Section>

        <Section title={t('miniApps.dev.manifestTitle')}>
          <p className="text-xs leading-relaxed text-zinc-400">{t('miniApps.dev.manifestBody')}</p>
          <CodeBlock code={MANIFEST} />
        </Section>

        <Section title={t('miniApps.dev.embedTitle')}>
          <p className="text-xs leading-relaxed text-zinc-400">{t('miniApps.dev.embedBody')}</p>
          <CodeBlock code={EMBED} />
        </Section>

        <Section title={t('miniApps.dev.verifyTitle')}>
          <p className="text-xs leading-relaxed text-zinc-400">{t('miniApps.dev.verifyBody')}</p>
          <CodeBlock code={VERIFY} />
        </Section>

        <Section title={t('miniApps.dev.rankTitle')}>
          <p className="text-xs leading-relaxed text-zinc-400">{t('miniApps.dev.rankBody')}</p>
          <p className="text-xs leading-relaxed text-zinc-400">
            {t('miniApps.dev.rewardsBody', { pool: (rewards?.monthlyPool ?? 0).toLocaleString() })}
          </p>
          {rewards?.weekStart && rewards.rows.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-300">{t('miniApps.dev.rewardsWeek', { date: rewards.weekStart })}</p>
              {rewards.rows.map((row) => (
                <div key={row.app_id} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-white">{row.miniapp_apps?.name ?? row.app_id}</span>
                  <span className="tabular-nums text-zinc-400">{(Number(row.share) * 100).toFixed(1)}%</span>
                  <span className="w-28 text-right tabular-nums text-white">{Number(row.amount_dhb).toLocaleString()} DHB</span>
                  <span className={row.paid_at ? 'w-16 text-right text-emerald-400' : 'w-16 text-right text-zinc-500'}>
                    {row.paid_at ? t('miniApps.dev.rewardPaid') : t('miniApps.dev.rewardPending')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">{t('miniApps.dev.rewardsNone')}</p>
          )}
        </Section>

        <Section title={t('miniApps.dev.payTitle')}>
          <p className="text-xs leading-relaxed text-zinc-400">{t('miniApps.dev.payBody')}</p>
          <CodeBlock code={PAY} />
        </Section>

        <Section title={t('miniApps.dev.notifyTitle')}>
          <p className="text-xs leading-relaxed text-zinc-400">{t('miniApps.dev.notifyBody')}</p>
          <CodeBlock code={NOTIFY} />
        </Section>
      </div>
    </div>
  );
}
