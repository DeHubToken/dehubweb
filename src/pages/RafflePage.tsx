/**
 * Prize Draws landing — /raffle
 * =============================
 * The successor page for the retired dehub.net/prize-draw and
 * raffle.dehub.net, both of which the SEO worker now 301s here. It is a
 * marketing landing page in the /depin idiom: standalone chrome, no app
 * dependencies, no wallet, so it renders for a cold crawler as happily as for
 * a signed-in user.
 *
 * Nothing on this page reads live draw state on purpose. A landing page that
 * promises "1 draw live now" and renders a zero is worse than one that
 * explains the mechanism and points at the app, and the app is the only place
 * that actually knows.
 */
import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowDown,
  ArrowRight,
  Boxes,
  Coins,
  Dice5,
  Gamepad2,
  Mic,
  PenLine,
  ScrollText,
  ShieldCheck,
  Ticket,
  Timer,
  Trophy,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import dehubLogo from '@/assets/dehub-logo-white.png';

const pageDescription =
  'DeHub prize draws hand out DHB, hardware and NFT prizes to the community. Entries are earned by taking part, and every winner is drawn on-chain.';

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

function SectionHeading({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-3xl">
      <h2 className="text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">{body}</p>
    </div>
  );
}

const steps = [
  {
    icon: ScrollText,
    title: 'A draw is announced',
    body: 'Every draw opens with its prize, its closing time and the exact ways to earn an entry, posted in the app and pinned to the feed.',
  },
  {
    icon: Ticket,
    title: 'You collect entries',
    body: 'Entries are earned by doing things you already do on DeHub. The announcement lists which actions count for that draw and how many entries each is worth.',
  },
  {
    icon: Dice5,
    title: 'The draw is run',
    body: 'At the closing time the entry list is snapshotted and the winning index is drawn from an on-chain source of randomness — not from a spreadsheet.',
  },
  {
    icon: Trophy,
    title: 'The result is published',
    body: 'The snapshot, the transaction and the winning entry all go up together, so anyone can re-check the result rather than take our word for it.',
  },
];

const entryRoutes = [
  { icon: PenLine, title: 'Post and engage', body: 'Original posts, videos and comments count towards draws that name them.' },
  { icon: Coins, title: 'Stake DHB', body: 'An open staking position earns entries for the draws that weight it.', to: '/stake' },
  { icon: Gamepad2, title: 'Play the arcade', body: 'Arcade sessions and leaderboard placings feed draws built around games.', to: '/arcade' },
  { icon: Mic, title: 'Join a stage', body: 'Turning up to live audio stages counts, whether you speak or listen.', to: '/stages' },
  { icon: Ticket, title: 'Buy a ticket', body: 'Some draws also sell a DHB ticket. Where they do, the price and the per-wallet cap are published up front.' },
  { icon: Boxes, title: 'Hold a collectible', body: 'Selected NFT collections carry standing entries into draws that name them.' },
];

const fairness = [
  {
    icon: Timer,
    title: 'The list is frozen first',
    body: 'The entry list is snapshotted at the stated closing time and published before the draw runs. Nothing can be added to it afterwards, including by us.',
  },
  {
    icon: Dice5,
    title: 'Randomness comes from the chain',
    body: 'The winning index is derived on-chain, so the number that decides the draw exists in a public transaction rather than in an internal tool.',
  },
  {
    icon: ShieldCheck,
    title: 'The whole result is checkable',
    body: 'Snapshot, transaction hash and winning entry are published as one set. Re-running the arithmetic from public data has to reach the same winner.',
  },
];

const faqItems = [
  {
    question: 'Do I have to buy anything to enter a DeHub prize draw?',
    answer:
      'No. Every draw carries at least one free entry route, earned by taking part on DeHub. Some draws additionally sell a DHB ticket, but a ticket is never the only way in.',
  },
  {
    question: 'How do I know the draw was not fixed?',
    answer:
      'The entry list is snapshotted and published before the draw runs, and the winning index is drawn from an on-chain source of randomness. The snapshot, the transaction and the winning entry are published together so the result can be recomputed by anyone.',
  },
  {
    question: 'How are winners notified?',
    answer:
      'Winners are notified in the app and named in the result post. There is no email asking for a payment, a seed phrase or a wallet signature — DeHub will never ask for any of those to release a prize.',
  },
  {
    question: 'How long do I have to claim?',
    answer:
      'Fourteen days from the result being published. Token prizes settle to the winner’s DeHub wallet on Base. Physical prizes are arranged directly with the team, and shipping is covered where we can legally ship.',
  },
  {
    question: 'Who is eligible?',
    answer:
      'Anyone with a DeHub account who is over 18 and lives somewhere the draw is lawful. DeHub staff, contractors and their households are not eligible, and draws are void where local law prohibits them.',
  },
  {
    question: 'How often do draws run?',
    answer:
      'There is no fixed schedule. Draws are tied to launches, milestones and partner campaigns, and each is announced in the app when it opens.',
  },
];

export default function RafflePage() {
  const reduceMotion = useReducedMotion();

  return (
    <>
      <SEOHead
        title="Prize Draws — Win DHB, Hardware and NFTs on DeHub"
        description={pageDescription}
        image="https://dehub.io/og/raffle.jpg"
        url="https://dehub.io/raffle"
        jsonLd={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'WebPage',
              name: 'DeHub Prize Draws',
              url: 'https://dehub.io/raffle',
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
            aria-label="Prize draws navigation"
            className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
          >
            <Link to="/" aria-label="DeHub home" className="shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
              <img src={dehubLogo} alt="DeHub" className="h-7 w-auto" />
            </Link>

            <div className="hidden items-center gap-7 text-sm font-medium text-zinc-400 md:flex">
              <a href="#how-it-works" className="transition-colors hover:text-white focus-visible:text-white">
                How it works
              </a>
              <a href="#entries" className="transition-colors hover:text-white focus-visible:text-white">
                Entries
              </a>
              <a href="#fairness" className="transition-colors hover:text-white focus-visible:text-white">
                Fairness
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
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(255,255,255,0.09),transparent_38%)]" />
            <div className="relative mx-auto grid min-h-[calc(100dvh-72px)] max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-16">
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, x: -28 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10 max-w-2xl"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Community prize draws
                </p>
                <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[0.96] tracking-[-0.055em] text-white sm:text-6xl lg:text-7xl">
                  Every draw, settled on-chain.
                </h1>
                <p className="mt-6 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg">
                  DeHub prize draws hand out DHB, hardware and collectibles to the people already
                  using the platform. Entries are earned by taking part, the entry list is published
                  before the draw runs, and the winner is picked by a transaction anyone can read.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <a
                    href="#how-it-works"
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    See how a draw works
                    <ArrowDown aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                  </a>
                  <Link
                    to="/"
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    Find the live draw in the app
                    <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                  </Link>
                </div>
                <p className="mt-6 max-w-xl text-sm leading-6 text-zinc-500">
                  No purchase is necessary. Every draw carries a free entry route, and where a DHB
                  ticket is offered it is never the only way in.
                </p>
              </motion.div>

              <motion.div
                initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="relative"
              >
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl sm:p-8">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Anatomy of a draw
                  </p>
                  <dl className="mt-6 space-y-5">
                    {[
                      ['Prize', 'Stated when the draw opens. Never changed afterwards.'],
                      ['Entry routes', 'Listed in full, with the weight each one carries.'],
                      ['Closing time', 'A fixed timestamp, not "when we get round to it".'],
                      ['Snapshot', 'Published before the draw is run.'],
                      ['Randomness', 'Drawn on-chain, in a transaction you can open.'],
                      ['Claim window', '14 days from the published result.'],
                    ].map(([term, detail]) => (
                      <div key={term} className="border-b border-white/10 pb-5 last:border-b-0 last:pb-0">
                        <dt className="text-sm font-semibold text-white">{term}</dt>
                        <dd className="mt-1 text-sm leading-6 text-zinc-400">{detail}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </motion.div>
            </div>
          </section>

          <section id="how-it-works" className="border-b border-white/10 py-20 sm:py-24 lg:py-28">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <Reveal>
                <SectionHeading
                  title="How a draw works"
                  body="Four steps, in the same order, every time. The parts that decide who wins happen in public."
                />
              </Reveal>
              <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {steps.map((step, i) => (
                  <Reveal key={step.title} delay={i * 0.06}>
                    <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                      <step.icon aria-hidden="true" className="h-6 w-6 text-white" strokeWidth={1.6} />
                      <h3 className="mt-5 text-lg font-semibold tracking-[-0.02em] text-white">
                        {step.title}
                      </h3>
                      <p className="mt-3 text-sm leading-6 text-zinc-400">{step.body}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          <section id="entries" className="border-b border-white/10 py-20 sm:py-24 lg:py-28">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <Reveal>
                <SectionHeading
                  title="Entries are earned, not bought"
                  body="Draws are weighted towards people who use DeHub. Each announcement names the routes that count for it — these are the ones draws are usually built from."
                />
              </Reveal>
              <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {entryRoutes.map((route, i) => (
                  <Reveal key={route.title} delay={i * 0.05}>
                    <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                      <route.icon aria-hidden="true" className="h-6 w-6 text-white" strokeWidth={1.6} />
                      <h3 className="mt-5 text-lg font-semibold tracking-[-0.02em] text-white">
                        {route.title}
                      </h3>
                      <p className="mt-3 text-sm leading-6 text-zinc-400">{route.body}</p>
                      {route.to && (
                        <Link
                          to={route.to}
                          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-white transition hover:text-zinc-300"
                        >
                          Open
                          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
                        </Link>
                      )}
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          <section id="fairness" className="border-b border-white/10 py-20 sm:py-24 lg:py-28">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <Reveal>
                <SectionHeading
                  title="Why the result can be trusted"
                  body="A raffle is only worth entering if the operator cannot quietly pick the winner. Three things make that true here."
                />
              </Reveal>
              <div className="mt-12 grid gap-5 lg:grid-cols-3">
                {fairness.map((item, i) => (
                  <Reveal key={item.title} delay={i * 0.06}>
                    <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                      <item.icon aria-hidden="true" className="h-6 w-6 text-white" strokeWidth={1.6} />
                      <h3 className="mt-5 text-lg font-semibold tracking-[-0.02em] text-white">
                        {item.title}
                      </h3>
                      <p className="mt-3 text-sm leading-6 text-zinc-400">{item.body}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
              <Reveal delay={0.1}>
                <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
                  <h3 className="text-lg font-semibold tracking-[-0.02em] text-white">
                    DeHub will never ask you to pay to release a prize
                  </h3>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                    Winners are named in the app and in the public result post. Nobody from DeHub will
                    contact you for a fee, a seed phrase, a private key or a wallet signature to hand
                    over a prize. Any message that does is an impersonation — report it and delete it.
                  </p>
                </div>
              </Reveal>
            </div>
          </section>

          <section id="faq" className="border-b border-white/10 py-20 sm:py-24 lg:py-28">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <Reveal>
                <SectionHeading
                  title="Questions"
                  body="The ones we get asked most often about draws, entries and prizes."
                />
              </Reveal>
              <div className="mt-12 grid gap-5 lg:grid-cols-2">
                {faqItems.map((item, i) => (
                  <Reveal key={item.question} delay={i * 0.05}>
                    <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                      <h3 className="text-base font-semibold tracking-[-0.02em] text-white">
                        {item.question}
                      </h3>
                      <p className="mt-3 text-sm leading-6 text-zinc-400">{item.answer}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          <section className="py-20 sm:py-24 lg:py-28">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <Reveal>
                <SectionHeading
                  title="Draws run inside DeHub"
                  body="Open the app to see whatever is live now, and turn on notifications so the next one does not pass you by."
                />
              </Reveal>
              <Reveal delay={0.08}>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link
                    to="/"
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    Open DeHub
                    <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                  </Link>
                  <Link
                    to="/docs/token/overview"
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    Read about DHB
                  </Link>
                </div>
              </Reveal>
            </div>
          </section>
        </main>

        <footer className="border-t border-white/10 bg-zinc-950">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 text-sm text-zinc-500 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
            <img src={dehubLogo} alt="DeHub" className="h-6 w-auto self-start opacity-80" loading="lazy" />
            <p className="max-w-2xl md:text-right">
              Prize draws are promotional and open to DeHub account holders aged 18 or over, void
              where local law prohibits them. DeHub staff, contractors and their households are not
              eligible. Prizes are not exchangeable for cash unless stated, and each draw&rsquo;s own
              announcement carries its full terms.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
