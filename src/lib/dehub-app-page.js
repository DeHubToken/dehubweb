/**
 * /dehub-app — the landing page for the "Riftn app" brand query.
 *
 * People who search for the app by name arrive from CoinGecko, CMC, the Play
 * Store and press coverage, and this page answers the query directly: what Riftn
 * is and where to get it.
 *
 * Plain JS for the same reason as reserved-usernames.js: the SPA page
 * (src/pages/DehubAppPage.tsx) and the crawler HTML in CLOUDFLARE_WORKER_SEO.js
 * both render from this one object, so the two UA variants cannot drift.
 */

const APP_URL = 'https://riftn.com';

export const DEHUB_APP_LINKS = {
  googlePlay: 'https://play.google.com/store/apps/details?id=io.dehub.mobile',
  appStore: 'https://apps.apple.com/app/id6770382811',
  web: `${APP_URL}/`,
  apk: `${APP_URL}/apk`,
  whatIsDehub: `${APP_URL}/guides/what-is-dehub`,
};

export const DEHUB_APP_PAGE = {
  path: '/dehub-app',
  title: 'Riftn App | Download for Android, iPhone & Web',
  description: 'Get the Riftn app: open-source, user-owned social media with live streaming, encrypted messaging and watch-to-earn. Free on Google Play, the App Store and the web.',
  heading: 'The Riftn App',
  intro: [
    'Riftn is a decentralised social network and mobile app, in development since 2021, where posts can be minted on-chain and creators keep their audience, their content and their revenue.',
    'It combines a chronological feed, live streaming, end-to-end encrypted messaging, user-run communities, a multi-chain wallet and watch-to-earn rewards paid in tokens. The same account works on Android, iPhone and in any modern browser.',
  ],
  faq: [
    {
      q: 'Is the Riftn app free?',
      a: 'Yes. Riftn is free to download from Google Play and the App Store, and free to use in the browser at riftn.com.',
    },
    {
      q: 'Which devices does Riftn run on?',
      a: 'Android phones through Google Play or the direct APK download, iPhone through the App Store, and any modern desktop or mobile browser at riftn.com.',
    },
    {
      q: 'Can I install Riftn on Android without Google Play?',
      a: 'Yes. The latest Android build is published by Riftn as a direct APK download at riftn.com/apk, for Android 8 and up.',
    },
    {
      q: 'What can I do in the Riftn app?',
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
