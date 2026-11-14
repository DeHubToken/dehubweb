/**
 * Invite landings (/r/<CODE>) must name the inviter's live profile and give
 * the card image a URL that changes with it. Mart's invite kept showing the
 * blank "Brave Mercury" account on X days after his wallet was back on his
 * own profile, because the image URL (…&v=6) never changed and the title came
 * from a saved snapshot. This runs the real worker step over the deployed
 * fn's HTML with the two lookups stubbed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshReferralCard } from '../../CLOUDFLARE_WORKER_SEO.js';

const IMG = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/affiliate-share-image?code=YWXRY67Q&width=1200&height=630&format=png&v=6';
const TITLE = 'Brave Mercury invited you to Riftn, earn, post & build on-chain';
const FN_HTML = `<html><head>
<title>${TITLE}</title>
<link rel="canonical" href="https://riftn.com/r/YWXRY67Q">
<meta property="og:url" content="https://riftn.com/r/YWXRY67Q">
<meta property="og:title" content="${TITLE}">
<meta property="og:image" content="${IMG}">
<meta property="og:image:alt" content="${TITLE}">
<meta name="twitter:url" content="https://riftn.com/r/YWXRY67Q">
<meta name="twitter:title" content="${TITLE}">
<meta name="twitter:image" content="${IMG}">
<script type="application/ld+json">{"name":"${TITLE}","url":"https://riftn.com/r/YWXRY67Q","image":"${IMG}"}</script>
</head><body><h1>${TITLE}</h1><img src="${IMG}" alt="${TITLE}"></body></html>`;

const MART = {
  _id: '6571c746ee75ac0d37c7026b',
  address: '0x684012bc9bfbfc987d8d0e1b13a2fdb31caba3b6',
  displayName: 'Mart Vader',
  username: 'martvader',
  avatarImageUrl: 'statics/avatars/0x684012bc9bfbfc987d8d0e1b13a2fdb31caba3b6.png',
};

function stubLookups(account: Record<string, unknown> | null) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/rest/v1/affiliate_codes')) {
      return new Response(JSON.stringify([{ owner_address: MART.address }]), { status: 200 });
    }
    if (url.includes('/account_info/')) {
      return account ? new Response(JSON.stringify({ result: account }), { status: 200 }) : new Response('down', { status: 502 });
    }
    throw new Error(`unexpected fetch ${url}`);
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('refreshReferralCard', () => {
  it('names the live profile everywhere the snapshot name was', async () => {
    stubLookups(MART);
    const out = await refreshReferralCard(FN_HTML, '/r/YWXRY67Q', 'https://riftn.com/r/YWXRY67Q');
    expect(out).not.toContain('Brave Mercury');
    expect(out).toContain('<meta property="og:title" content="Mart Vader invited you to Riftn');
    expect(out).toContain('"name":"Mart Vader invited you to Riftn');
    expect(out).toContain('<h1>Mart Vader invited you to Riftn');
  });

  it('versions every card image URL by the profile, and a new name is a new URL', async () => {
    stubLookups(MART);
    const out = await refreshReferralCard(FN_HTML, '/r/YWXRY67Q', 'https://riftn.com/r/YWXRY67Q');
    const urls = [...out.matchAll(/affiliate-share-image\?[^"]*/g)].map((m) => m[0]);
    expect(urls).toHaveLength(4);
    for (const url of urls) expect(url).toMatch(/&v=8-[0-9a-z]+$/);
    expect(new Set(urls).size).toBe(1);

    stubLookups({ ...MART, displayName: 'Mart' });
    const renamed = await refreshReferralCard(FN_HTML, '/r/YWXRY67Q', 'https://riftn.com/r/YWXRY67Q');
    const renamedUrl = renamed.match(/affiliate-share-image\?[^"]*/)?.[0];
    expect(renamedUrl).toMatch(/&v=8-/);
    expect(renamedUrl).not.toBe(urls[0]);
  });

  it('keeps a shared name tag on og:url so the platforms treat it as a new page', async () => {
    stubLookups(MART);
    const out = await refreshReferralCard(FN_HTML, '/r/YWXRY67Q', 'https://riftn.com/r/YWXRY67Q?n=Z95T');
    expect(out).toContain('<meta property="og:url" content="https://riftn.com/r/YWXRY67Q?n=z95t">');
    expect(out).toContain('<meta name="twitter:url" content="https://riftn.com/r/YWXRY67Q?n=z95t">');
  });

  it('leaves the page as the fn made it when the profile cannot be read', async () => {
    stubLookups(null);
    const out = await refreshReferralCard(FN_HTML, '/r/YWXRY67Q', 'https://riftn.com/r/YWXRY67Q');
    expect(out).toBe(FN_HTML);
  });
});
