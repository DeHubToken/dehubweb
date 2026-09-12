import { describe, expect, it, vi, beforeEach } from 'vitest';
import { bountyClaimCall, submitBountyClaim } from '@/lib/bounty-claim';
import { apiCall } from '@/lib/api/dehub/core';
import { getNFTInfo } from '@/lib/api/dehub/feed';
import { writeContractAA } from '@/lib/contracts/aa-utils';

vi.mock('@/lib/api/dehub/core', () => ({ apiCall: vi.fn() }));
vi.mock('@/lib/api/dehub/feed', () => ({ getNFTInfo: vi.fn() }));
vi.mock('@/lib/contracts/aa-utils', () => ({ writeContractAA: vi.fn() }));

const sig = { r: `0x${'11'.repeat(32)}`, s: `0x${'22'.repeat(32)}`, v: 27 };
beforeEach(() => vi.clearAllMocks());

describe('bounty claims', () => {
  it('encodes the legacy commenter signature in contract order', () => {
    expect(bountyClaimCall('5588', 'commentor', 8453, sig).args).toEqual([5588n, sig.r, sig.s, 27, 1]);
    expect(bountyClaimCall('5588', 'viewer', 56, sig).args[4]).toBe(0);
  });
  it('uses the v3 deadline and signature on Robinhood', () => {
    expect(bountyClaimCall('5588', 'commentor', 4663, { deadline: 2000000000, signature: '0xab' }).args)
      .toEqual([5588n, 1, 2000000000, '0xab']);
  });
  it('rejects a signature for the wrong contract version', () => {
    expect(() => bountyClaimCall('5588', 'commentor', 4663, sig)).toThrow();
  });
  it('rechecks eligibility and sends the claim on the post chain', async () => {
    vi.mocked(getNFTInfo).mockResolvedValue({ chainId: 8453 } as any);
    vi.mocked(apiCall).mockResolvedValue({ result: { commentor: sig } });
    const wait = vi.fn().mockResolvedValue({ status: 1 });
    vi.mocked(writeContractAA).mockResolvedValue({ hash: '0x123', wait } as any);
    expect(await submitBountyClaim('5588', 'commentor')).toBe('0x123');
    expect(writeContractAA).toHaveBeenCalledWith(expect.any(String), expect.anything(), 'claimBounty',
      [5588n, sig.r, sig.s, 27, 1], { chainId: 8453, context: 'claim bounty' });
    expect(wait).toHaveBeenCalledWith(1);
  });
  it.each([{ error: 'Not Eligible', result: {} }, { result: { commentor: sig, commentor_claimed: true } }])
    ('does not submit an ineligible or already claimed reward', async response => {
      vi.mocked(getNFTInfo).mockResolvedValue({ chainId: 8453 } as any);
      vi.mocked(apiCall).mockResolvedValue(response);
      await expect(submitBountyClaim('5588', 'commentor')).rejects.toThrow('Not Eligible');
      expect(writeContractAA).not.toHaveBeenCalled();
    });
  it('does not report success for a reverted receipt', async () => {
    vi.mocked(getNFTInfo).mockResolvedValue({ chainId: 8453 } as any);
    vi.mocked(apiCall).mockResolvedValue({ result: { commentor: sig } });
    vi.mocked(writeContractAA).mockResolvedValue({ hash: '0x123', wait: vi.fn().mockResolvedValue({ status: 0 }) } as any);
    await expect(submitBountyClaim('5588', 'commentor')).rejects.toThrow('reverted');
  });
});
