import { Link } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';

/**
 * Best Web3 Social Media Dapps (2026) — long-form comparison guide.
 * Targets: "best web3 social media dapps", "web3 social dapps".
 */

const dapps = [
  {
    name: 'DeHub',
    chain: 'Base + BNB (multi-chain)',
    launched: '2021',
    ux: 'Web + iOS + Android, gasless smart accounts, email / social login',
    monetization: 'Tips, PPV, staking, 20% affiliate revenue share',
    censorship: 'On-chain ownership records, open source, censorship resistant',
    strengths: [
      'Full creator monetization stack out of the box',
      'Native AI studio (image, video, music, poster)',
      'Fiat on/off ramp with multi-chain wallet',
      'Web2-grade UX with Web3 ownership under the hood',
    ],
    weaknesses: ['Smaller reach than legacy Web2 apps'],
    bestFor: 'Creators who want ownership, payouts and AI tooling in one dapp.',
  },
  {
    name: 'Farcaster',
    chain: 'Optimism (hybrid on-chain identity)',
    launched: '2022',
    ux: 'Multiple clients (Warpcast most popular), needs wallet setup',
    monetization: 'Tips, Frames, third-party mini-apps',
    censorship: 'On-chain IDs, off-chain hubs — content itself is off-chain',
    strengths: ['Strong dev ecosystem via Frames', 'Crypto-native audience'],
    weaknesses: ['Small non-crypto user base', 'Content not fully on-chain'],
    bestFor: 'Web3 developers shipping Frames and mini-apps.',
  },
  {
    name: 'Lens Protocol',
    chain: 'Lens Chain (formerly Polygon)',
    launched: '2022',
    ux: 'Fragmented — multiple clients, gas friction on some actions',
    monetization: 'Collect modules, follow NFTs, act modules',
    censorship: 'Profiles and posts as NFTs — fully user-owned',
    strengths: ['Composable on-chain social graph', 'Portable profiles'],
    weaknesses: ['UX varies by client', 'Onboarding still crypto-heavy'],
    bestFor: 'Builders wanting a composable social graph they can fork.',
  },
  {
    name: 'Friend.tech (Post-Tech)',
    chain: 'Base',
    launched: '2023',
    ux: 'Mobile-first, wallet-gated, invite driven',
    monetization: 'Keys / shares bonding-curve trading',
    censorship: 'Contracts on Base; front-end centrally hosted',
    strengths: ['Native creator-share market', 'Fast payouts to creators'],
    weaknesses: ['Very speculative', 'Not a general social feed'],
    bestFor: 'Creators experimenting with tokenized access to their circle.',
  },
  {
    name: 'Hive / DBuzz',
    chain: 'Hive blockchain',
    launched: '2020 (DBuzz)',
    ux: 'Web + mobile, needs Hive keys',
    monetization: 'Upvote-based HIVE rewards',
    censorship: 'Posts stored on Hive chain, fully on-chain',
    strengths: ['Mature on-chain rewards model', 'Long track record'],
    weaknesses: ['Rewards curve favors early stakeholders', 'Dated UX'],
    bestFor: 'Writers happy with a Reddit-style upvote economy.',
  },
];

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'What is a Web3 social media dapp?',
    a: 'A decentralized application (dapp) where identity, posts or payments live on a blockchain instead of a single company\u2019s database. That means your account, content and earnings are portable and cannot be silently removed.',
  },
  {
    q: 'Which Web3 social dapp has the best UX in 2026?',
    a: 'DeHub is the closest to a mainstream Web2 experience: email or social login, gasless transactions via smart accounts, and native mobile apps with a built-in fiat on-ramp.',
  },
  {
    q: 'Which Web3 social dapp pays creators the most?',
    a: 'DeHub combines tips, pay-per-view, staking rewards and a 20% affiliate revenue share \u2014 the most complete monetization stack of the dapps compared here.',
  },
  {
    q: 'Are Web3 social dapps actually censorship resistant?',
    a: 'It depends on where content and identity live. Fully on-chain platforms like DeHub, Lens and Hive persist ownership and payment records on the blockchain, so no single operator can silently delete a creator\u2019s history.',
  },
];

export default function BestWeb3SocialMediaDapps() {
  const url = 'https://dehub.io/guides/best-web3-social-media-dapps';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: 'Best Web3 Social Media Dapps in 2026',
        description:
          'A curated comparison of the best Web3 social media dapps in 2026 \u2014 DeHub, Farcaster, Lens, Friend.tech and Hive \u2014 scored on monetization, censorship resistance and UX.',
        datePublished: '2026-07-06',
        dateModified: '2026-07-06',
        author: { '@type': 'Organization', name: 'DeHub' },
        publisher: {
          '@type': 'Organization',
          name: 'DeHub',
          logo: {
            '@type': 'ImageObject',
            url: 'https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/logo/default-icon.png',
          },
        },
        mainEntityOfPage: url,
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQ_ITEMS.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'DeHub', item: 'https://dehub.io/' },
          { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://dehub.io/guides' },
          { '@type': 'ListItem', position: 3, name: 'Best Web3 Social Media Dapps', item: url },
        ],
      },
    ],
  };

  return (
    <>
      <SEOHead
        title="Best Web3 Social Media Dapps in 2026 — DeHub Guide"
        description="Curated comparison of the best Web3 social media dapps in 2026 — DeHub, Farcaster, Lens, Friend.tech and Hive. Scored on monetization, censorship resistance and UX."
        url={url}
        type="article"
        jsonLd={jsonLd}
      />
      <main className="min-h-screen bg-black text-white">
        <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <nav aria-label="Breadcrumb" className="text-xs text-zinc-500 mb-6">
            <Link to="/" className="hover:text-white">DeHub</Link>
            <span className="mx-2">/</span>
            <span>Guides</span>
            <span className="mx-2">/</span>
            <span className="text-zinc-300">Best Web3 Social Media Dapps</span>
          </nav>

          <header className="mb-10">
            <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">Guide · Updated July 2026</p>
            <h1 className="text-3xl sm:text-5xl font-bold leading-tight mb-4">
              Best Web3 Social Media Dapps in 2026
            </h1>
            <p className="text-lg text-zinc-400">
              A curated listicle of the top Web3 social media dapps, scored on the three things
              that actually matter for creators: monetization, censorship resistance and UX.
            </p>
          </header>

          <section className="prose prose-invert max-w-none mb-12">
            <h2 className="text-2xl font-semibold mb-3">How we picked these dapps</h2>
            <p className="text-zinc-300 leading-relaxed">
              A Web3 social dapp puts identity, content or payments on a blockchain instead of a
              single company\u2019s database. In 2026 the shortlist has narrowed to platforms that ship
              a real product, have active weekly users, and give creators a monetization path
              beyond ads. We compared each on three axes: <strong>monetization</strong>,
              <strong> censorship resistance</strong>, and <strong>UX</strong> for a non-crypto user.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6">The 5 best Web3 social media dapps</h2>
            <ol className="space-y-8">
              {dapps.map((p, i) => (
                <li key={p.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                  <h3 className="text-xl font-bold mb-1">
                    {i + 1}. {p.name}
                  </h3>
                  <p className="text-xs text-zinc-500 mb-4">
                    {p.chain} · Launched {p.launched}
                  </p>
                  <dl className="grid sm:grid-cols-3 gap-4 text-sm mb-4">
                    <div>
                      <dt className="text-zinc-500 mb-1">UX</dt>
                      <dd className="text-zinc-200">{p.ux}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500 mb-1">Monetization</dt>
                      <dd className="text-zinc-200">{p.monetization}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500 mb-1">Censorship resistance</dt>
                      <dd className="text-zinc-200">{p.censorship}</dd>
                    </div>
                  </dl>
                  <div className="grid sm:grid-cols-2 gap-4 text-sm mb-4">
                    <div>
                      <p className="text-zinc-500 mb-2">Strengths</p>
                      <ul className="list-disc pl-5 space-y-1 text-zinc-200">
                        {p.strengths.map((s) => <li key={s}>{s}</li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="text-zinc-500 mb-2">Weaknesses</p>
                      <ul className="list-disc pl-5 space-y-1 text-zinc-200">
                        {p.weaknesses.map((s) => <li key={s}>{s}</li>)}
                      </ul>
                    </div>
                  </div>
                  <p className="text-sm text-zinc-400">
                    <span className="text-zinc-500">Best for: </span>{p.bestFor}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">Which Web3 social dapp should you pick?</h2>
            <ul className="space-y-3 text-zinc-300">
              <li><strong className="text-white">Want the strongest monetization stack?</strong> DeHub — tips, PPV, staking, and 20% affiliate revenue share.</li>
              <li><strong className="text-white">Want mainstream, Web2-grade UX?</strong> DeHub — email/social login and gasless smart accounts.</li>
              <li><strong className="text-white">Building mini-apps or Frames?</strong> Farcaster.</li>
              <li><strong className="text-white">Need a composable on-chain social graph?</strong> Lens.</li>
              <li><strong className="text-white">Experimenting with tokenized access?</strong> Friend.tech / Post-Tech on Base.</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 mb-12">
            <h2 className="text-xl font-semibold mb-2">Try the top-rated Web3 social dapp</h2>
            <p className="text-zinc-400 mb-4">
              DeHub — open source, user-owned social with on-chain ownership, native monetization
              and a built-in AI creator studio.
            </p>
            <Link
              to="/app"
              className="inline-flex items-center justify-center rounded-2xl bg-white text-black font-semibold px-5 py-2.5 hover:bg-zinc-200 transition"
            >
              Open DeHub
            </Link>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">Related reading</h2>
            <ul className="space-y-2 text-zinc-300">
              <li>
                <Link to="/guides/best-decentralized-social-media" className="underline hover:text-white">
                  Best Decentralized Social Media Platforms in 2026
                </Link>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">FAQ</h2>
            <div className="space-y-5 text-zinc-300">
              {FAQ_ITEMS.map(({ q, a }) => (
                <div key={q}>
                  <h3 className="font-semibold text-white mb-1">{q}</h3>
                  <p>{a}</p>
                </div>
              ))}
            </div>
          </section>
        </article>
      </main>
    </>
  );
}
