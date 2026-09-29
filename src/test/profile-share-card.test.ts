/**
 * A profile's share image is the owner's avatar, which the deployed `ssr-seo`
 * fn advertises as a 400-square `summary` card. X fetches that image fine but
 * draws the card as an empty grey tile, so the proxy branch turns the avatar
 * into a 1200x630 banner (avatar padded onto black by the image transform)
 * and declares `summary_large_image`. These pin the rewrite and what it
 * leaves alone.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const WORKER = readFileSync(resolve(ROOT, 'CLOUDFLARE_WORKER_SEO.js'), 'utf8');

function decl(signature: string): string {
  const start = WORKER.indexOf(signature);
  expect(start, signature).toBeGreaterThan(-1);
  return WORKER.slice(start, WORKER.indexOf('\n}\n', start) + 2);
}

function constant(name: string): string {
  const line = WORKER.match(new RegExp(`^const ${name} = .*$`, 'm'));
  expect(line, name).not.toBeNull();
  return line![0];
}

const { profileBannerCard, repairProxiedImages, CDN_ORIGIN } = new Function(`
  ${constant('APP_URL')}
  ${constant('SHARE_IMAGE')}
  ${constant('CDN_ORIGIN')}
  ${constant('IMAGE_TRANSFORM_BASE')}
  ${decl('function transformedImageUrl(url) {')}
  ${decl('function repairProxiedImages(html) {')}
  ${decl('function profileBannerCard(html) {')}
  return { profileBannerCard, repairProxiedImages, CDN_ORIGIN };
`)() as {
  profileBannerCard: (html: string) => string;
  repairProxiedImages: (html: string) => string;
  CDN_ORIGIN: string;
};

const AVATAR = `${CDN_ORIGIN}/avatars/0x9324840523a5d17dd12a2f11a9472e5a199c1937.jpg`;
const BANNER = `https://dehub.io/cdn-cgi/image/format=jpeg,width=1200,height=630,fit=pad,background=%23000000/${AVATAR}`;

/** A profile head as the fn emits it. */
const profilePage = (image: string, withTwitterImage = true) => `<head>
  <meta property="og:image" content="${image}">
  <meta property="og:image:secure_url" content="${image}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="400">
  <meta property="og:image:height" content="400">
  <meta name="twitter:card" content="summary">
${withTwitterImage ? `  <meta name="twitter:image" content="${image}">\n` : ''}</head>`;

const meta = (html: string, key: string) =>
  (html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`)) || [])[1];

describe('profileBannerCard', () => {
  it('turns the repaired avatar into a 1200x630 large card', () => {
    const out = profileBannerCard(repairProxiedImages(profilePage(AVATAR)));
    expect(meta(out, 'og:image')).toBe(BANNER);
    expect(meta(out, 'og:image:secure_url')).toBe(BANNER);
    expect(meta(out, 'twitter:image')).toBe(BANNER);
    expect(meta(out, 'og:image:width')).toBe('1200');
    expect(meta(out, 'og:image:height')).toBe('630');
    expect(meta(out, 'og:image:type')).toBe('image/jpeg');
    expect(meta(out, 'twitter:card')).toBe('summary_large_image');
  });

  it('accepts the raw CDN avatar too', () => {
    const out = profileBannerCard(profilePage(AVATAR));
    expect(meta(out, 'og:image')).toBe(BANNER);
  });

  it('adds twitter:image when the fn left it out', () => {
    const out = profileBannerCard(profilePage(AVATAR, false));
    expect(meta(out, 'twitter:image')).toBe(BANNER);
  });

  it('leaves a profile without an avatar on its existing card', () => {
    const logo = 'https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/logo/new_logo_Dehub.jpg';
    const html = profilePage(logo);
    expect(profileBannerCard(html)).toBe(html);
  });

  it('leaves non-avatar CDN images alone', () => {
    const html = profilePage(`${CDN_ORIGIN}/images/5595.jpg`);
    expect(profileBannerCard(html)).toBe(html);
  });

  it('only runs on the profile branch of the proxy', () => {
    // …followed only by the logo fallback's true dimensions, for a profile
    // with no avatar to make a banner from.
    expect(WORKER).toMatch(/if \(proxiedHandle\) \{\n\s+html = profileBannerCard\(html\);\n\s+html = logoCardDimensions\(html\);\n\s+\}/);
  });
});
