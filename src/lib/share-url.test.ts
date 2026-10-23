import { afterEach, describe, expect, it, vi } from 'vitest';
import { setViewerAffiliateCode, viewerShareUrl, withAffiliateRef } from './share-url';

const findAffiliateCode = vi.fn();
vi.mock('@/lib/affiliate', () => ({
  findAffiliateCode: (address: string) => findAffiliateCode(address),
  getOrCreateAffiliateCode: vi.fn(),
}));
vi.mock('@/lib/affiliateRef', () => ({ getPersistedViewerAddress: () => null }));

const ALICE = '0x00000000000000000000000000000000000000a1';
const BOB = '0x00000000000000000000000000000000000000b2';

afterEach(() => {
  setViewerAffiliateCode(null);
  findAffiliateCode.mockReset();
});

describe('withAffiliateRef', () => {
  it('adds ref to absolute and root-relative links, keeping query and hash', () => {
    expect(withAffiliateRef('https://dehub.io/app/post/12', 'ABC123')).toBe('https://dehub.io/app/post/12?ref=ABC123');
    expect(withAffiliateRef('https://dehub.io/app/post/12?comment=4#top', 'ABC123'))
      .toBe('https://dehub.io/app/post/12?comment=4&ref=ABC123#top');
    expect(withAffiliateRef('/newpost/7', 'ABC123')).toBe('/newpost/7?ref=ABC123');
  });

  it('replaces a ref already on the link with the sharer’s own', () => {
    expect(withAffiliateRef('https://dehub.io/alice?ref=OTHER', 'MINE')).toBe('https://dehub.io/alice?ref=MINE');
  });

  it('leaves the link alone without a code or when it cannot be parsed', () => {
    expect(withAffiliateRef('https://dehub.io/alice', null)).toBe('https://dehub.io/alice');
    expect(withAffiliateRef('not a url', 'ABC123')).toBe('not a url');
  });
});

describe('viewerShareUrl', () => {
  it('is unchanged while no viewer code is set', () => {
    expect(viewerShareUrl('https://dehub.io/app/post/1')).toBe('https://dehub.io/app/post/1');
  });

  it('credits the viewer on DeHub links only', () => {
    setViewerAffiliateCode('ALICE01');
    expect(viewerShareUrl('https://dehub.io/app/post/1')).toBe('https://dehub.io/app/post/1?ref=ALICE01');
    expect(viewerShareUrl('/alice')).toBe('/alice?ref=ALICE01');
    expect(viewerShareUrl('https://example.com/page')).toBe('https://example.com/page');
  });
});

describe('loadViewerAffiliateCode', () => {
  const load = async () => {
    vi.resetModules();
    const shareUrl = await import('./share-url');
    const loader = await import('./useAffiliateShareUrl');
    return { ...shareUrl, ...loader };
  };

  it('looks the code up once per wallet and applies it', async () => {
    findAffiliateCode.mockResolvedValue({ code: 'ALICE01', share_name: null });
    const m = await load();
    await m.loadViewerAffiliateCode(ALICE);
    await m.loadViewerAffiliateCode(ALICE);
    expect(findAffiliateCode).toHaveBeenCalledTimes(1);
    expect(m.viewerShareUrl('https://dehub.io/x')).toBe('https://dehub.io/x?ref=ALICE01');
  });

  it('leaves links plain for a viewer with no code', async () => {
    findAffiliateCode.mockResolvedValue(null);
    const m = await load();
    await m.loadViewerAffiliateCode(ALICE);
    expect(m.viewerShareUrl('https://dehub.io/x')).toBe('https://dehub.io/x');
  });

  it('drops a lookup that finishes after sign-out', async () => {
    let resolve: (v: unknown) => void = () => {};
    findAffiliateCode.mockReturnValue(new Promise((r) => { resolve = r; }));
    const m = await load();
    const pending = m.loadViewerAffiliateCode(ALICE);
    m.setViewerAffiliateCode(null);
    resolve({ code: 'ALICE01', share_name: null });
    await pending;
    expect(m.viewerShareUrl('https://dehub.io/x')).toBe('https://dehub.io/x');
  });

  it('never applies one account’s code to another', async () => {
    findAffiliateCode.mockImplementation(async (a: string) => ({ code: a === ALICE ? 'ALICE01' : 'BOB0001', share_name: null }));
    const m = await load();
    await m.loadViewerAffiliateCode(ALICE);
    await m.loadViewerAffiliateCode(BOB);
    expect(m.viewerShareUrl('https://dehub.io/x')).toBe('https://dehub.io/x?ref=BOB0001');
  });
});
