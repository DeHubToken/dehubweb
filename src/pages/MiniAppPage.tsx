/**
 * Mini app player
 * ===============
 * `/apps/:slug`       a registered app
 * `/apps/dev/run`     any URL, in developer mode (`?url=`)
 *
 * Standalone, outside AppLayout, like the arcade player: the app owns the
 * viewport. dehub always draws the header — the app's name, its REAL domain
 * and its review state — and the app cannot draw over it, because it lives in
 * the frame underneath. That header is the anti-phishing half of the design;
 * the SDK bridge (lib/miniapp/host-bridge) is the other half.
 *
 * On a wide screen the app runs in a phone-width column: mini apps are built
 * mobile-first, and stretching one to 1400px is how they look broken.
 */
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, BadgeCheck, Loader2, ShieldAlert, Wrench, X } from 'lucide-react';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { useAuth } from '@/contexts/AuthContext';
import { useMiniAppHost, type PaymentResult } from '@/lib/miniapp/host-bridge';
import { payDhb } from '@/lib/dhb-payment';
import { launchUrl, parseAppUrl, type LaunchSource, type MiniAppContext } from '@/lib/miniapp/protocol';
import { useFarcasterHost } from '@/lib/miniapp/farcaster-host';
import { addApp, fetchAddedApps, fetchAppBySlug, recordPayment, type MiniAppListing } from '@/lib/miniapp/registry';

const PostModal = React.lazy(() =>
  import('@/features/post/PostModal').then((m) => ({ default: m.PostModal })),
);

/** How long the splash waits for ready() before stepping aside anyway. */
const READY_CAP_MS = 8000;

/**
 * allow-same-origin gives the app its OWN origin, never ours: parseAppUrl
 * refuses every dehub host. Top navigation and downloads are withheld — an
 * app cannot take over the tab or hand somebody an installer.
 */
const MINIAPP_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals';

type Badge = 'verified' | 'unreviewed' | 'dev' | null;

interface HostedApp {
  url: URL;
  /** Registered apps only; a developer preview has none, so it cannot be added or paid. */
  slug?: string;
  /** Where payments go, when the domain's owner is verified. */
  ownerWallet?: string | null;
  name: string;
  iconUrl: string | null;
  splashBackground: string;
  badge: Badge;
  description: string | null;
}

function launchSource(value: string | null, dev: boolean): LaunchSource {
  if (value === 'store' || value === 'feed' || value === 'share' || value === 'notification') return value;
  return dev ? 'dev' : 'direct';
}

function MiniAppFrame({ app, dev }: { app: HostedApp; dev: boolean }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, walletAddress } = useAuth();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [composerMounted, setComposerMounted] = useState(false);
  const [signInAsk, setSignInAsk] = useState<{ domain: string; resolve: (ok: boolean) => void } | null>(null);
  const [addAsk, setAddAsk] = useState<{ resolve: (ok: boolean) => void } | null>(null);
  const [payAsk, setPayAsk] = useState<{ amount: number; memo: string | null; resolve: (ok: boolean) => void } | null>(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let live = true;
    if (!app.slug || !walletAddress) return;
    fetchAddedApps(walletAddress).then((rows) => {
      if (live) setAdded(rows.some((r) => r.miniapp_apps?.slug === app.slug));
    });
    return () => {
      live = false;
    };
  }, [app.slug, walletAddress]);

  const answer = (sheet: { resolve: (ok: boolean) => void } | null, clear: () => void, ok: boolean) => {
    sheet?.resolve(ok);
    clear();
  };

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => {
      setReady(true);
      if (dev) toast.warning(t('miniApps.host.readyTimeout'));
    }, READY_CAP_MS);
    return () => window.clearTimeout(timer);
  }, [ready, dev, t]);

  const context = useMemo<MiniAppContext>(() => {
    const wallet = walletAddress?.toLowerCase() ?? null;
    return {
      user: wallet
        ? {
            wallet,
            handle: user?.username ?? null,
            displayName: user?.displayName ?? user?.display_name ?? null,
            avatarUrl: user?.avatarImageUrl ?? user?.avatarUrl ?? user?.avatar_url ?? null,
          }
        : null,
      location: { type: launchSource(params.get('from'), dev) },
      client: {
        platform: 'web',
        added,
        locale: i18n.language || 'en',
        theme: 'dark',
        safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 },
      },
    };
  }, [walletAddress, user, params, dev, i18n.language, added]);

  const close = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate(dev ? '/apps/dev' : '/apps');
  }, [navigate, dev]);

  const requestSignIn = useCallback(
    (domain: string) => new Promise<boolean>((resolve) => setSignInAsk({ domain, resolve })),
    [],
  );

  const answerSignIn = (allowed: boolean) => {
    signInAsk?.resolve(allowed);
    setSignInAsk(null);
  };

  const onCompose = useCallback((text: string) => {
    setComposerMounted(true);
    setDraft(text || ' ');
  }, []);
  const onReady = useCallback(() => setReady(true), []);

  // Adding and paying both go through a sheet DeHub draws over the app:
  // nothing is added and nothing leaves the wallet without that tap.
  const slug = app.slug;
  const addAppFlow = useCallback(async () => {
    const allowed = await new Promise<boolean>((resolve) => setAddAsk({ resolve }));
    if (!allowed || !slug) return { added: false };
    await addApp(slug);
    setAdded(true);
    return { added: true };
  }, [slug]);

  const payFlow = useCallback(
    async (request: { amount: number; memo: string | null }): Promise<PaymentResult> => {
      if (!slug || !app.ownerWallet) throw Object.assign(new Error(t('miniApps.pay.noOwner')), { code: 'unsupported' });
      const allowed = await new Promise<boolean>((resolve) => setPayAsk({ ...request, resolve }));
      if (!allowed) throw Object.assign(new Error('The user declined to pay.'), { code: 'rejected' });
      const toastId = toast.loading(t('miniApps.pay.sending'));
      try {
        const sent = await payDhb(request.amount, app.ownerWallet, { context: `${app.name} payment` });
        const recorded = await recordPayment({ slug, txHash: sent.txHash, chainId: sent.chainId, amount: request.amount, memo: request.memo });
        toast.success(t('miniApps.pay.sent', { amount: recorded.amount, name: app.name }), { id: toastId });
        return recorded;
      } catch (error) {
        toast.error((error as Error).message, { id: toastId });
        throw error;
      }
    },
    [slug, app.ownerWallet, app.name, t],
  );

  useMiniAppHost(frameRef, {
    appUrl: app.url,
    context,
    onReady,
    onClose: close,
    onCompose,
    requestSignIn,
    addApp: slug ? addAppFlow : undefined,
    pay: slug && app.ownerWallet ? payFlow : undefined,
  });
  // Apps built for Farcaster speak its SDK instead; answer that too.
  useFarcasterHost(frameRef, {
    appUrl: app.url,
    context,
    onReady,
    onClose: close,
    onCompose,
    addApp: slug ? addAppFlow : undefined,
  });

  return (
    <div className="fixed inset-0 z-[100] flex justify-center bg-black">
      <div className="flex h-full w-full max-w-[480px] flex-col md:border-x md:border-white/10">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 bg-zinc-950 px-2">
          <button
            type="button"
            onClick={close}
            aria-label={t('miniApps.host.close')}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-300 hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
          {app.iconUrl ? (
            <img src={app.iconUrl} alt="" className="h-6 w-6 rounded-md object-cover" />
          ) : null}
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-semibold text-white">{app.name}</p>
            <p className="truncate font-mono text-[11px] text-zinc-400">{app.url.host}</p>
          </div>
          {app.badge === 'verified' ? (
            <span className="flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-300">
              <BadgeCheck className="h-3 w-3" /> {t('miniApps.badge.verified')}
            </span>
          ) : app.badge === 'unreviewed' ? (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
              <ShieldAlert className="h-3 w-3" /> {t('miniApps.badge.unreviewed')}
            </span>
          ) : app.badge === 'dev' ? (
            <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-300">
              <Wrench className="h-3 w-3" /> {t('miniApps.badge.dev')}
            </span>
          ) : null}
        </header>

        <div className="relative flex-1">
          <iframe
            ref={frameRef}
            src={app.url.toString()}
            title={app.name}
            className="h-full w-full border-0 bg-black"
            sandbox={MINIAPP_SANDBOX}
            allow="clipboard-write"
            referrerPolicy="strict-origin"
          />
          {!ready ? (
            <div
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3"
              style={{ background: app.splashBackground }}
            >
              {app.iconUrl ? (
                <img src={app.iconUrl} alt="" className="h-20 w-20 rounded-2xl object-cover" />
              ) : (
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
              )}
              <p className="text-sm font-medium text-white/90">{app.name}</p>
            </div>
          ) : null}
        </div>
      </div>

      {signInAsk ? (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-950 p-5 ring-1 ring-white/10">
            <p className="text-base font-semibold text-white">{t('miniApps.signIn.title', { name: app.name })}</p>
            <p className="mt-1 font-mono text-xs text-zinc-400">{signInAsk.domain}</p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">{t('miniApps.signIn.body')}</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => answerSignIn(false)}
                className="flex-1 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
              >
                {t('miniApps.signIn.cancel')}
              </button>
              <button
                type="button"
                onClick={() => answerSignIn(true)}
                className="flex-1 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
              >
                {t('miniApps.signIn.confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addAsk ? (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-950 p-5 ring-1 ring-white/10">
            <p className="text-base font-semibold text-white">{t('miniApps.add.title', { name: app.name })}</p>
            <p className="mt-1 font-mono text-xs text-zinc-400">{app.url.host}</p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">{t('miniApps.add.body')}</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => answer(addAsk, () => setAddAsk(null), false)}
                className="flex-1 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
              >
                {t('miniApps.signIn.cancel')}
              </button>
              <button
                type="button"
                onClick={() => answer(addAsk, () => setAddAsk(null), true)}
                className="flex-1 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
              >
                {t('miniApps.add.confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {payAsk ? (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-950 p-5 ring-1 ring-white/10">
            <p className="text-base font-semibold text-white">{t('miniApps.pay.title', { name: app.name })}</p>
            <p className="mt-1 font-mono text-xs text-zinc-400">{app.url.host}</p>
            <p className="mt-4 text-3xl font-bold tabular-nums text-white">{payAsk?.amount.toLocaleString()} DHB</p>
            {payAsk?.memo ? <p className="mt-1 text-sm text-zinc-300">{payAsk.memo}</p> : null}
            <p className="mt-3 text-xs leading-relaxed text-zinc-400">
              {t('miniApps.pay.body', { wallet: `${app.ownerWallet?.slice(0, 6)}…${app.ownerWallet?.slice(-4)}` })}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => answer(payAsk, () => setPayAsk(null), false)}
                className="flex-1 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
              >
                {t('miniApps.signIn.cancel')}
              </button>
              <button
                type="button"
                onClick={() => answer(payAsk, () => setPayAsk(null), true)}
                className="flex-1 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
              >
                {t('miniApps.pay.confirm', { amount: payAsk?.amount.toLocaleString() })}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {composerMounted ? (
        <Suspense fallback={null}>
          <PostModal isOpen={draft !== null} onClose={() => setDraft(null)} initialText={draft ?? undefined} />
        </Suspense>
      ) : null}
    </div>
  );
}

function Unavailable({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-6 text-center">
      <SEOHead title={`${t('miniApps.store.title')} | DeHub`} noindex />
      <AlertTriangle className="h-8 w-8 text-zinc-600" />
      <p className="max-w-sm text-sm text-zinc-400">{message}</p>
      <Link to="/apps" className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black">
        {t('miniApps.host.backToStore')}
      </Link>
    </div>
  );
}

/** `/apps/dev/run?url=` — any URL, clearly marked as a developer preview. */
export function MiniAppDevRunPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const url = parseAppUrl(params.get('url') ?? '', { dev: true });
  if (!url) return <Unavailable message={t('miniApps.host.badUrl')} />;
  return (
    <>
      <SEOHead title={`${t('miniApps.dev.title')} | DeHub`} noindex />
      <MiniAppFrame
        dev
        app={{
          url,
          name: params.get('name')?.slice(0, 32) || url.host,
          iconUrl: null,
          splashBackground: '#0B0B0B',
          badge: 'dev',
          description: null,
        }}
      />
    </>
  );
}

export default function MiniAppPage() {
  const { t } = useTranslation();
  const { slug = '' } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const [listing, setListing] = useState<MiniAppListing | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    setListing(undefined);
    fetchAppBySlug(slug).then((row) => {
      if (live) setListing(row);
    });
    return () => {
      live = false;
    };
  }, [slug]);

  if (listing === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }
  const url = listing ? launchUrl(listing.home_url, searchParams) : null;
  if (!listing || !url) return <Unavailable message={t('miniApps.host.notFound')} />;

  const pageUrl = `https://dehub.io/apps/${listing.slug}`;
  return (
    <>
      <SEOHead
        title={`${listing.name} | ${t('miniApps.store.title')} | DeHub`}
        description={listing.description ?? listing.subtitle ?? undefined}
        url={pageUrl}
        image="https://dehub.io/og/apps.jpg"
        noindex={listing.tier === 'unlisted'}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: listing.name,
          description: listing.description ?? listing.subtitle ?? undefined,
          url: pageUrl,
          image: listing.icon_url ?? undefined,
          applicationCategory: listing.category ?? 'WebApplication',
          operatingSystem: 'Web, Android',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        }}
      />
      <MiniAppFrame
        dev={false}
        app={{
          url,
          slug: listing.slug,
          ownerWallet: listing.owner_wallet,
          name: listing.name,
          iconUrl: listing.icon_url,
          splashBackground: /^#[0-9a-fA-F]{6}$/.test(listing.splash_background_color ?? '')
            ? (listing.splash_background_color as string)
            : '#0B0B0B',
          badge: listing.tier === 'verified' ? 'verified' : listing.tier === 'unlisted' ? 'unreviewed' : null,
          description: listing.description,
        }}
      />
    </>
  );
}
