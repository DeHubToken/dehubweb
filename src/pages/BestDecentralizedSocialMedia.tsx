import { Link } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';

/**
 * Best Decentralized Social Media (2026) — long-form comparison guide.
 * Targets: "decentralized social media", "best web3 social media dapps".
 */

const platforms = [
  {
    name: 'DeHub',
    chain: 'Base, BNB, Robinhood Chain + Solana',
    launched: '2021',
    model: 'User-owned, tokenised uploads, gasless smart accounts',
    monetization:
      '16 native rails: tips at 10%, PPV, token-gated and subscriber-only posts, tradable subscription NFTs with resale royalties, paid DMs, watch-to-earn, escrowed bounties, up to 90% ad-revenue share, 1,000 tradeable fractions per post, stores, live shopping, 20% affiliate, staking and badge fee discounts',
    moderation:
      'Staked, quadratic community voting with slashing — voters share the removed post’s ad revenue, appeals go to the DAO, every decision logged on-chain',
    strengths: [
      'The deepest monetization stack of any social network, Web2 or Web3',
      'Subscriptions are assets fans can resell — and the creator earns a royalty every time',
      'Moderation is built into the token economy, not run by a trust-and-safety department',
      'No card, no KYC, no seed phrase — social, email or SMS sign-up with gas sponsored',
      'Native AI creator studio (image, video, music, poster)',
      'Real content ownership via smart contracts, and posts earn ad revenue for life',
    ],
    weaknesses: [
      'Smaller network than legacy Web2 platforms',
    ],
    bestFor: 'Creators who want to own their content and actually earn from it — video, streams, subscriptions, messages and storefronts in one app.',
  },
  {
    name: 'Mastodon',
    chain: 'Federated (ActivityPub, no blockchain)',
    launched: '2016',
    model: 'Federated servers ("instances") run by volunteers',
    monetization: 'None. Donations to instance operators only',
    moderation: 'Per-instance, at the discretion of whoever runs your server',
    strengths: [
      'Mature Fediverse network',
      'No single company controls the graph',
    ],
    weaknesses: [
      'No native monetization for creators',
      'Instance admins can still moderate/delete',
      'No content ownership primitives',
    ],
    bestFor: 'Users happy with a Twitter-like feed under community moderation.',
  },
  {
    name: 'Bluesky',
    chain: 'AT Protocol (no blockchain)',
    launched: '2023',
    model: 'Protocol with a single dominant hosted service',
    monetization: 'None built-in. Subscriptions announced in 2025, still not shipped in 2026',
    moderation: 'Composable labellers on paper; the dominant service sets policy in practice',
    strengths: [
      'Simple onboarding, familiar UX',
      'Portable identity via DIDs',
    ],
    weaknesses: [
      'Currently centralised in practice',
      'No creator fund, no ad-revenue share, no native tipping',
      'Every Bluesky creator still monetises somewhere else',
    ],
    bestFor: 'Users who want a Twitter clone with an open protocol on paper.',
  },
  {
    name: 'Farcaster',
    chain: 'Optimism (hybrid on-chain identity)',
    launched: '2022',
    model: 'On-chain user IDs + off-chain hubs',
    monetization: 'Tips and Frames through third-party apps; nothing native for creators',
    moderation: 'Set by whichever client you use — one company, one policy, one head office',
    strengths: [
      'Strong developer ecosystem (Frames)',
      'Crypto-native audience',
    ],
    weaknesses: [
      'Sold to Neynar in January 2026; founders stepped back and $180M was returned to investors',
      'A new operator was being sought seven months later',
      'Charged around $5 through the app store to sign up for most of its growth period',
      'Small user base outside crypto, and content itself lives off-chain',
    ],
    bestFor: 'Web3 developers experimenting with mini-apps and Frames, who are comfortable building on a protocol whose operator is an open question.',
  },
  {
    name: 'Lens Protocol',
    chain: 'Polygon / Lens Chain',
    launched: '2022',
    model: 'Profiles and posts as NFTs',
    monetization: 'Collect modules and follow NFTs — primitives, not a creator income stack',
    moderation: 'Per-client; the protocol takes no position',
    strengths: [
      'Composable social graph',
      'True on-chain profiles',
    ],
    weaknesses: [
      'Stewardship handed to Mask Network in January 2026',
      'Onboarding collapsed from tens of thousands of new profiles a day to roughly a hundred and fifty',
      'Fragmented client UX and gas friction on some actions',
    ],
    bestFor: 'Builders who need a composable, on-chain social graph.',
  },
];

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'Is decentralized social media really censorship resistant?',
    a: "Blockchain-based platforms like DeHub store ownership and payment records on-chain, so no single company can silently delete a creator's history. Federated platforms rely on the goodwill of instance operators.",
  },
  {
    q: 'Do I need crypto to use DeHub?',
    a: 'No. DeHub supports email and social login via smart accounts, and includes a fiat on-ramp for anyone who later wants to tip, stake or trade.',
  },
  {
    q: 'Which decentralized social media pays creators the most?',
    a: 'DeHub, by a distance. It runs sixteen native earning rails — tips at a 10% fee, pay-per-view unlocks, token-gated and subscriber-only posts, tradable subscription NFTs that pay the creator a royalty on every resale, paid DMs, watch-to-earn bounties, an escrowed bounty marketplace, up to 90% ad-revenue share for the life of a post, 1,000 tradeable fractions per upload, native stores and live shopping, a 20% affiliate programme and thirteen badge tiers of fee discounts. Bluesky and Mastodon pay creators nothing natively.',
  },
  {
    q: 'What are tradable subscriptions?',
    a: 'A normal subscription is a receipt: you pay, you get access, it expires, and it is worth nothing to anyone else. On DeHub a subscription is minted as an NFT the subscriber owns, so it can be resold — and the creator takes a royalty on that resale and every resale after it. It is a second income stream on top of the original sale, and no Web2 subscription platform can offer it.',
  },
  {
    q: 'Can you charge people to message you?',
    a: 'On DeHub, yes. Set a per-message fee and it settles on-chain before the message is delivered, with a free-access list for the people who should always reach you for nothing. It turns an inbox into a revenue line and filters time-wasters automatically. No other network in this comparison has it.',
  },
  {
    q: 'Who moderates a decentralized social network?',
    a: 'On most of them, a company — the protocol may be open, but the client the users are on applies one organisation’s policy. DeHub is the exception: moderation runs on staked $DHB with quadratic voting, correct votes earn and wrong votes are slashed, the ad revenue and bounties of removed content are shared among everyone who voted, appeals go to the DAO, and every decision is logged on-chain. Elected admins and top badge holders can still remove illegal or harmful content immediately, under policy governance sets and with an appeal attached.',
  },
];

export default function BestDecentralizedSocialMedia() {
  const url = 'https://dehub.io/guides/best-decentralized-social-media';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: 'Best Decentralized Social Media Platforms in 2026',
        description:
          'A hands-on comparison of the top decentralized and Web3 social media platforms — DeHub, Mastodon, Bluesky, Farcaster and Lens — judged on how creators actually get paid and who decides what comes down.',
        datePublished: '2026-07-02',
        dateModified: '2026-09-15',
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
    ],
  };


  return (
    <>
      <SEOHead
        title="Best Decentralized Social Media 2026 — DeHub Guide"
        description="Comparison guide of the best decentralized and Web3 social media platforms in 2026. DeHub, Mastodon, Bluesky, Farcaster and Lens — monetization, ownership, moderation and who each is really for."
        url={url}
        type="article"
        jsonLd={jsonLd}
      />
      <main data-glass-page className="min-h-screen bg-black text-white">
        <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <nav aria-label="Breadcrumb" className="text-xs text-zinc-500 mb-6">
            <Link to="/" className="hover:text-white">DeHub</Link>
            <span className="mx-2">/</span>
            <span>Guides</span>
            <span className="mx-2">/</span>
            <span className="text-zinc-300">Best Decentralized Social Media</span>
          </nav>

          <header className="mb-10">
            <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">Guide · Updated September 2026</p>
            <h1 className="text-3xl sm:text-5xl font-bold leading-tight mb-4">
              Best Decentralized Social Media Platforms in 2026
            </h1>
            <p className="text-lg text-zinc-400">
              A no-fluff comparison of the top decentralized and Web3 social media dapps, judged on
              the two questions most guides skip: <strong className="text-zinc-200">do you actually
              get paid here</strong>, and <strong className="text-zinc-200">who decides what comes
              down</strong>.
            </p>
          </header>

          <section className="prose prose-invert max-w-none mb-12">
            <h2 className="text-2xl font-semibold mb-3">What "decentralized social media" actually means</h2>
            <p className="text-zinc-300 leading-relaxed">
              Decentralized social media replaces a single corporate owner with either a federated network
              (Mastodon, Bluesky) or on-chain primitives (DeHub, Farcaster, Lens). The goal is the same:
              you own your identity and your content, and no single company can silently delete, demote or
              demonetize you. In 2026 the space has settled into two camps — <strong>federated</strong>
              (open protocols, no tokens) and <strong>blockchain-native</strong> (on-chain identity, on-chain
              payments, true content ownership).
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">What went wrong for everyone else in 2026</h2>
            <p className="text-zinc-300 leading-relaxed mb-4">
              It is worth studying the failures before the features, because 2026 was a brutal year for
              Web3 social and the lessons are specific.
            </p>
            <ul className="space-y-3 text-zinc-300">
              <li>
                <strong className="text-white">Farcaster raised the most and sold anyway.</strong>{' '}
                Roughly $150M from Paradigm and a16z at a reported $1B valuation, then acquired by Neynar in
                January 2026 with the founders stepping back and $180M returned to investors. Seven months later
                its new owner was publicly looking for another operator. Gross protocol revenue went from about
                $35.4M in Q1 2026 to about $377k across seven weeks of the summer.
              </li>
              <li>
                <strong className="text-white">It also asked for a bank card at the door.</strong> For most of
                its growth period signing up meant roughly $5 as an in-app purchase, a US phone number, or an
                existing user paying about $3 for your invite — a payment method standing between you and a
                "permissionless" network.
              </li>
              <li>
                <strong className="text-white">And it still moderated like a Web2 company.</strong> The protocol
                was open; the client almost everyone used applied one company's policy from one company's head
                office. That pattern repeats across the whole category.
              </li>
              <li>
                <strong className="text-white">Lens changed hands in the same month.</strong> Mask Network took
                over stewardship in January 2026, after onboarding had already fallen from tens of thousands of
                new profiles a day at the 2024 peak to roughly a hundred and fifty.
              </li>
              <li>
                <strong className="text-white">Bluesky grew the audience and skipped the business model.</strong>{' '}
                Tens of millions of accounts and, as of 2026, still no creator fund, no ad-revenue share, no
                native tipping and no shipped subscriptions.
              </li>
              <li>
                <strong className="text-white">Mastodon never tried, on principle.</strong> No monetization by
                design, no content ownership primitives, and an instance admin who can still switch you off.
              </li>
            </ul>
            <p className="text-zinc-300 leading-relaxed mt-4">
              The pattern: the networks that decentralized <em>ownership</em> forgot the <em>economy</em>, and the
              networks that decentralized the <em>social graph</em> forgot the <em>users</em>. None of them made
              moderation part of the design — it stayed a cost centre run by staff, the exact thing everyone said
              they were leaving.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6">The 5 best decentralized social media platforms</h2>
            <ol className="space-y-8">
              {platforms.map((p, i) => (
                <li key={p.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                  <h3 className="text-xl font-bold mb-1">
                    {i + 1}. {p.name}
                  </h3>
                  <p className="text-xs text-zinc-500 mb-4">
                    {p.chain} · Launched {p.launched}
                  </p>
                  <dl className="grid sm:grid-cols-2 gap-4 text-sm mb-4">
                    <div>
                      <dt className="text-zinc-500 mb-1">Model</dt>
                      <dd className="text-zinc-200">{p.model}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500 mb-1">Monetization</dt>
                      <dd className="text-zinc-200">{p.monetization}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-zinc-500 mb-1">Who moderates</dt>
                      <dd className="text-zinc-200">{p.moderation}</dd>
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
            <h2 className="text-2xl font-semibold mb-3">Sixteen ways to get paid on DeHub</h2>
            <p className="text-zinc-300 leading-relaxed mb-4">
              Most "Web3 social" platforms have one monetization mechanic, usually tipping. DeHub has a stack,
              and each layer is designed to work with the others.
            </p>
            <ol className="list-decimal list-outside pl-5 space-y-2 text-zinc-300">
              <li><strong className="text-white">Tips</strong> on every post and stream, at a 10% fee — against roughly 60% taken on gifting by the likes of TikTok.</li>
              <li><strong className="text-white">Pay-per-view.</strong> A one-time unlock on any upload or live stream, in any supported token, paid to you on unlock rather than thirty days later.</li>
              <li><strong className="text-white">Token-gated content.</strong> Lock a post behind "hold N of token X" — your own token, DHB, or any supported asset.</li>
              <li><strong className="text-white">Subscriber-only posts.</strong> Tie a post to your plan so only paying members see it.</li>
              <li><strong className="text-white">Tradable subscription NFTs.</strong> A subscription your fan actually owns and can resell — and you take a royalty on every resale, forever. No Web2 platform can offer this.</li>
              <li><strong className="text-white">Tier-based communities.</strong> Each tier gets its own group chat, perks, early access and private streams.</li>
              <li><strong className="text-white">Paid DMs.</strong> Set a per-message fee, settled on-chain before delivery, with a free-access list for the people who should always reach you free.</li>
              <li><strong className="text-white">Watch2Earn bounties.</strong> Pay viewers for their attention — advertising where the budget goes to the audience instead of an ad network.</li>
              <li><strong className="text-white">Bounty Hunting.</strong> A native escrowed task market in DHB or USDC across Social Media, Clipping and Contracts, with a dispute flow.</li>
              <li><strong className="text-white">Up to 90% ad-revenue share</strong>, and a post keeps earning for life with no further effort.</li>
              <li><strong className="text-white">Fractionalised content.</strong> Mint a post into exactly 1,000 tradeable ERC-1155 fractions so fans can invest in your career and you can raise a production budget from your own audience.</li>
              <li><strong className="text-white">Stores.</strong> A native storefront settled in DHB through the built-in wallet — no external checkout, no redirect.</li>
              <li><strong className="text-white">Live shopping.</strong> Sell during the stream, in the stream.</li>
              <li><strong className="text-white">Affiliate.</strong> 20% of the activity of everyone you refer, plus 5% recurring from the people they refer.</li>
              <li><strong className="text-white">Badges.</strong> Thirteen dollar-priced tiers, each cutting your fee on tips, PPV, subscriptions and bounties by a further 0.69%, with 5%–30% off buying DHB.</li>
              <li><strong className="text-white">Moderation mining.</strong> Yes — moderating pays. See below.</li>
            </ol>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">Decentralized moderation — the part nobody else built</h2>
            <p className="text-zinc-300 leading-relaxed mb-4">
              Every other network here treats moderation as an expense: hire a trust-and-safety team, publish a
              policy, absorb the appeals. DeHub treats it as a market, wired directly into the token economy —
              which is the single hardest thing in this guide for a competitor to copy, because it only works if
              your network already has an economy running through it.
            </p>
            <ul className="space-y-3 text-zinc-300">
              <li><strong className="text-white">Stake to moderate.</strong> Flagged content enters a queue, stakers vote remove/warn/ignore, correct votes earn rewards and wrong votes are slashed.</li>
              <li><strong className="text-white">Quadratic voting.</strong> Voting power is the square root of tokens staked — 100 staked is 10 votes, 10,000 is 100, not 10,000. More tokens means more influence; never unchecked power.</li>
              <li><strong className="text-white">Moderation mining.</strong> When a post is removed, its ad revenue and play-to-earn bounties are shared across every wallet that voted. Keeping the network clean is a paid job open to anyone.</li>
              <li><strong className="text-white">Delegated moderation.</strong> Delegate your votes to a curator or pool the way you would stake to a validator, and swap them whenever you like.</li>
              <li><strong className="text-white">Curation markets.</strong> Stake to boost content you believe in — boost something that later gets flagged and you can be slashed for it.</li>
              <li><strong className="text-white">DAO appeals.</strong> Appeal a decision as a DAO proposal voted on with the same quadratic logic, the structural defence against moderation cartels and brigading. Appeals are tracked in-app with a reference number and a real answer.</li>
              <li><strong className="text-white">Everything logged on-chain.</strong> A permanent, auditable moderation history. Try that on any Big Tech platform, or on the dominant client of any other network here.</li>
            </ul>
            <p className="text-zinc-300 leading-relaxed mt-4">
              Two honest clarifications. Genuinely illegal or harmful content does not wait for a vote — elected
              administrators and top-tier badge holders hold delegated takedown rights and act immediately, under
              policy governance sets and with an appeal attached. And decentralized does not mean unfiltered:
              per-post content ratings keep adult material off the public feed while letting it exist on the
              platform.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">Built in the open, shipped daily</h2>
            <p className="text-zinc-300 leading-relaxed">
              Two of the five networks here changed owners in January 2026 and one was looking for another
              operator by August, so it is fair to ask who is still building. DeHub's lead developer, mal.eth,
              sits at{' '}
              <a
                href="https://ghcommits.com/u/maldoteth"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white underline underline-offset-4"
              >
                #34 on the public ghcommits.com all-time GitHub commits leaderboard
              </a>{' '}
              with more than 19,000 commits — an independently tracked, verifiable record of shipping rather than
              a roadmap slide. The platform ships to web, Android and iOS from one codebase, on a custom CDN with
              sub-200ms global latency, with open-source end-to-end encrypted messaging and live streaming that
              has scaled past 50,000 concurrent viewers.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">Which platform should you pick?</h2>
            <ul className="space-y-3 text-zinc-300">
              <li><strong className="text-white">Want to earn from your content?</strong> DeHub — sixteen native rails, from tradable subscriptions and paid DMs to PPV, gated posts and up to 90% ad-revenue share.</li>
              <li><strong className="text-white">Want a say in the rules that govern you?</strong> DeHub — staked quadratic moderation, DAO appeals, every decision on-chain.</li>
              <li><strong className="text-white">Want AI creator tools built-in?</strong> DeHub Creator Studio (image, video, music, poster).</li>
              <li><strong className="text-white">Prefer a familiar Twitter-style feed?</strong> Bluesky — accept that you will monetize somewhere else.</li>
              <li><strong className="text-white">Want the mature Fediverse?</strong> Mastodon.</li>
              <li><strong className="text-white">Building a Web3 mini-app?</strong> Farcaster or Lens, both under new stewardship as of 2026.</li>
            </ul>
            <p className="text-zinc-400 mt-4">
              For the long-form version of this comparison, with the full platform-by-platform breakdown, read{' '}
              <Link to="/guides/best-decentralised-social-media-platforms-2026" className="text-white underline underline-offset-4">
                Best Decentralised Social Media Platforms 2026
              </Link>.
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 mb-12">
            <h2 className="text-xl font-semibold mb-2">Try DeHub free</h2>
            <p className="text-zinc-400 mb-4">
              No card, no KYC, no seed phrase — sign up with socials, email or SMS and gas is sponsored for you.
              Then tokenise an upload, put a price on your inbox, or go live.
            </p>
            <Link
              to="/app"
              className="inline-flex items-center justify-center rounded-2xl bg-white text-black font-semibold px-5 py-2.5 hover:bg-zinc-200 transition"
            >
              Open DeHub
            </Link>
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
