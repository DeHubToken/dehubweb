import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePostingChain } from '@/hooks/use-posting-chain';
import { getSolanaStatus } from '@/lib/api/dehub/solana';

vi.mock('@/lib/api/dehub/solana', () => ({ getSolanaStatus: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
afterEach(cleanup);

it('defaults to Base for an absent or unsupported saved chain', () => {
  const first = renderHook(usePostingChain);
  expect(first.result.current.chainId).toBe(8453);
  first.unmount();
  localStorage.setItem('dehub_posting_chain', '999999');
  expect(renderHook(usePostingChain).result.current.chainId).toBe(8453);
});

it('updates mounted composers and keeps the choice after reopening', async () => {
  const settings = renderHook(usePostingChain);
  const composer = renderHook(usePostingChain);
  await act(async () => { await settings.result.current.setChainId(56); });
  expect(composer.result.current.chainId).toBe(56);
  composer.unmount();
  expect(renderHook(usePostingChain).result.current.chainId).toBe(56);
});

it('updates a mounted composer when another tab changes the setting', () => {
  const composer = renderHook(usePostingChain);
  act(() => {
    localStorage.setItem('dehub_posting_chain', '1');
    window.dispatchEvent(new StorageEvent('storage', { key: 'dehub_posting_chain' }));
  });
  expect(composer.result.current.chainId).toBe(1);
});

it('keeps the saved chain when Solana minting is unavailable', async () => {
  vi.mocked(getSolanaStatus).mockResolvedValue({ mintingEnabled: false } as Awaited<ReturnType<typeof getSolanaStatus>>);
  const settings = renderHook(usePostingChain);
  await act(async () => { await settings.result.current.setChainId(101); });
  expect(settings.result.current.chainId).toBe(8453);
  expect(localStorage.getItem('dehub_posting_chain')).toBeNull();
});
