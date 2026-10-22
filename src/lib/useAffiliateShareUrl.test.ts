import { afterEach, describe, expect, it, vi } from 'vitest';

const findAffiliateCode = vi.fn();
const getPersistedViewerAddress = vi.fn<() => string | null>();

vi.mock('@/lib/affiliate', () => ({
  findAffiliateCode: (address: string) => findAffiliateCode(address),
  getOrCreateAffiliateCode: vi.fn(),
}));
vi.mock('@/lib/affiliateRef', () => ({
  getPersistedViewerAddress: () => getPersistedViewerAddress(),
}));

const ALICE = '0x00000000000000000000000000000000000000a1';
const BOB = '0x00000000000000000000000000000000000000b2';

const load = async () => {
  vi.resetModules();
  return import('./useAffiliateShareUrl');
};

afterEach(() => {
  findAffiliateCode.mockReset();
  getPersistedViewerAddress.mockReset();
});

describe('withAffiliateRef', () => {
  it('adds ref to absolute and root-relative links, keeping query and hash', async () => {
    const { withAffiliateRef } = await load();
    expect(withAffiliateRef('https://dehub.io/app/post/12', 'ABC123')).toBe('https://dehub.io/app/post/12?ref=ABC123');
    expect(withAffiliateRef('https://dehub.io/app/post/12?comment=4#top', 'ABC123'))
      .toBe('https://dehub.io/app/post/12?comment=4&ref=ABC123#top');
    expect(withAffiliateRef('/newpost/7', 'ABC123')).toBe('/newpost/7?ref=ABC123');
  });

  it('replaces a ref already on the link with the sharer’s own', async () => {
    const { withAffiliateRef } = await load();
    expect(withAffiliateRef('https://dehub.io/alice?ref=OTHER', 'MINE')).toBe('https://dehub.io/alice?ref=MINE');
  });

  it('leaves the link alone without a code or when it cannot be parsed', async () => {
    const { withAffiliateRef } = await load();
    expect(withAffiliateRef('https://dehub.io/alice', null)).toBe('https://dehub.io/alice');
    expect(withAffiliateRef('not a url', 'ABC123')).toBe('not a url');
  });
});

describe('viewerShareUrl', () => {
  it('is unchanged for a signed-out viewer and never looks anything up', async () => {
    getPersistedViewerAddress.mockReturnValue(null);
    const { viewerShareUrl } = await load();
    expect(viewerShareUrl('https://dehub.io/app/post/1')).toBe('https://dehub.io/app/post/1');
    expect(findAffiliateCode).not.toHaveBeenCalled();
  });

  it('credits the signed-in viewer once their code has loaded', async () => {
    getPersistedViewerAddress.mockReturnValue(ALICE);
    findAffiliateCode.mockResolvedValue({ code: 'ALICE01', share_name: null });
    const { viewerShareUrl, loadViewerAffiliateCode } = await load();
    await loadViewerAffiliateCode();
    expect(viewerShareUrl('https://dehub.io/app/post/1')).toBe('https://dehub.io/app/post/1?ref=ALICE01');
    expect(viewerShareUrl('https://dehub.io/app/post/2')).toBe('https://dehub.io/app/post/2?ref=ALICE01');
    expect(findAffiliateCode).toHaveBeenCalledTimes(1);
  });

  it('is unchanged for a viewer with no code', async () => {
    getPersistedViewerAddress.mockReturnValue(ALICE);
    findAffiliateCode.mockResolvedValue(null);
    const { viewerShareUrl, loadViewerAffiliateCode } = await load();
    await loadViewerAffiliateCode();
    expect(viewerShareUrl('https://dehub.io/alice')).toBe('https://dehub.io/alice');
  });

  it('never applies one account’s code to another', async () => {
    getPersistedViewerAddress.mockReturnValue(ALICE);
    findAffiliateCode.mockResolvedValue({ code: 'ALICE01', share_name: null });
    const { viewerShareUrl, loadViewerAffiliateCode } = await load();
    await loadViewerAffiliateCode();
    getPersistedViewerAddress.mockReturnValue(BOB);
    expect(viewerShareUrl('https://dehub.io/app/post/1')).toBe('https://dehub.io/app/post/1');
    expect(findAffiliateCode).toHaveBeenLastCalledWith(BOB);
  });

  it('does not tag links that leave DeHub', async () => {
    getPersistedViewerAddress.mockReturnValue(ALICE);
    findAffiliateCode.mockResolvedValue({ code: 'ALICE01', share_name: null });
    const { viewerShareUrl, loadViewerAffiliateCode } = await load();
    await loadViewerAffiliateCode();
    expect(viewerShareUrl('https://example.com/page')).toBe('https://example.com/page');
  });
});
