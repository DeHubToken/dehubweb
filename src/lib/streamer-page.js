/**
 * /stream — the landing page for live streamers moving to DeHub.
 *
 * Aimed at TikTok LIVE and Twitch streamers, and the page affiliates send them
 * to: `/r/<CODE>?to=/stream` attributes the visit and then lands here. Every
 * figure on it is one DeHub has already published in its guides and docs.
 *
 * Plain JS for the same reason as reserved-usernames.js: the SPA page
 * (src/pages/StreamPage.tsx) and the crawler HTML in CLOUDFLARE_WORKER_SEO.js
 * both render from this one object, so the two UA variants cannot drift.
 */

const APP_URL = 'https://dehub.io';

export const STREAM_LINKS = {
  start: `${APP_URL}/app`,
  migrate: `${APP_URL}/app/migrate-youtube`,
  affiliate: `${APP_URL}/app/affiliate`,
  liveGuide: `${APP_URL}/guides/web3-live-streaming-decentralised-twitch-alternative`,
  tiktokGuide: `${APP_URL}/guides/uk-creators-guide-leaving-tiktok`,
};

export const STREAM_PAGE = {
  path: '/stream',
  title: 'Stream on DeHub — Live Streaming for TikTok & Twitch Creators',
  description: 'Go live on DeHub: on-chain tips that land in your wallet, an audience you own, posting to your other platforms in one step, and 20% from everyone you invite.',
  heading: 'Stream on DeHub',
  intro: 'Bring your live audience to a platform you own. Go live from your phone, your browser or OBS, get tipped on-chain while you stream, and keep the audience you build. DeHub is built by the team behind First Class Agency, the UK’s number-one official TikTok LIVE partner agency, with more than 1,000 live streamers.',
  proof: [
    { value: '50,000+', label: 'concurrent viewers on DeHub live streaming' },
    { value: '99.99%', label: 'uptime across streaming services' },
    { value: 'Sub-200ms', label: 'global latency on DeHub’s own CDN' },
  ],
  reasons: [
    {
      title: 'Tips that land in your wallet',
      body: 'Viewers tip and send gifts while you are live, with tiered gift animations and tip messages read aloud on stream. Tips settle on-chain in DeHub tokens and land directly in your wallet rather than being clipped on the way through.',
    },
    {
      title: 'An audience you own',
      body: 'Your followers are not a row in someone else’s database. Streams and uploads can be minted on-chain to your wallet, the feed is chronological, and the code is open source, so nobody quietly rewrites the rules.',
    },
    {
      title: 'Earn from everyone you bring',
      body: 'Your invite link pays you 20% of the activity of everyone who joins through it, plus 5% recurring from the people they go on to invite, paid in DeHub tokens.',
    },
    {
      title: 'Live stages',
      body: 'Host live audio Stages for questions, collabs and watch parties. Announce one ahead of time with a card your audience can share, and listen back to recorded ones.',
    },
    {
      title: 'Post everywhere at once',
      body: 'Connect your other accounts once and publish to X, Instagram, YouTube, TikTok, Farcaster and eight more platforms from the DeHub composer. Keep TikTok as your discovery engine while you build an audience you own.',
    },
    {
      title: 'Bring your channel with you',
      body: 'Import a whole YouTube channel, or a TikTok, Vimeo or SoundCloud profile, in one batch. The exact price is shown in DeHub tokens before you pay.',
    },
  ],
  faq: [
    {
      q: 'Is it free to stream on DeHub?',
      a: 'Yes. DeHub is free to join and free to post, and minting a stream on-chain is optional. Importing a channel is paid, and its price is shown before you pay.',
    },
    {
      q: 'Do I have to stop streaming on TikTok or Twitch?',
      a: 'No. Keep streaming where your audience is today and build on DeHub alongside it. Cross-post from the DeHub composer so every platform you already use points back to the audience you own.',
    },
    {
      q: 'Can I stream with OBS?',
      a: 'Yes. Pick OBS when you go live and DeHub gives you a permanent stream key for OBS, Streamlabs or any RTMP encoder. You can also go live straight from your phone, your browser or a capture card.',
    },
    {
      q: 'How do I get paid?',
      a: 'Viewers tip and send gifts during your stream, and those settle on-chain in DeHub tokens straight to your wallet. Uploads can also be free, pay-per-view or token-gated.',
    },
    {
      q: 'How does my invite link work?',
      a: 'Open the affiliate page to get your link. Anyone who joins through it is attributed to you, and you earn 20% of their activity plus 5% recurring from the people they invite, paid in DeHub tokens.',
    },
  ],
};

/** FAQPage node built from the same questions the page renders. */
export function streamFaqLd() {
  return {
    '@type': 'FAQPage',
    mainEntity: STREAM_PAGE.faq.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

/** An affiliate's invite that lands on this page, e.g. https://dehub.io/r/ABC123?to=/stream. */
export function streamerInviteLink(origin, code) {
  return `${origin.replace(/\/+$/, '')}/r/${code}?to=${STREAM_PAGE.path}`;
}
