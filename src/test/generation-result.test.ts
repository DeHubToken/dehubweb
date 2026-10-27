// @vitest-environment node
import { expect, it, vi } from 'vitest';
vi.mock('../../supabase/functions/_shared/auth.ts', () => ({ serviceClient: vi.fn() }));
import { compactGenerationResult, hydrateGenerationResult } from '../../supabase/functions/_shared/generation-result';

it('keeps inline bytes when no durable storage exists', () => {
  const result = { imageUrl: 'data:image/png;base64,AA', savePending: true };
  compactGenerationResult(result, null);
  expect(result.imageUrl).toBe('data:image/png;base64,AA');
});
it('compacts only the archived media and restores fresh private links on every replay', async () => {
  const result: any = { imageUrl: 'data:image/png;base64,AA', image: 'data:image/png;base64,BB', libraryId: 'job' };
  compactGenerationResult(result, 'wallet/job/original');
  expect(result.imageUrl).toBeUndefined();
  expect(result.image).toBe('data:image/png;base64,BB');
  const sign = vi.fn().mockResolvedValueOnce({ data: { signedUrl: 'https://storage.invalid/first' } })
    .mockResolvedValueOnce({ data: { signedUrl: 'https://storage.invalid/second' } });
  const db: any = { storage: { from: () => ({ createSignedUrl: sign }) } };
  const job = { wallet_address: 'wallet', id: 'job', result };
  expect((await hydrateGenerationResult(job, db)).imageUrl).toContain('/first');
  expect((await hydrateGenerationResult(job, db)).imageUrl).toContain('/second');
  expect(result.imageUrl).toBeUndefined();
  expect(sign).toHaveBeenCalledWith('wallet/job/original', 3600);
});
it('refuses a storage reference belonging to another wallet', async () => {
  await expect(hydrateGenerationResult({ wallet_address: 'owner', id: 'job', result: { storedMedia: { imageUrl: 'other/job/original' } } }, {} as any))
    .rejects.toThrow('Invalid saved media reference');
});
