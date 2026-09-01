import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowRight,
  Boxes,
  Check,
  CircleDollarSign,
  Cpu,
  Gauge,
  HardDrive,
  Loader2,
  LockKeyhole,
  Network,
  Radio,
  Server,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useDepinNode } from '@/lib/depin-node';
import { getDepinStats, getDepinMe, type DepinStatsResponse, type DepinMeResponse } from '@/lib/api/dehub/depin';
import dehubLogo from '@/assets/dehub-logo-white.png';
import edgeNetworkImage from '@/assets/depin-edge-network.webp';
import transcodeImage from '@/assets/depin-transcode-workstation.webp';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 100 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

function isUnavailable(payload: unknown): payload is { ok: false; reason: string } {
  return !!payload && typeof payload === 'object' && (payload as { ok?: unknown }).ok === false;
}

/** Public network stats strip — shown to everyone, wallet or not. */
function DepinStatsStrip() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery<DepinStatsResponse>({
    queryKey: ['depin-stats'],
    queryFn: getDepinStats,
    refetchInterval: 60_000,
    staleTime: 45_000,
    retry: 1,
  });

  const stats = data && !isUnavailable(data) ? data : null;
  const unavailable = data && isUnavailable(data) ? data : null;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {[
        ['statNodesOnline', stats ? String(stats.onlineNodes) : null],
        ['statStored', stats ? formatBytes(stats.totalStoredBytes) : null],
        ['statVerified', stats ? formatBytes(stats.totalVerifiedBytes) : null],
      ].map(([labelKey, value]) => (
        <div key={labelKey} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{t(`depin.${labelKey}`)}</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-white">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-zinc-500" /> : value ?? '—'}
          </p>
          {unavailable && (
            <p className="mt-1 text-xs text-zinc-500">
              {unavailable.reason === 'unconfigured' ? t('depin.statNotTracked') : t('depin.statUnavailable')}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/** The functional "Become a node" panel: wallet-connect → opt-in → live status. */
function BecomeANodePanel() {
  const { t } = useTranslation();
  const { walletAddress, isAuthenticated, openLoginModal } = useAuth();
  const node = useDepinNode(walletAddress);
  const [meResponse, setMeResponse] = useState<DepinMeResponse | null>(null);

  const { data: meData } = useQuery<DepinMeResponse>({
    queryKey: ['depin-me', walletAddress],
    queryFn: getDepinMe,
    enabled: isAuthenticated && node.optedIn,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (meData) setMeResponse(meData);
  }, [meData]);

  const me = meResponse && !isUnavailable(meResponse) ? meResponse : null;
  const meUnavailable = meResponse && isUnavailable(meResponse) ? meResponse : null;

  /** Every ledger figure falls back the same way, so the shape lives in one place. */
  const ledger = (value: string | number | null) =>
    me ? value : meUnavailable ? t('depin.notTrackedYet') : '—';

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900 p-6 sm:p-8">
      {!isAuthenticated && (
        <div>
          <h3 className="text-xl font-semibold text-white">{t('depin.becomeANode')}</h3>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            {t('depin.signInBlurb')}
          </p>
          <Button className="mt-6" onClick={() => openLoginModal()}>
            {t('depin.signIn')}
          </Button>
        </div>
      )}

      {isAuthenticated && !node.optedIn && node.status !== 'unsupported' && (
        <div>
          <h3 className="text-xl font-semibold text-white">{t('depin.becomeANode')}</h3>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            {t('depin.optInBlurb')}
          </p>
          <Button className="mt-6" onClick={() => void node.optIn()}>
            {t('depin.optIn')}
          </Button>
        </div>
      )}

      {isAuthenticated && node.status === 'unsupported' && (
        <div>
          <h3 className="text-xl font-semibold text-white">{t('depin.unsupportedTitle')}</h3>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            {t('depin.unsupportedBlurb')}
          </p>
          <Button variant="outline" className="mt-6" onClick={() => node.optOut()}>
            {t('depin.dismiss')}
          </Button>
        </div>
      )}

      {isAuthenticated && node.status === 'rejected' && (
        <div>
          <h3 className="text-xl font-semibold text-white">{t('depin.rejectedTitle')}</h3>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            {t('depin.rejectedBlurb')}
          </p>
          <div className="mt-6 flex gap-3">
            <Button onClick={() => openLoginModal()}>{t('depin.signInAgain')}</Button>
            <Button variant="outline" onClick={() => node.optOut()}>
              {t('depin.dismiss')}
            </Button>
          </div>
        </div>
      )}

      {isAuthenticated && node.optedIn && node.status !== 'unsupported' && node.status !== 'rejected' && (
        <div>
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-xl font-semibold text-white">{t('depin.yourNode')}</h3>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  node.status === 'online' ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              {node.status === 'online' ? t('depin.online') : t('depin.connecting')}
            </span>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
                {t('depin.storedThisSession')}
              </dt>
              <dd className="mt-1 text-lg font-semibold text-white">{formatBytes(node.storedBytes)}</dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">{t('depin.verifiedBytes')}</dt>
              <dd className="mt-1 text-lg font-semibold text-white">
                {ledger(me ? formatBytes(me.verifiedBytes) : null)}
              </dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
                {t('depin.totalStoredLedger')}
              </dt>
              <dd className="mt-1 text-lg font-semibold text-white">
                {ledger(me ? formatBytes(me.storedBytes) : null)}
              </dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
                {t('depin.dhbEarnedThisPeriod')}
              </dt>
              <dd className="mt-1 text-lg font-semibold text-white">
                {ledger(me ? me.dhbEarnedThisPeriod : null)}
              </dd>
            </div>
          </dl>

          <Button variant="outline" className="mt-6" onClick={() => node.optOut()}>
            {t('depin.optOut')}
          </Button>
        </div>
      )}
    </div>
  );
}

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

function SectionHeading({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="max-w-3xl">
      <h2 className="text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
        {body}
      </p>
    </div>
  );
}

const FAQ_KEYS = ['offline', 'canOperatorSee', 'howMuch', 'softwareAvailable', 'installNeeded'];

/**
 * Structured data describes the page to crawlers, which are served English.
 * It is deliberately a literal rather than a lookup: locale bundles load
 * lazily, so reading the English catalogue at render time would emit raw keys
 * whenever a visitor arrives in another language.
 */
const pageDescription =
  'DeHub DePin lets people contribute storage, bandwidth and compute to help host, transcode and deliver media through a resilient network.';

const faqSchema = [
  {
    question: 'What happens when a hosting node goes offline?',
    answer:
      'The coordinator removes it from active routing. Another replica serves the segment, or playback falls back to DeHub origin storage while replacement copies are scheduled.',
  },
  {
    question: 'Can a node operator see the content they host?',
    answer:
      'Protected content is stored as encrypted segments and the host does not receive playback keys. Public content remains publicly viewable through DeHub by design.',
  },
  {
    question: 'How much will a node operator receive?',
    answer:
      'There is no fixed rate or forecast. Verified contribution may receive a share of a revenue-funded reward pool after an epoch closes. Rewards are not guaranteed, and electricity, bandwidth and hardware costs may exceed any reward.',
  },
  {
    question: 'Is the node software available now?',
    answer:
      'A lightweight, browser-based tier is available today: sign in and opt in on this page, and your open tab becomes a node while it stays open. A heavier, always-on desktop node is a stated future direction — it does not exist yet.',
  },
  {
    question: 'Do I need to install anything for the browser node?',
    answer:
      'No. It runs entirely in the tab using your browser\'s local storage. Closing the tab stops your node; there is no background service and no install.',
  },
];

const VERIFICATION_ITEMS = [
  [Radio, 'deliveryReceipts'],
  [Gauge, 'availability'],
  [Cpu, 'validOutput'],
  [CircleDollarSign, 'revenuePool'],
] as const;

const ROADMAP_KEYS = ['delivery', 'adaptiveVideo', 'desktopNodes', 'baseSettlement'];

export default function DePinPage() {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();

  return (
    <>
      <SEOHead
        title={t('depin.seoTitle')}
        description={t('depin.seoDescription')}
        image="https://dehub.io/og/depin.jpg"
        url="https://dehub.io/depin"
        jsonLd={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'WebPage',
              name: 'DeHub DePin',
              url: 'https://dehub.io/depin',
              description: pageDescription,
              isPartOf: {
                '@type': 'WebSite',
                name: 'DeHub',
                url: 'https://dehub.io',
              },
            },
            {
              '@type': 'FAQPage',
              mainEntity: faqSchema.map((item) => ({
                '@type': 'Question',
                name: item.question,
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: item.answer,
                },
              })),
            },
          ],
        }}
      />

      <div data-glass-page className="min-h-[100dvh] overflow-x-clip bg-zinc-950 text-white">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-zinc-950/85 backdrop-blur-xl">
          <nav
            aria-label={t('depin.navAria')}
            className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
          >
            <Link to="/" aria-label={t('depin.dehubHome')} className="shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
              <img src={dehubLogo} alt="DeHub" className="h-7 w-auto" />
            </Link>

            <div className="hidden items-center gap-7 text-sm font-medium text-zinc-400 md:flex">
              <a href="#how-it-works" className="transition-colors hover:text-white focus-visible:text-white">
                {t('depin.navHowItWorks')}
              </a>
              <a href="#privacy" className="transition-colors hover:text-white focus-visible:text-white">
                {t('depin.navPrivacy')}
              </a>
              <a href="#faq" className="transition-colors hover:text-white focus-visible:text-white">
                {t('depin.navFaq')}
              </a>
            </div>

            <Link
              to="/"
              className="whitespace-nowrap rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-xl transition hover:border-white/40 hover:bg-white/20 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              {t('depin.openDehub')}
            </Link>
          </nav>
        </header>

        <main>
          <section className="relative isolate overflow-hidden border-b border-white/10">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.08),transparent_35%)]" />
            <div className="relative mx-auto grid min-h-[calc(100dvh-72px)] max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-16">
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, x: -28 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10 max-w-2xl"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  {t('depin.heroEyebrow')}
                </p>
                <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[0.96] tracking-[-0.055em] text-white sm:text-6xl lg:text-7xl">
                  {t('depin.heroTitle')}
                </h1>
                <p className="mt-6 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg">
                  {t('depin.heroBlurb')}
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <a
                    href="#how-it-works"
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    {t('depin.seeHowItWorks')}
                    <ArrowDown aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                  </a>
                  <Link
                    to="/docs/dapps#depin"
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    {t('depin.readTheDocs')}
                    <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                  </Link>
                </div>
              </motion.div>

              <motion.figure
                initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
                className="relative min-h-[360px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:min-h-[480px] lg:min-h-[620px]"
              >
                <img
                  src={edgeNetworkImage}
                  alt={t('depin.heroImageAlt')}
                  className="absolute inset-0 h-full w-full object-cover object-center"
                  width={1440}
                  height={960}
                  fetchPriority="high"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/70 via-transparent to-transparent" />
                <figcaption className="absolute bottom-0 left-0 max-w-sm p-5 text-sm leading-6 text-zinc-300 sm:p-7">
                  {t('depin.heroCaption')}
                </figcaption>
              </motion.figure>
            </div>
          </section>

          <section className="border-b border-white/10 bg-zinc-950">
            <div className="mx-auto grid max-w-7xl gap-5 px-4 py-8 sm:px-6 md:grid-cols-[auto_1fr] md:items-center md:gap-8 lg:px-8">
              <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white">
                <Gauge aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                {t('depin.earlyAccess')}
              </div>
              <p className="max-w-3xl text-sm leading-6 text-zinc-400">
                {t('depin.earlyAccessBody')}
              </p>
            </div>
          </section>

          <section className="border-b border-white/10 bg-zinc-950 py-16 sm:py-20">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <Reveal className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-start">
                <div>
                  <SectionHeading
                    title={t('depin.runFromTabTitle')}
                    body={t('depin.runFromTabBody')}
                  />
                  <div className="mt-10">
                    <DepinStatsStrip />
                  </div>
                </div>
                <BecomeANodePanel />
              </Reveal>
            </div>
          </section>

          <section id="how-it-works" className="scroll-mt-24 bg-zinc-950 py-24 sm:py-32">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <Reveal>
                <SectionHeading
                  title={t('depin.threeJobsTitle')}
                  body={t('depin.threeJobsBody')}
                />
              </Reveal>

              <div className="mt-14 grid gap-5 lg:grid-cols-12">
                <Reveal className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 lg:col-span-7 lg:row-span-2">
                  <div className="relative min-h-[430px]">
                    <img
                      src={transcodeImage}
                      alt={t('depin.transcodeImageAlt')}
                      className="absolute inset-0 h-full w-full object-cover"
                      width={1200}
                      height={800}
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                      <Cpu aria-hidden="true" className="h-7 w-7 text-white" strokeWidth={1.6} />
                      <h3 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">{t('depin.transcode')}</h3>
                      <p className="mt-3 max-w-lg text-sm leading-6 text-zinc-300 sm:text-base">
                        {t('depin.transcodeBody')}
                      </p>
                    </div>
                  </div>
                </Reveal>

                <Reveal delay={0.08} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-8 lg:col-span-5">
                  <HardDrive aria-hidden="true" className="h-7 w-7 text-white" strokeWidth={1.6} />
                  <h3 className="mt-8 text-2xl font-semibold tracking-[-0.03em]">{t('depin.host')}</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-400 sm:text-base">
                    {t('depin.hostBody')}
                  </p>
                </Reveal>

                <Reveal delay={0.14} className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 p-6 sm:p-8 lg:col-span-5">
                  <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:32px_32px]" />
                  <div className="relative">
                    <Radio aria-hidden="true" className="h-7 w-7 text-white" strokeWidth={1.6} />
                    <h3 className="mt-8 text-2xl font-semibold tracking-[-0.03em]">{t('depin.deliver')}</h3>
                    <p className="mt-3 text-sm leading-6 text-zinc-400 sm:text-base">
                      {t('depin.deliverBody')}
                    </p>
                  </div>
                </Reveal>
              </div>
            </div>
          </section>

          <section className="border-y border-white/10 bg-zinc-900/50 py-24 sm:py-32">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <Reveal>
                <SectionHeading
                  title={t('depin.nodesLeaveTitle')}
                  body={t('depin.nodesLeaveBody')}
                />
              </Reveal>

              <Reveal delay={0.1} className="mt-14 rounded-2xl border border-white/10 bg-zinc-950 p-5 sm:p-8 lg:p-10">
                <figure aria-label={t('depin.fallbackFigureAria')} className="grid gap-4 lg:grid-cols-[1fr_auto_1.35fr_auto_1fr] lg:items-center">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                    <Server aria-hidden="true" className="h-6 w-6" strokeWidth={1.6} />
                    <p className="mt-5 font-semibold">{t('depin.origin')}</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{t('depin.originBody')}</p>
                  </div>

                  <ArrowRight aria-hidden="true" className="mx-auto hidden h-5 w-5 text-zinc-600 lg:block" strokeWidth={1.6} />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-5">
                      <div className="flex items-center justify-between gap-4">
                        <Boxes aria-hidden="true" className="h-6 w-6" strokeWidth={1.6} />
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-300">
                          <Check aria-hidden="true" className="h-3.5 w-3.5" /> {t('depin.online')}
                        </span>
                      </div>
                      <p className="mt-5 font-semibold">{t('depin.availableReplicas')}</p>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">{t('depin.availableReplicasBody')}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-zinc-500">
                      <WifiOff aria-hidden="true" className="h-6 w-6" strokeWidth={1.6} />
                      <p className="mt-5 font-semibold text-zinc-300">{t('depin.offlineNode')}</p>
                      <p className="mt-2 text-sm leading-6">{t('depin.offlineNodeBody')}</p>
                    </div>
                  </div>

                  <ArrowRight aria-hidden="true" className="mx-auto hidden h-5 w-5 text-zinc-600 lg:block" strokeWidth={1.6} />

                  <div className="rounded-2xl border border-white/10 bg-zinc-100 p-5 text-zinc-950">
                    <Network aria-hidden="true" className="h-6 w-6" strokeWidth={1.6} />
                    <p className="mt-5 font-semibold">{t('depin.viewer')}</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-600">{t('depin.viewerBody')}</p>
                  </div>
                </figure>
              </Reveal>
            </div>
          </section>

          <section id="privacy" className="scroll-mt-24 bg-zinc-950 py-24 sm:py-32">
            <div className="mx-auto grid max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start lg:px-8">
              <Reveal className="lg:sticky lg:top-28">
                <LockKeyhole aria-hidden="true" className="h-8 w-8" strokeWidth={1.5} />
                <h2 className="mt-8 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl lg:text-5xl">
                  {t('depin.privacyTitle')}
                </h2>
                <p className="mt-5 max-w-lg text-base leading-7 text-zinc-400 sm:text-lg">
                  {t('depin.privacyBody')}
                </p>
              </Reveal>

              <div className="grid gap-5">
                <Reveal className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
                  <ShieldCheck aria-hidden="true" className="h-7 w-7" strokeWidth={1.6} />
                  <h3 className="mt-7 text-xl font-semibold">{t('depin.protectedContent')}</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-400 sm:text-base">
                    {t('depin.protectedContentBody')}
                  </p>
                </Reveal>

                <Reveal delay={0.08} className="rounded-2xl border border-white/10 bg-zinc-900 p-6 sm:p-8">
                  <Radio aria-hidden="true" className="h-7 w-7" strokeWidth={1.6} />
                  <h3 className="mt-7 text-xl font-semibold">{t('depin.publicContent')}</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-400 sm:text-base">
                    {t('depin.publicContentBody')}
                  </p>
                </Reveal>

                <Reveal delay={0.14} className="rounded-2xl border border-white/10 bg-zinc-100 p-6 text-zinc-950 sm:p-8">
                  <HardDrive aria-hidden="true" className="h-7 w-7" strokeWidth={1.6} />
                  <h3 className="mt-7 text-xl font-semibold">{t('depin.operatorControls')}</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-600 sm:text-base">
                    {t('depin.operatorControlsBody')}
                  </p>
                </Reveal>
              </div>
            </div>
          </section>

          <section className="border-y border-white/10 bg-zinc-900/50 py-24 sm:py-32">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <Reveal>
                <SectionHeading
                  title={t('depin.verifiedWorkTitle')}
                  body={t('depin.verifiedWorkBody')}
                />
              </Reveal>

              <div className="mt-14 grid gap-x-10 gap-y-8 sm:grid-cols-2">
                {VERIFICATION_ITEMS.map(([ItemIcon, key]) => (
                  <Reveal key={key} className="grid grid-cols-[auto_1fr] gap-4 border-t border-white/10 pt-6">
                    <ItemIcon aria-hidden="true" className="mt-1 h-6 w-6" strokeWidth={1.6} />
                    <div>
                      <h3 className="font-semibold text-white">{t(`depin.${key}`)}</h3>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">{t(`depin.${key}Body`)}</p>
                    </div>
                  </Reveal>
                ))}
              </div>

              <Reveal delay={0.1} className="mt-12 rounded-2xl border border-white/10 bg-zinc-950 p-6 sm:p-8">
                <p className="max-w-4xl text-base leading-7 text-zinc-300">
                  {t('depin.noFixedRate')}
                </p>
                <p className="mt-4 max-w-4xl text-sm leading-6 text-zinc-500">
                  {t('depin.runningCosts')}
                </p>
              </Reveal>
            </div>
          </section>

          <section className="bg-zinc-950 py-24 sm:py-32">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <Reveal>
                <SectionHeading
                  title={t('depin.safestWorkloadTitle')}
                  body={t('depin.safestWorkloadBody')}
                />
              </Reveal>

              <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                {ROADMAP_KEYS.map((key) => (
                  <Reveal key={key} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
                    <h3 className="text-lg font-semibold">{t(`depin.${key}`)}</h3>
                    <p className="mt-4 text-sm leading-6 text-zinc-400">{t(`depin.${key}Body`)}</p>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          <section id="faq" className="scroll-mt-24 border-y border-white/10 bg-zinc-900/50 py-24 sm:py-32">
            <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
              <Reveal>
                <h2 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl lg:text-5xl">{t('depin.faqHeading')}</h2>
              </Reveal>

              <div className="mt-12 space-y-3">
                {FAQ_KEYS.map((key) => {
                  const stem = `depin.faq${key[0].toUpperCase()}${key.slice(1)}`;
                  return (
                    <Reveal key={key}>
                      <details className="group rounded-2xl border border-white/10 bg-zinc-950 open:border-white/20">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-6 p-5 font-semibold marker:content-none sm:p-6">
                          {t(`${stem}Q`)}
                          <span aria-hidden="true" className="text-xl font-normal text-zinc-500 transition-transform group-open:rotate-45">+</span>
                        </summary>
                        <p className="max-w-3xl px-5 pb-5 text-sm leading-6 text-zinc-400 sm:px-6 sm:pb-6 sm:text-base">
                          {t(`${stem}A`)}
                        </p>
                      </details>
                    </Reveal>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="bg-zinc-950 py-24 sm:py-32">
            <Reveal className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
              <h2 className="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl lg:text-6xl">
                {t('depin.ctaTitle')}
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
                {t('depin.ctaBody')}
              </p>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  to="/"
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  {t('depin.openDehub')}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                </Link>
                <Link
                  to="/docs/dapps#depin"
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  {t('depin.readTheDocs')}
                </Link>
              </div>
            </Reveal>
          </section>
        </main>

        <footer className="border-t border-white/10 bg-zinc-950">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 text-sm text-zinc-500 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
            <img src={dehubLogo} alt="DeHub" className="h-6 w-auto self-start opacity-80" loading="lazy" />
            <p className="max-w-2xl md:text-right">
              {t('depin.footerNote')}
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
