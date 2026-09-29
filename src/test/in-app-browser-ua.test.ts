/**
 * The worker serves prerendered crawler HTML to bot user agents and the React
 * SPA to everyone else, and for two years it decided which was which from a
 * list of brand words: `twitter`, `linkedin`, `whatsapp`, `facebook`.
 *
 * Those words are in the user agent of the app's IN-APP BROWSER too, which
 * belongs to a person. So tapping a shared DeHub link inside X, LinkedIn or
 * WhatsApp landed on the crawler page — a static block of meta tags whose one
 * control is a link back to its own URL. That link was classified the same
 * way and answered with the same page, which is why "View on DeHub" appeared
 * to do nothing. It applied to every shared post, profile, doc and referral
 * landing: exactly the traffic sharing exists to create.
 *
 * The discriminator is the rendering engine, not the brand. Assertions run
 * the real classifier over real user agents rather than checking how the
 * pattern is spelled, so a rewrite that keeps the behaviour stays green.
 */
import { describe, expect, it } from 'vitest';
import { appHref, isCrawlerUa } from '../../CLOUDFLARE_WORKER_SEO.js';

/** In-app browsers. Every one of these is a person who tapped a link. */
const IN_APP_BROWSERS: Record<string, string> = {
  'X for iPhone':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21A329 Twitter for iPhone/10.31',
  'X for Android':
    'Mozilla/5.0 (Linux; Android 13; SM-S911B Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.144 Mobile Safari/537.36 TwitterAndroid',
  LinkedIn:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 LinkedInApp',
  WhatsApp:
    'Mozilla/5.0 (Linux; Android 13; SM-S911B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 WhatsApp/2.24.1.75 A',
  Facebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21A329 [FBAN/FBIOS;FBAV/446.0.0.35.108;FBBV/1;FBDV/iPhone14,2;]',
  Instagram:
    'Mozilla/5.0 (Linux; Android 12; SM-A515F Build/SP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/108.0.5359.128 Mobile Safari/537.36 Instagram 262.0.0.20.109 Android (31/12; 420dpi; 1080x2160; samsung; SM-A515F; a51; exynos9611; en_GB; 411893430)',
  Telegram:
    'Mozilla/5.0 (Linux; Android 13; SM-S911B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36',
};

const REAL_BROWSERS: Record<string, string> = {
  'Chrome Android':
    'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  'Safari iOS':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Firefox desktop':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Chrome desktop':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Edge desktop':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  'Safari macOS':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Samsung Internet':
    'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  // A Mastodon or Bluesky client's in-app browser is a person, even though its
  // UA names the network the preview fetchers above are matched on.
  'Mastodon app WebView':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Mastodon/2.6',
  'Bluesky app WebView':
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36 Bluesky',
};

/**
 * The crawlers the prerendered HTML exists for. The brand-word entries here
 * are the ones the fix had to keep: dropping `whatsapp` outright would have
 * traded a dead button for a dead unfurl.
 */
const CRAWLERS: Record<string, string> = {
  facebookexternalhit: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'facebookexternalhit (compatible)':
    'Mozilla/5.0 (compatible; facebookexternalhit/1.1; +http://www.facebook.com/externalhit_uatext.php)',
  'meta-externalagent':
    'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
  Twitterbot: 'Twitterbot/1.0',
  LinkedInBot: 'Mozilla/5.0 (compatible; LinkedInBot/1.0; +https://www.linkedin.com)',
  'WhatsApp preview (Android)': 'WhatsApp/2.23.20.0 A',
  'WhatsApp preview (iOS)': 'WhatsApp/2.2140.12 N',
  TelegramBot: 'TelegramBot (like TwitterBot)',
  Slackbot: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  'Slack-ImgProxy': 'Slack-ImgProxy (+https://api.slack.com/robots)',
  Discordbot: 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
  'Googlebot (smartphone)':
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.76 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Googlebot (classic)': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Google-InspectionTool':
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.76 Mobile Safari/537.36 (compatible; Google-InspectionTool/1.0)',
  GoogleOther: 'Mozilla/5.0 (compatible; GoogleOther)',
  'APIs-Google': 'APIs-Google (+https://developers.google.com/webmasters/APIs-Google.html)',
  FeedFetcher: 'FeedFetcher-Google; (+http://www.google.com/feedfetcher.html)',
  Applebot:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)',
  bingbot: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  curl: 'curl/8.4.0',
  Wget: 'Wget/1.21.3',
  'python-requests': 'python-requests/2.31.0',
  okhttp: 'okhttp/4.12.0',
  'Go-http-client': 'Go-http-client/2.0',
  Java: 'Java/17.0.2',
  axios: 'axios/1.6.7',
  'node-fetch': 'node-fetch/1.0 (+https://github.com/bitinn/node-fetch)',
  PostmanRuntime: 'PostmanRuntime/7.36.0',
  // Link previewers and fetchers that name no bot. Each of these unfurled every
  // DeHub link as the homepage card until it was listed.
  'Bluesky Cardyb': 'Mozilla/5.0 (compatible; Bluesky Cardyb/1.1; +mailto:support@bsky.app)',
  'Mastodon < 4.2': 'http.rb/5.1.1 (Mastodon/4.1.0; +https://mastodon.social/)',
  SkypeUriPreview:
    'Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5 skype-url-preview@microsoft.com',
  'SkypeUriPreview (WebKit)':
    'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) SkypeUriPreview Preview/0.5 skype-url-preview@microsoft.com',
  Embedly: 'Mozilla/5.0 (compatible; Embedly/0.2; +http://support.embed.ly/)',
  Iframely: 'Iframely/1.3.1 (+https://iframely.com/docs/about)',
  'Iframely (compatible)': 'Mozilla/5.0 (compatible; Iframely/1.3.1; +https://iframely.com/docs/about)',
  vkShare: 'Mozilla/5.0 (compatible; vkShare; +http://vk.com/dev/Share)',
  'Google Chat / snippet':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/49.0.2623.75 Safari/537.36 Google-PageRenderer Google (+https://developers.google.com/+/web/snippet/)',
  'Claude-User':
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)',
  'Claude-User (bare)': 'Claude-User/1.0',
  'Perplexity-User':
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)',
  'Perplexity-User (bare)': 'Perplexity-User/1.0',
  'Naver Yeti': 'Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)',
  'Yahoo! Slurp': 'Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)',
};

describe('in-app browsers are people, not crawlers', () => {
  for (const [app, ua] of Object.entries(IN_APP_BROWSERS)) {
    it(`serves the app to the ${app} in-app browser`, () => {
      expect(isCrawlerUa(ua)).toBe(false);
    });
  }

  for (const [name, ua] of Object.entries(REAL_BROWSERS)) {
    it(`serves the app to ${name}`, () => {
      expect(isCrawlerUa(ua)).toBe(false);
    });
  }
});

describe('link-preview crawlers still get the prerendered HTML', () => {
  for (const [name, ua] of Object.entries(CRAWLERS)) {
    it(`prerenders for ${name}`, () => {
      expect(isCrawlerUa(ua)).toBe(true);
    });
  }
});

describe('appHref', () => {
  it('marks a bare URL', () => {
    expect(appHref('https://dehub.io/r/ABC')).toBe('https://dehub.io/r/ABC?app=1');
  });

  it('appends to a URL that already has a query', () => {
    expect(appHref('https://dehub.io/app/post/7?ref=x')).toBe(
      'https://dehub.io/app/post/7?ref=x&app=1',
    );
  });

  /**
   * The worker rewrites the ssr-seo function's own button, and that function
   * emits the marker itself now — so this runs over an already-marked URL
   * whenever the two are in step.
   */
  it('leaves an already-marked URL alone', () => {
    expect(appHref('https://dehub.io/r/ABC?app=1')).toBe('https://dehub.io/r/ABC?app=1');
  });
});
