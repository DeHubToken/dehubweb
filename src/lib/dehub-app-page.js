/**
 * /dehub-app — the landing page for the "DeHub app" brand query.
 *
 * People who search for the app by name arrive from CoinGecko, CMC, the Play
 * Store and press coverage, and the name is shared with DePaul's student
 * portal and a handful of other products. This page answers the query
 * directly: what DeHub is, where to get it, and which DeHub it is not.
 *
 * Plain JS for the same reason as reserved-usernames.js: the SPA page
 * (src/pages/DehubAppPage.tsx) and the crawler HTML in CLOUDFLARE_WORKER_SEO.js
 * both render from this one object, so the two UA variants cannot drift.
 */

const APP_URL = 'https://dehub.io';

export const DEHUB_APP_LINKS = {
  googlePlay: 'https://play.google.com/store/apps/details?id=io.dehub.mobile',
  appStore: 'https://apps.apple.com/app/id6770382811',
  web: `${APP_URL}/`,
  apk: `${APP_URL}/apk`,
  disambiguation: `${APP_URL}/guides/dehub-vs-depaul-dehub-vs-rowan-dehub`,
  whatIsDehub: `${APP_URL}/guides/what-is-dehub`,
};

export const DEHUB_APP_PAGE = {
  path: '/dehub-app',
  title: 'DeHub App — Download for Android, iPhone & Web',
  description: 'Get the DeHub app: open-source, user-owned social media with live streaming, encrypted messaging and watch-to-earn. Free on Google Play, the App Store and the web.',
  heading: 'The DeHub App',
  intro: [
    'DeHub is a decentralised social network and mobile app, in development since 2021, where posts can be minted on-chain and creators keep their audience, their content and their revenue.',
    'It combines a chronological feed, live streaming, end-to-end encrypted messaging, user-run communities, a multi-chain wallet and watch-to-earn rewards paid in tokens. The same account works on Android, iPhone and in any modern browser.',
  ],
  faq: [
    {
      q: 'Is DeHub the DePaul University app?',
      a: 'No. DeHub at dehub.io is an independent open-source social media platform. DePaul University’s DeHUB student portal, Rowan’s DEHub and the deHUB Access door-entry app are unrelated products that happen to share the name.',
    },
    {
      q: 'Is the DeHub app free?',
      a: 'Yes. DeHub is free to download from Google Play and the App Store, and free to use in the browser at dehub.io.',
    },
    {
      q: 'Which devices does DeHub run on?',
      a: 'Android phones through Google Play or the direct APK download, iPhone through the App Store, and any modern desktop or mobile browser at dehub.io.',
    },
    {
      q: 'Can I install DeHub on Android without Google Play?',
      a: 'Yes. The latest Android build is published by DeHub as a direct APK download at dehub.io/apk, for Android 8 and up.',
    },
    {
      q: 'What can I do in the DeHub app?',
      a: 'Post to a chronological feed, go live or watch live streams, message friends with end-to-end encryption, join and run communities, hold tokens in a built-in multi-chain wallet and earn rewards for watching.',
    },
  ],
};

/** FAQPage node built from the same questions the page renders. */
export function dehubAppFaqLd() {
  return {
    '@type': 'FAQPage',
    mainEntity: DEHUB_APP_PAGE.faq.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}
