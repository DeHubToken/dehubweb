import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyMessage } from 'ethers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- request bodies of any shape
const calls: Array<{ path: string; body: any }> = [];
vi.mock('@/lib/api/dehub/core', () => ({
  apiCall: vi.fn(async (path: string, opts?: { body?: unknown }) => {
    calls.push({ path, body: opts?.body });
    if (path === '/api/follow_graph/me/unsigned') return { result: ['0x' + 'b'.repeat(40)] };
    return { status: true };
  }),
}));
vi.mock('@/lib/connection-source', () => ({ readConnectionSource: () => 'web3auth' }));
vi.mock('@/lib/smart-wallet', () => ({ getEoaProvider: () => ({}) }));
vi.mock('@/lib/contracts/aa-utils', () => ({ getActiveProvider: async () => ({ provider: { request: async ({ method }: { method: string }) => (method === 'eth_accounts' ? [W] : walletSign()) } }) }));
const walletSign = vi.fn(async () => '0xsig');
vi.mock('@/lib/dm-e2ee/signer', () => ({ signEncryptionMessage: () => walletSign() }));

import { keyMessage, proofMessage, signFollow } from '@/lib/follow-graph';

const W = '0x' + '1'.repeat(40);
const A = '0x' + 'a'.repeat(40);

describe('follow graph signing', () => {
  beforeEach(() => { localStorage.clear(); calls.length = 0; localStorage.setItem('dehub_wallet', W); });

  it('formats match the backend', () => {
    expect(proofMessage('follow', W, A, 5)).toBe(`riftn-follow:v1:follow:${W}:${A}:5`);
    expect(keyMessage(W, A, new Date('2026-11-12T00:00:00Z'))).toContain(`Let this key sign my follows and unfollows:\n${A}\n\nWallet: ${W}\nIssued: 2026-11-12T00:00:00.000Z`);
  });

  it('approves a key once, then signs the follow and the backlog with it', async () => {
    signFollow('follow', A);
    await vi.waitFor(() => expect(calls.filter(c => c.path === '/api/follow_graph/proofs').length).toBe(2));
    const key = calls.find(c => c.path === '/api/follow_graph/keys')!.body.key.toLowerCase();
    expect(walletSign).toHaveBeenCalledTimes(1);
    const [first, backlog] = calls.filter(c => c.path === '/api/follow_graph/proofs').map(c => c.body.proofs[0]);
    expect(verifyMessage(proofMessage('follow', W, A, first.at), first.signature).toLowerCase()).toBe(key);
    expect(backlog.target).toBe('0x' + 'b'.repeat(40));
    signFollow('unfollow', A);
    await vi.waitFor(() => expect(calls.filter(c => c.path === '/api/follow_graph/proofs').length).toBe(3));
    expect(walletSign).toHaveBeenCalledTimes(1);
  });
});
