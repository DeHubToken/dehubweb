import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
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
        ['Nodes online', stats ? String(stats.onlineNodes) : null],
        ['Stored', stats ? formatBytes(stats.totalStoredBytes) : null],
        ['Verified', stats ? formatBytes(stats.totalVerifiedBytes) : null],
      ].map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-white">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-zinc-500" /> : value ?? '—'}
          </p>
          {unavailable && (
            <p className="mt-1 text-xs text-zinc-500">
              {unavailable.reason === 'unconfigured' ? 'Not tracked yet.' : 'Unavailable right now.'}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/** The functional "Become a node" panel: wallet-connect → opt-in → live status. */
function BecomeANodePanel() {
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

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900 p-6 sm:p-8">
      {!isAuthenticated && (
        <div>
          <h3 className="text-xl font-semibold text-white">Become a node</h3>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Connect a wallet to turn this browser tab into a lightweight backup node.
          </p>
          <Button className="mt-6" onClick={() => openLoginModal()}>
            Connect wallet
          </Button>
        </div>
      )}

      {isAuthenticated && !node.optedIn && (
        <div>
          <h3 className="text-xl font-semibold text-white">Become a node</h3>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            This tier runs entirely in your browser using local storage (OPFS). It contributes only
            while this tab stays open — closing it stops your node, and reopening it starts a new one.
            There is no install and nothing runs in the background.
          </p>
          <Button className="mt-6" onClick={() => void node.optIn()}>
            Opt in
          </Button>
        </div>
      )}

      {isAuthenticated && node.optedIn && node.status === 'unsupported' && (
        <div>
          <h3 className="text-xl font-semibold text-white">Not supported in this browser</h3>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            Browser storage nodes need Origin Private File System support, which this browser does not
            offer (this is common on Safari). Try a recent Chrome, Edge or Firefox instead.
          </p>
          <Button variant="outline" className="mt-6" onClick={() => node.optOut()}>
            Dismiss
          </Button>
        </div>
      )}

      {isAuthenticated && node.optedIn && node.status !== 'unsupported' && (
        <div>
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-xl font-semibold text-white">Your node</h3>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  node.status === 'online' ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              {node.status === 'online' ? 'Online' : 'Connecting…'}
            </span>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
                Stored this session
              </dt>
              <dd className="mt-1 text-lg font-semibold text-white">{formatBytes(node.storedBytes)}</dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">Verified bytes</dt>
              <dd className="mt-1 text-lg font-semibold text-white">
                {me ? formatBytes(me.verifiedBytes) : meUnavailable ? 'Not tracked yet' : '—'}
              </dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
                Total stored (ledger)
              </dt>
              <dd className="mt-1 text-lg font-semibold text-white">
                {me ? formatBytes(me.storedBytes) : meUnavailable ? 'Not tracked yet' : '—'}
              </dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
                DHB earned this period
              </dt>
              <dd className="mt-1 text-lg font-semibold text-white">
                {me ? me.dhbEarnedThisPeriod : meUnavailable ? 'Not tracked yet' : '—'}
              </dd>
            </div>
          </dl>

          <Button variant="outline" className="mt-6" onClick={() => node.optOut()}>
            Opt out
          </Button>
        </div>
      )}
    </div>
  );
}

const pageDescription =
  'DeHub DePin lets people contribute storage, bandwidth and compute to help host, transcode and deliver media through a resilient network.';

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

const faqItems = [
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
      'A lightweight, browser-based tier is available today: connect a wallet and opt in on this page, and your open tab becomes a node while it stays open. A heavier, always-on desktop node is a stated future direction — it does not exist yet.',
  },
  {
    question: 'Do I need to install anything for the browser node?',
    answer:
      'No. It runs entirely in the tab using your browser\'s local storage. Closing the tab stops your node; there is no background service and no install.',
  },
];

export default function DePinPage() {
  const reduceMotion = useReducedMotion();

  return (
    <>
      <SEOHead
        title="DePin | Community-Powered Media Infrastructure | DeHub"
        description={pageDescription}
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
              mainEntity: faqItems.map((item) => ({
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
            aria-label="DePin navigation"
            className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
          >
            <Link to="/" aria-label="DeHub home" className="shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
              <img src={dehubLogo} alt="DeHub" className="h-7 w-auto" />
            </Link>

            <div className="hidden items-center gap-7 text-sm font-medium text-zinc-400 md:flex">
              <a href="#how-it-works" className="transition-colors hover:text-white focus-visible:text-white">
                How it works
              </a>
              <a href="#privacy" className="transition-colors hover:text-white focus-visible:text-white">
                Privacy
              </a>
              <a href="#faq" className="transition-colors hover:text-white focus-visible:text-white">
                FAQ
              </a>
            </div>

            <Link
              to="/"
              className="whitespace-nowrap rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-xl transition hover:border-white/40 hover:bg-white/20 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              Open DeHub
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
                  Community-powered infrastructure
                </p>
                <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[0.96] tracking-[-0.055em] text-white sm:text-6xl lg:text-7xl">
                  Your hardware. DeHub's media network.
                </h1>
                <p className="mt-6 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg">
                  Contribute spare storage, bandwidth and compute to help host, transcode and deliver DeHub content.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <a
                    href="#how-it-works"
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    See how it works
                    <ArrowDown aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                  </a>
                  <Link
                    to="/docs/dapps#depin"
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    Read the docs
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
                  alt="A compact edge-compute node connected to homes and creator studios"
                  className="absolute inset-0 h-full w-full object-cover object-center"
                  width={1440}
                  height={960}
                  fetchPriority="high"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/70 via-transparent to-transparent" />
                <figcaption className="absolute bottom-0 left-0 max-w-sm p-5 text-sm leading-6 text-zinc-300 sm:p-7">
                  DeHub keeps the origin copy. Community nodes add resilient replicas and local delivery capacity.
                </figcaption>
              </motion.figure>
            </div>
          </section>

          <section className="border-b border-white/10 bg-zinc-950">
            <div className="mx-auto grid max-w-7xl gap-5 px-4 py-8 sm:px-6 md:grid-cols-[auto_1fr] md:items-center md:gap-8 lg:px-8">
              <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white">
                <Gauge aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                Early access
              </div>
              <p className="max-w-3xl text-sm leading-6 text-zinc-400">
                A lightweight, browser-based node is live below. A heavier, always-on desktop node is a
                stated future direction, not available yet. Participation never guarantees a reward.
              </p>
            </div>
          </section>

          <section className="border-b border-white/10 bg-zinc-950 py-16 sm:py-20">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <Reveal className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-start">
                <div>
                  <SectionHeading
                    title="Run a node from this tab."
                    body="No install, no download. Connect a wallet, opt in, and your open browser tab starts holding a second copy of a few DeHub media objects."
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
                  title="One node, three useful jobs."
                  body="Operators choose their storage, bandwidth and compute limits. DeHub schedules only the work their machine can safely handle."
                />
              </Reveal>

              <div className="mt-14 grid gap-5 lg:grid-cols-12">
                <Reveal className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 lg:col-span-7 lg:row-span-2">
                  <div className="relative min-h-[430px]">
                    <img
                      src={transcodeImage}
                      alt="A home creator workstation contributing spare GPU compute"
                      className="absolute inset-0 h-full w-full object-cover"
                      width={1200}
                      height={800}
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                      <Cpu aria-hidden="true" className="h-7 w-7 text-white" strokeWidth={1.6} />
                      <h3 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">Transcode</h3>
                      <p className="mt-3 max-w-lg text-sm leading-6 text-zinc-300 sm:text-base">
                        Eligible machines turn uploaded video into adaptive renditions. Every output is checked before it can be served.
                      </p>
                    </div>
                  </div>
                </Reveal>

                <Reveal delay={0.08} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-8 lg:col-span-5">
                  <HardDrive aria-hidden="true" className="h-7 w-7 text-white" strokeWidth={1.6} />
                  <h3 className="mt-8 text-2xl font-semibold tracking-[-0.03em]">Host</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-400 sm:text-base">
                    Nodes keep encrypted or content-addressed segments in a capped local cache. DeHub origin storage remains the source of truth.
                  </p>
                </Reveal>

                <Reveal delay={0.14} className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 p-6 sm:p-8 lg:col-span-5">
                  <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:32px_32px]" />
                  <div className="relative">
                    <Radio aria-hidden="true" className="h-7 w-7 text-white" strokeWidth={1.6} />
                    <h3 className="mt-8 text-2xl font-semibold tracking-[-0.03em]">Deliver</h3>
                    <p className="mt-3 text-sm leading-6 text-zinc-400 sm:text-base">
                      Nearby peers share video segments while the normal delivery path stays ready as an automatic fallback.
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
                  title="A network that expects nodes to leave."
                  body="No community machine holds the only copy. Health checks, replicas and origin fallback keep playback available."
                />
              </Reveal>

              <Reveal delay={0.1} className="mt-14 rounded-2xl border border-white/10 bg-zinc-950 p-5 sm:p-8 lg:p-10">
                <figure aria-label="Content delivery fallback path" className="grid gap-4 lg:grid-cols-[1fr_auto_1.35fr_auto_1fr] lg:items-center">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                    <Server aria-hidden="true" className="h-6 w-6" strokeWidth={1.6} />
                    <p className="mt-5 font-semibold">DeHub origin</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">Permanent source copy and fallback delivery</p>
                  </div>

                  <ArrowRight aria-hidden="true" className="mx-auto hidden h-5 w-5 text-zinc-600 lg:block" strokeWidth={1.6} />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-5">
                      <div className="flex items-center justify-between gap-4">
                        <Boxes aria-hidden="true" className="h-6 w-6" strokeWidth={1.6} />
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-300">
                          <Check aria-hidden="true" className="h-3.5 w-3.5" /> Online
                        </span>
                      </div>
                      <p className="mt-5 font-semibold">Available replicas</p>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">Serve verified segments close to demand</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-zinc-500">
                      <WifiOff aria-hidden="true" className="h-6 w-6" strokeWidth={1.6} />
                      <p className="mt-5 font-semibold text-zinc-300">Offline node</p>
                      <p className="mt-2 text-sm leading-6">Removed from routing until it reconnects</p>
                    </div>
                  </div>

                  <ArrowRight aria-hidden="true" className="mx-auto hidden h-5 w-5 text-zinc-600 lg:block" strokeWidth={1.6} />

                  <div className="rounded-2xl border border-white/10 bg-zinc-100 p-5 text-zinc-950">
                    <Network aria-hidden="true" className="h-6 w-6" strokeWidth={1.6} />
                    <p className="mt-5 font-semibold">Viewer</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-600">Uses a peer when available, origin when needed</p>
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
                  Hosts store pieces, not access.
                </h2>
                <p className="mt-5 max-w-lg text-base leading-7 text-zinc-400 sm:text-lg">
                  Protected media stays encrypted on community hardware. Playback keys are issued separately to authorised viewers.
                </p>
              </Reveal>

              <div className="grid gap-5">
                <Reveal className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
                  <ShieldCheck aria-hidden="true" className="h-7 w-7" strokeWidth={1.6} />
                  <h3 className="mt-7 text-xl font-semibold">Protected content</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-400 sm:text-base">
                    Subscriber, private and pay-per-view segments can be stored as ciphertext. Node operators do not receive entitlement keys simply because they host data.
                  </p>
                </Reveal>

                <Reveal delay={0.08} className="rounded-2xl border border-white/10 bg-zinc-900 p-6 sm:p-8">
                  <Radio aria-hidden="true" className="h-7 w-7" strokeWidth={1.6} />
                  <h3 className="mt-7 text-xl font-semibold">Public content</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-400 sm:text-base">
                    Encryption prevents casual inspection of cached files, but public media remains watchable through the public DeHub player. We will not claim otherwise.
                  </p>
                </Reveal>

                <Reveal delay={0.14} className="rounded-2xl border border-white/10 bg-zinc-100 p-6 text-zinc-950 sm:p-8">
                  <HardDrive aria-hidden="true" className="h-7 w-7" strokeWidth={1.6} />
                  <h3 className="mt-7 text-xl font-semibold">Operator controls</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-600 sm:text-base">
                    Operators choose disk limits, bandwidth limits, working hours and eligible public content categories. Removal notices trigger cache purges.
                  </p>
                </Reveal>
              </div>
            </div>
          </section>

          <section className="border-y border-white/10 bg-zinc-900/50 py-24 sm:py-32">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <Reveal>
                <SectionHeading
                  title="Useful work is verified. Rewards stay variable."
                  body="Contribution is measured through signed receipts, health checks and output validation. Storage alone does not create a reward."
                />
              </Reveal>

              <div className="mt-14 grid gap-x-10 gap-y-8 sm:grid-cols-2">
                {[
                  [Radio, 'Delivery receipts', 'Verified bytes served to real playback sessions.'],
                  [Gauge, 'Availability', 'Successful retrieval checks and reliable service when assigned.'],
                  [Cpu, 'Valid output', 'Transcodes must pass technical and sampled quality checks.'],
                  [CircleDollarSign, 'Revenue-funded pool', 'If activated, a reward budget would be set from platform revenue after the epoch closes.'],
                ].map(([Icon, title, copy]) => {
                  const ItemIcon = Icon as typeof Radio;
                  return (
                    <Reveal key={title as string} className="grid grid-cols-[auto_1fr] gap-4 border-t border-white/10 pt-6">
                      <ItemIcon aria-hidden="true" className="mt-1 h-6 w-6" strokeWidth={1.6} />
                      <div>
                        <h3 className="font-semibold text-white">{title as string}</h3>
                        <p className="mt-2 text-sm leading-6 text-zinc-400">{copy as string}</p>
                      </div>
                    </Reveal>
                  );
                })}
              </div>

              <Reveal delay={0.1} className="mt-12 rounded-2xl border border-white/10 bg-zinc-950 p-6 sm:p-8">
                <p className="max-w-4xl text-base leading-7 text-zinc-300">
                  There is no fixed rate, minimum return, APY or forward estimate. Contribution records are accounting inputs only, not a promise of payment. Any future DHB settlement would occur on Base and remain subject to eligibility, network rules and applicable law.
                </p>
                <p className="mt-4 max-w-4xl text-sm leading-6 text-zinc-500">
                  Running a node uses electricity, internet data and hardware life. Operators may receive nothing, and their costs may exceed any reward.
                </p>
              </Reveal>
            </div>
          </section>

          <section className="bg-zinc-950 py-24 sm:py-32">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <Reveal>
                <SectionHeading
                  title="Built from the safest workload outward."
                  body="DePin supplements DeHub's existing delivery path first. More demanding workloads follow only after verification is proven."
                />
              </Reveal>

              <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Delivery', 'Peer-assisted live and video delivery with automatic fallback.'],
                  ['Adaptive video', 'Multiple renditions for reliable playback across connection speeds.'],
                  ['Desktop nodes', 'Capped storage, bandwidth controls and verified availability.'],
                  ['Base settlement', 'Revenue-funded claims only after operational and legal review.'],
                ].map(([title, copy]) => (
                  <Reveal key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
                    <h3 className="text-lg font-semibold">{title}</h3>
                    <p className="mt-4 text-sm leading-6 text-zinc-400">{copy}</p>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          <section id="faq" className="scroll-mt-24 border-y border-white/10 bg-zinc-900/50 py-24 sm:py-32">
            <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
              <Reveal>
                <h2 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl lg:text-5xl">Questions, answered plainly.</h2>
              </Reveal>

              <div className="mt-12 space-y-3">
                {faqItems.map((item) => (
                  <Reveal key={item.question}>
                    <details className="group rounded-2xl border border-white/10 bg-zinc-950 open:border-white/20">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-6 p-5 font-semibold marker:content-none sm:p-6">
                        {item.question}
                        <span aria-hidden="true" className="text-xl font-normal text-zinc-500 transition-transform group-open:rotate-45">+</span>
                      </summary>
                      <p className="max-w-3xl px-5 pb-5 text-sm leading-6 text-zinc-400 sm:px-6 sm:pb-6 sm:text-base">
                        {item.answer}
                      </p>
                    </details>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          <section className="bg-zinc-950 py-24 sm:py-32">
            <Reveal className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
              <h2 className="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl lg:text-6xl">
                Launch only when failure is safe.
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
                Origin fallback, encrypted protected media and verified work come before public node rewards.
              </p>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  to="/"
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  Open DeHub
                  <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                </Link>
                <Link
                  to="/docs/dapps#depin"
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  Read the docs
                </Link>
              </div>
            </Reveal>
          </section>
        </main>

        <footer className="border-t border-white/10 bg-zinc-950">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 text-sm text-zinc-500 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
            <img src={dehubLogo} alt="DeHub" className="h-6 w-auto self-start opacity-80" loading="lazy" />
            <p className="max-w-2xl md:text-right">
              DePin participation is a contribution service, not an investment product. Availability, eligibility and rewards may change.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
