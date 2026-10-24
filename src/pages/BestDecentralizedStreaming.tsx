import { translateCopy as _translateCopy } from '@/i18n/copy';
import DOMPurify from 'dompurify';
import { usePublicPageLocale } from '@/hooks/usePublicPageLocale';
import { useTranslation as _useCopy } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';

/**
 * Best Decentralized Streaming Apps (2026) — long-form comparison guide.
 * Targets: "decentralized streaming", "decentralized livestreaming",
 * "web3 streaming apps".
 *
 * The angle that separates this from every other listicle on the query: it
 * only lists apps you can actually watch on. Theta and Livepeer are the two
 * names every competing page leads with, and neither is a place a viewer ever
 * goes — they are delivery rails other apps are built on. Most of those pages
 * also still list DLive, which closed in April 2026.
 */

const platforms = [
  {
    name: 'DeHub',
    get network() { return _translateCopy("copy.9f5a55e28454", { defaultValue: "Base, BNB, Robinhood Chain + Solana" }); },
    launched: '2021',
    get model() { return _translateCopy("copy.1ff5c5a7dd89", { defaultValue: "User-owned media platform — video, live, audio, posts" }); },
    get monetization() { return _translateCopy("copy.8594d99a685c", { defaultValue: "Real-time tips, pay-per-view, subscriptions, token gating, 20% affiliate share" }); },
    get strengths() {
      return [
        _translateCopy("copy.6552763aabe1", { defaultValue: "Tips land as they are sent — no payout threshold, no monthly cycle, yours to spend or cash out immediately" }),
        _translateCopy("copy.6d090e0ffa44", { defaultValue: "Live production built in: voice changers, a sound-effects board, camera looks and screen share — no plugins" }),
        _translateCopy("copy.0726da879c2c", { defaultValue: "AI creator studio for image, video, music and poster generation" }),
        _translateCopy("copy.2bc8bdef22f0", { defaultValue: "Live, video-on-demand, audio rooms and shorts in one app" }),
        _translateCopy("copy.067c3e938fe0", { defaultValue: "Email or social login — a wallet is optional, not a gate" }),
        _translateCopy("copy.5c435fbb6c1c", { defaultValue: "Streams can be minted on-chain or published off-chain entirely" }),
      ];
    },
    get weaknesses() {
      return [
        _translateCopy("copy.4860f8d7cf70", { defaultValue: "Smaller audience than the Web2 platforms it replaces" }),
      ];
    },
    get bestFor() { return _translateCopy("copy.a06bf732351e", { defaultValue: "Creators who want Twitch-style streaming plus on-chain ownership and payments in one place." }); },
  },
  {
    name: 'Streamplace',
    get network() { return _translateCopy("copy.0eb34f866630", { defaultValue: "AT Protocol (the Bluesky network)" }); },
    launched: '2024',
    get model() { return _translateCopy("copy.d5ba1f3887fa", { defaultValue: "Open-source live video layer for AT Protocol" }); },
    get monetization() { return _translateCopy("copy.fcae01a703a4", { defaultValue: "None built in yet" }); },
    get strengths() {
      return [
        _translateCopy("copy.37068b9d1d1f", { defaultValue: "Your Bluesky handle is your streaming identity — no separate account" }),
        _translateCopy("copy.a2bae105fbb1", { defaultValue: "Fully open source, self-hostable" }),
        _translateCopy("copy.f66fd5b412f4", { defaultValue: "Signs every stream segment for provenance, so clips can be traced to source" }),
      ];
    },
    get weaknesses() {
      return [
        _translateCopy("copy.a6f884deb7a7", { defaultValue: "Very early — typically a dozen or so concurrent streams" }),
        _translateCopy("copy.7731d4d703bd", { defaultValue: "No creator payments yet" }),
      ];
    },
    get bestFor() { return _translateCopy("copy.8560c9de7520", { defaultValue: "Bluesky users who want to go live to the followers they already have." }); },
  },
  {
    name: 'Odysee',
    get network() { return _translateCopy("copy.9a4c9d318205", { defaultValue: "LBRY protocol" }); },
    launched: '2020',
    get model() { return _translateCopy("copy.dc4039863560", { defaultValue: "Video-first platform with livestreaming on a content-addressed protocol" }); },
    get monetization() { return _translateCopy("copy.49ea50938e00", { defaultValue: "Tips and boosts in LBC" }); },
    get strengths() {
      return [
        _translateCopy("copy.83556005fdcf", { defaultValue: "By far the largest audience of any platform on this list" }),
        _translateCopy("copy.6b5096f9a728", { defaultValue: "Deep back catalogue — a genuine YouTube alternative, not a demo" }),
        _translateCopy("copy.5dfd52b0e769", { defaultValue: "Content addressing means videos survive independently of the front end" }),
      ];
    },
    get weaknesses() {
      return [
        _translateCopy("copy.f9dd20553217", { defaultValue: "Livestreaming is secondary to uploaded video" }),
        _translateCopy("copy.0b94536e63ba", { defaultValue: "Moderation reputation is a real consideration for brand-safe creators" }),
      ];
    },
    get bestFor() { return _translateCopy("copy.49342b5c6b2a", { defaultValue: "Creators who want reach today and treat live as a supplement to uploads." }); },
  },
  {
    name: '3Speak',
    get network() { return _translateCopy("copy.af48338f0994", { defaultValue: "Hive" }); },
    launched: '2019',
    get model() { return _translateCopy("copy.9c5a20ebdec2", { defaultValue: "Video and live built on the Hive social blockchain" }); },
    get monetization() { return _translateCopy("copy.72656f38cb64", { defaultValue: "Hive post rewards, paid out from the chain itself" }); },
    get strengths() {
      return [
        _translateCopy("copy.3b7296571a00", { defaultValue: "Earnings come from the protocol, not from advertisers" }),
        _translateCopy("copy.2ced877b1780", { defaultValue: "Established, genuinely active creator community" }),
        _translateCopy("copy.7f7935d3ea6f", { defaultValue: "Your account is a Hive account, portable across every Hive app" }),
      ];
    },
    get weaknesses() {
      return [
        _translateCopy("copy.bf4009809984", { defaultValue: "Audience is largely the existing Hive community" }),
        _translateCopy("copy.662235972632", { defaultValue: "Rewards fluctuate with the token" }),
      ];
    },
    get bestFor() { return _translateCopy("copy.5bb9de87001b", { defaultValue: "Creators already in the Hive ecosystem, or anyone who wants chain-funded rewards." }); },
  },
  {
    name: 'zap.stream',
    get network() { return _translateCopy("copy.63acfab9c9a3", { defaultValue: "Nostr + Bitcoin Lightning" }); },
    launched: '2023',
    get model() { return _translateCopy("copy.f58e87f94f3e", { defaultValue: "Live streaming published as Nostr events, paid in sats" }); },
    get monetization() { return _translateCopy("copy.90f503f88af8", { defaultValue: "Lightning zaps straight to the creator" }); },
    get strengths() {
      return [
        _translateCopy("copy.c7babcce15f1", { defaultValue: "Tips settle instantly in Bitcoin, with no platform cut taken from them" }),
        _translateCopy("copy.b5c781a0f8e1", { defaultValue: "No account to create — your Nostr key is your identity" }),
        _translateCopy("copy.a22b3f1b66a6", { defaultValue: "Streams are discoverable in any Nostr client that supports live events" }),
      ];
    },
    get weaknesses() {
      return [
        _translateCopy("copy.32a7f30dd810", { defaultValue: "Costs the streamer sats per minute to broadcast" }),
        _translateCopy("copy.359e0370947c", { defaultValue: "Small audience — single-digit viewer counts are normal" }),
      ];
    },
    get bestFor() { return _translateCopy("copy.182776d50439", { defaultValue: "Bitcoiners who want to be paid in sats with no intermediary." }); },
  },
  {
    name: 'Audius',
    get network() { return _translateCopy("copy.be4b0c384393", { defaultValue: "Solana" }); },
    launched: '2019',
    get model() { return _translateCopy("copy.d42c9db42c77", { defaultValue: "Decentralized music streaming" }); },
    get monetization() { return _translateCopy("copy.5a184faf0435", { defaultValue: "Artist tokens, tipping, paid tracks" }); },
    get strengths() {
      return [
        _translateCopy("copy.fa1fc0994cb9", { defaultValue: "The largest user base of any decentralized streaming app" }),
        _translateCopy("copy.73e9ff9aa4db", { defaultValue: "Genuinely good listening experience — it competes on UX, not ideology" }),
        _translateCopy("copy.880ebaca3ba5", { defaultValue: "Direct artist-to-fan payments" }),
      ];
    },
    get weaknesses() {
      return [
        _translateCopy("copy.94aec3f9d756", { defaultValue: "Music only — no video or live video" }),
      ];
    },
    get bestFor() { return _translateCopy("copy.d68ef13a49c4", { defaultValue: "Musicians who want distribution without a label or a streaming middleman." }); },
  },
];

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    get q() { return _translateCopy("copy.b77c1e3b9b89", { defaultValue: "Why are Theta and Livepeer not on this list?" }); },
    get a() { return _translateCopy("copy.2fb3a8c51b56", { defaultValue: "Because neither is a place you watch anything. Theta and Livepeer are decentralized video infrastructure — networks that handle transcoding and delivery underneath other apps. They are genuinely important, and several platforms on this list run on them, but you cannot open Livepeer and find a stream. This guide only covers apps with an audience and a front door." }); },
  },
  {
    get q() { return _translateCopy("copy.4b566fa7c492", { defaultValue: "What happened to DLive?" }); },
    get a() { return _translateCopy("copy.dbb74ed3b856", { defaultValue: "DLive shut down in April 2026 after eight years. It is still listed as a live option on most comparison pages, which is a reasonable way to judge how current any given list is. Its closure is also the clearest illustration of the risk in this space: a decentralized platform with a centralized company behind it can still switch off." }); },
  },
  {
    get q() { return _translateCopy("copy.3d33e16c77ef", { defaultValue: "Is decentralized streaming actually usable in 2026?" }); },
    get a() { return _translateCopy("copy.80cec636e2ea", { defaultValue: "For uploaded video and music, yes — Odysee and Audius both have real audiences and mature apps. For live video the honest answer is that audiences are still small; the drawcards are ownership, payments that are not gated behind follower counts, and the fact that nobody can demonetize you unilaterally." }); },
  },
  {
    get q() { return _translateCopy("copy.1a7f6dcad752", { defaultValue: "How quickly do tips actually reach the creator?" }); },
    get a() { return _translateCopy("copy.9bbf96f13cc8", { defaultValue: "On DeHub a tip settles on-chain to your own wallet as it is sent, during the stream. There is no payout threshold to clear, no monthly payout date and no holding period, so the balance is yours to spend, swap or cash out straight away. That is the practical difference from an ad-funded platform, where the same money reaches you weeks later and only once you have cleared a minimum." }); },
  },
  {
    get q() { return _translateCopy("copy.0342e0eaa827", { defaultValue: "Do I need crypto to start streaming on DeHub?" }); },
    get a() { return _translateCopy("copy.f03fe31d8277", { defaultValue: "No. You can sign in with email or a social account, go live without a wallet, and publish off-chain if you prefer. Minting a stream on-chain is an option rather than a requirement, and there is no gas cost to the creator when you take that route." }); },
  },
];

/**
 * Section figure. Rendered from the banner kit at 1200x630, so the intrinsic
 * size is stated to keep the heading below it from jumping on load.
 */
function Figure({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={`/guides/${src}.jpg`}
      alt={alt}
      width={1200}
      height={630}
      loading="lazy"
      decoding="async"
      className="w-full h-auto rounded-2xl border border-white/10 mb-12"
    />
  );
}

export default function BestDecentralizedStreaming() {
  const { t: _copy } = _useCopy();
  const url = 'https://dehub.io/guides/best-decentralized-streaming-apps';
  const localized = usePublicPageLocale('/guides/best-decentralized-streaming-apps');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: 'Best Decentralized Streaming Apps in 2026',
        description:
          _copy("copy.f8c11a767d2d", { defaultValue: "The decentralized and Web3 streaming apps you can actually watch on in 2026 — DeHub, Streamplace, Odysee, 3Speak, zap.stream and Audius — with monetization, audience size and who each is for." }),
        datePublished: '2026-09-13',
        dateModified: '2026-09-29',
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

  if (localized.localized) {
    return <>
      <SEOHead title={localized.data?.title} description={localized.data?.description} url={url} type="article"
        jsonLd={{ '@context': 'https://schema.org', '@type': 'Article', headline: localized.data?.h1, description: localized.data?.description, mainEntityOfPage: url, datePublished: '2026-09-13', dateModified: '2026-09-29', author: { '@type': 'Organization', name: 'DeHub' } }} />
      <main data-glass-page className="min-h-screen bg-black text-white">
        {localized.data ? <article className="prose prose-invert max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(localized.data.body) }} />
          : <div className="max-w-3xl mx-auto p-12" role="status">{_copy('common.loading', { defaultValue: 'Loading...' })}</div>}
      </main>
    </>;
  }

  return (
    <>
      <SEOHead
        title={_copy("copy.7405f4274c2f", { defaultValue: "Best Decentralized Streaming Apps 2026 — DeHub Guide" })}
        description={_copy("copy.76440774d600", { defaultValue: "The decentralized streaming apps you can actually watch on in 2026 — DeHub, Streamplace, Odysee, 3Speak, zap.stream and Audius. Not infrastructure, not dead platforms: real apps, compared." })}
        url={url}
        type="article"
        jsonLd={jsonLd}
      />
      <main data-glass-page className="min-h-screen bg-black text-white">
        <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <nav aria-label={_copy("copy.2bd873d6c734", { defaultValue: "Breadcrumb" })} className="text-xs text-zinc-500 mb-6">
            <Link to="/" className="hover:text-white">DeHub</Link>
            <span className="mx-2">/</span>
            <span>{_copy("copy.572cd72feb9a", { defaultValue: "Guides" })}</span>
            <span className="mx-2">/</span>
            <span className="text-zinc-300">{_copy("copy.c80b0b85e6aa", { defaultValue: "Best Decentralized Streaming Apps" })}</span>
          </nav>

          <header className="mb-10">
            <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">{_copy("copy.f16b04db6570", { defaultValue: "Guide · Updated September 2026" })}</p>
            <h1 className="text-3xl sm:text-5xl font-bold leading-tight mb-4">{_copy("copy.181e94e04115", { defaultValue: "Best Decentralized Streaming Apps in 2026" })}</h1>
            <p className="text-lg text-zinc-400">{_copy("copy.16e0c145ae0e", { defaultValue: "Six decentralized and Web3 streaming apps you can actually watch on — compared on audience, monetization and what you genuinely own. No infrastructure protocols padding the list, and nothing that has already shut down." })}</p>
          </header>

          <section className="prose prose-invert max-w-none mb-12">
            <h2 className="text-2xl font-semibold mb-3">{_copy("copy.3667f1577d37", { defaultValue: "First, the thing most lists get wrong" })}</h2>
            <p className="text-zinc-300 leading-relaxed mb-4">{_copy("copy.c8b9101006aa", { defaultValue: "Search for decentralized streaming and almost every result opens with" })}{' '}
              <strong>{_copy("copy.e5828dae4735", { defaultValue: "Theta" })}</strong>{_copy("copy.e3ee915a8e8c", { defaultValue: " and " })}<strong>{_copy("copy.6cd06db20425", { defaultValue: "Livepeer" })}</strong>{_copy("copy.10e24f0331a0", { defaultValue: ". Neither one is a streaming app. They are delivery networks — the decentralized equivalent of a CDN and a transcoding farm, sitting underneath other products. They matter a great deal, and several apps below are built on that kind of infrastructure, but you cannot open Livepeer and watch someone play Minecraft. Listing them as places to stream is like answering \"which video site should I use\" with \"fibre optics\"." })}</p>
            <p className="text-zinc-300 leading-relaxed">{_copy("copy.86076ae2bc85", { defaultValue: "The second tell is " })}<strong>{_copy("copy.88bd742fdae5", { defaultValue: "DLive" })}</strong>{_copy("copy.430e5d8e5d98", { defaultValue: ", which appears on most of those same lists and " })}<strong>{_copy("copy.1f456e2cbbd9", { defaultValue: "closed in April 2026" })}</strong>{_copy("copy.b4811aad79b0", { defaultValue: ". This guide covers apps with a front door, an audience, and a pulse." })}</p>
          </section>

          <Figure
            src="fig-streaming-rails-not-apps"
            alt={_copy("copy.7c811ca9bfc2", { defaultValue: "Theta and Livepeer are delivery rails, not streaming apps with a front door" })}
          />

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6">{_copy("copy.7998e2d87716", { defaultValue: "The 6 best decentralized streaming apps" })}</h2>
            <ol className="space-y-8">
              {platforms.map((p, i) => (
                <li key={p.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                  <h3 className="text-xl font-bold mb-1">
                    {i + 1}. {p.name}
                  </h3>
                  <p className="text-xs text-zinc-500 mb-4">
                    {p.network}{_copy("copy.03c791feaa1c", { defaultValue: " · Launched " })}{p.launched}
                  </p>
                  <dl className="grid sm:grid-cols-2 gap-4 text-sm mb-4">
                    <div>
                      <dt className="text-zinc-500 mb-1">{_copy("copy.5e2c614c23f0", { defaultValue: "Model" })}</dt>
                      <dd className="text-zinc-200">{p.model}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500 mb-1">{_copy("copy.4d07f6012a60", { defaultValue: "Monetization" })}</dt>
                      <dd className="text-zinc-200">{p.monetization}</dd>
                    </div>
                  </dl>
                  <div className="grid sm:grid-cols-2 gap-4 text-sm mb-4">
                    <div>
                      <p className="text-zinc-500 mb-2">{_copy("copy.b11d27f88ceb", { defaultValue: "Strengths" })}</p>
                      <ul className="list-disc pl-5 space-y-1 text-zinc-200">
                        {p.strengths.map((s) => <li key={s}>{s}</li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="text-zinc-500 mb-2">{_copy("copy.af393b754ae3", { defaultValue: "Weaknesses" })}</p>
                      <ul className="list-disc pl-5 space-y-1 text-zinc-200">
                        {p.weaknesses.map((s) => <li key={s}>{s}</li>)}
                      </ul>
                    </div>
                  </div>
                  <p className="text-sm text-zinc-400">
                    <span className="text-zinc-500">{_copy("copy.e4394f02488a", { defaultValue: "Best for: " })}</span>{p.bestFor}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">{_copy("copy.d940c4929cb2", { defaultValue: "Which one should you pick?" })}</h2>
            <ul className="space-y-3 text-zinc-300">
              <li><strong className="text-white">{_copy("copy.07153496026a", { defaultValue: "Want to get paid from your first viewer?" })}</strong>{_copy("copy.7b85326af042", { defaultValue: " DeHub — real-time tips, pay-per-view and subscriptions, no follower threshold." })}</li>
              <li><strong className="text-white">{_copy("copy.208c9499d220", { defaultValue: "Want production tools without a plugin stack?" })}</strong>{_copy("copy.f4f8e59834fb", { defaultValue: " DeHub — voice changers, sound effects and camera looks in the browser." })}</li>
              <li><strong className="text-white">{_copy("copy.7de271a284f6", { defaultValue: "Already have a Bluesky following?" })}</strong>{_copy("copy.e4b7d3b7b2b4", { defaultValue: " Streamplace — same identity, no new account." })}</li>
              <li><strong className="text-white">{_copy("copy.eacc9626be89", { defaultValue: "Want the biggest audience available?" })}</strong>{_copy("copy.29891741bc10", { defaultValue: " Odysee." })}</li>
              <li><strong className="text-white">{_copy("copy.553d74bdde54", { defaultValue: "Want rewards paid by the chain itself?" })}</strong>{_copy("copy.531595a185f5", { defaultValue: " 3Speak." })}</li>
              <li><strong className="text-white">{_copy("copy.1a02d7858567", { defaultValue: "Want to be paid in Bitcoin?" })}</strong>{_copy("copy.790583caf7d2", { defaultValue: " zap.stream." })}</li>
              <li><strong className="text-white">{_copy("copy.4ab2357cb9bd", { defaultValue: "Making music rather than video?" })}</strong>{_copy("copy.784873441f29", { defaultValue: " Audius." })}</li>
            </ul>
          </section>

          <Figure
            src="fig-streaming-production-gap"
            alt={_copy("copy.f0f23dd6ea80", { defaultValue: "Voice changers, sound effects and camera looks built into the browser, with no plugin stack" })}
          />

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">{_copy("copy.8f14ee3a31f7", { defaultValue: "The production gap" })}</h2>
            <p className="text-zinc-300 leading-relaxed mb-4">{_copy("copy.59bb491feda2", { defaultValue: "Comparisons in this category usually stop at protocols and payments, which skips the thing you actually feel on day one: every other app here hands you a video player and a chat box, and everything else is your problem. You bring OBS, you wire up your own audio chain, you find your own plugins. DeHub ships the production tools in the browser:" })}</p>
            <ul className="space-y-3 text-zinc-300 mb-4">
              <li><strong className="text-white">{_copy("copy.9901ebc8a96c", { defaultValue: "Voice changers" })}</strong>{_copy("copy.339d6d1648e2", { defaultValue: " — Anonymous, Robot, Chipmunk, Echo and Radio, applied to the audio you publish rather than just your own monitor. Anonymous is the one that matters if you are covering something that makes you a target." })}</li>
              <li><strong className="text-white">{_copy("copy.9f5c19108ad3", { defaultValue: "A sound-effects board" })}</strong>{_copy("copy.077d1ebc4189", { defaultValue: " — air horn, applause, drum roll, buzzer, crickets, boo, countdown and more, on pads you can hit mid-sentence." })}</li>
              <li><strong className="text-white">{_copy("copy.a861436c9ced", { defaultValue: "Camera looks" })}</strong>{_copy("copy.fa080459f420", { defaultValue: " — mono, noir, warm, vivid and neon, applied live to the published picture, with nine native looks on mobile." })}</li>
              <li><strong className="text-white">{_copy("copy.60970c50e2bc", { defaultValue: "Screen share with a camera bubble" })}</strong>{_copy("copy.5373bc3eed0e", { defaultValue: " — share a game or a tab at 1080p with your face composited over it, no encoder needed." })}</li>
              <li><strong className="text-white">{_copy("copy.781cf24b06f2", { defaultValue: "An AI creator studio" })}</strong>{_copy("copy.85185622d8bf", { defaultValue: " — generate images, video, music and posters for your channel without leaving the app." })}</li>
            </ul>
            <p className="text-zinc-300 leading-relaxed">{_copy("copy.6fda0d2aa031", { defaultValue: "None of the other five platforms on this list ship any of it." })}</p>
          </section>

          <Figure
            src="fig-streaming-paid-as-it-lands"
            alt={_copy("copy.5b176be7069c", { defaultValue: "Tips settle on-chain as they are sent, with no payout cycle" })}
          />

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">{_copy("copy.3b9ba345dd97", { defaultValue: "What \"decentralized\" buys a streamer" })}</h2>
            <p className="text-zinc-300 leading-relaxed">{_copy("copy.6cc93068cea7", { defaultValue: "Three things, concretely. Your account and audience are not a platform's to delete, because identity lives on a protocol rather than in a company's database. Payments go directly from viewer to creator, so nothing is withheld behind a partner programme or a payout threshold. And your back catalogue does not evaporate if a front end disappears. DLive is the counter-example worth keeping in mind: branding alone does not make a platform durable, and it is worth checking which parts of a service are actually decentralized before you build a career on it." })}</p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 mb-12">
            <h2 className="text-xl font-semibold mb-2">{_copy("copy.23cc49836f60", { defaultValue: "Go live on DeHub" })}</h2>
            <p className="text-zinc-400 mb-4">{_copy("copy.ce39b97c0f94", { defaultValue: "Stream from your browser, your phone or OBS, with voice changers, sound effects and camera looks built in. Tips land in your wallet as they are sent — no follower threshold, no payout cycle, and no wallet required to start." })}</p>
            <Link
              to="/app"
              className="inline-flex items-center justify-center rounded-2xl bg-white text-black font-semibold px-5 py-2.5 hover:bg-zinc-200 transition"
            >{_copy("copy.efc85ecfd402", { defaultValue: "Open DeHub" })}</Link>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">{_copy("copy.dbc468a14b60", { defaultValue: "FAQ" })}</h2>
            <div className="space-y-5 text-zinc-300">
              {FAQ_ITEMS.map(({ q, a }) => (
                <div key={q}>
                  <h3 className="font-semibold text-white mb-1">{q}</h3>
                  <p>{a}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{_copy("copy.1e5b36078e37", { defaultValue: "Related guides" })}</h2>
            <ul className="space-y-2 text-zinc-300">
              <li>
                <Link to="/guides/best-decentralised-social-media-platforms-2026" className="underline hover:text-white">{_copy("copy.95f48da59b9a", { defaultValue: "Best decentralized social media platforms in 2026" })}</Link>
              </li>
            </ul>
          </section>

        </article>
      </main>
    </>
  );
}
