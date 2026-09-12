import { beforeEach, expect, it, vi } from 'vitest';
import { currentMintFeeRecipient } from '@/lib/contracts/mint-fee-recipient';
import { getMintFee } from '@/lib/api/dehub/content';
vi.mock('@/lib/api/dehub/content', () => ({ getMintFee: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
it('gets the current destination for an already-open composer', async () => {
  const recipient = '0x00Fbd6854BCCe7B94B549E61370578bbD8Bb646B';
  vi.mocked(getMintFee).mockResolvedValue({ chainId: 8453, chargeable: true, recipient } as any);
  expect(await currentMintFeeRecipient(8453)).toBe(recipient);
  expect(getMintFee).toHaveBeenCalledWith(8453);
});
it.each([null, { chainId: 56, chargeable: true, recipient: '0x00Fbd6854BCCe7B94B549E61370578bbD8Bb646B' },
  { chainId: 8453, chargeable: true, recipient: 'invalid' }, { chainId: 8453, chargeable: false }])
('refuses an unavailable, invalid or wrong-chain destination', async quote => {
  vi.mocked(getMintFee).mockResolvedValue(quote as any);
  await expect(currentMintFeeRecipient(8453)).rejects.toThrow('destination');
});
