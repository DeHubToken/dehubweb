import { describe, it, expect, vi, beforeEach } from 'vitest';

let setup: Record<string, unknown> = {};
let source = 'web3auth';
const paths: string[] = [];
vi.mock('@/lib/api/dehub/core', () => ({
  apiCall: vi.fn(async (path: string) => {
    paths.push(path);
    if (path.endsWith('/efp/setup')) return { result: setup };
    if (path.endsWith('/efp/confirm')) return { result: { ok: true, status: 'on' } };
    return { result: { status: 'on', synced: 2, error: null } };
  }),
}));
vi.mock('@/lib/connection-source', () => ({ readConnectionSource: () => source }));
const writeBatchAA = vi.fn(async () => ({ hash: '0x1', wait: async () => ({ status: 1, hash: '0x1' }) }));
const writeContractAA = vi.fn(async () => ({ hash: '0x2', wait: async () => ({ status: 1, hash: '0x2' }) }));
vi.mock('@/lib/contracts/aa-utils', () => ({ writeBatchAA, writeContractAA }));

import { turnOnEfp } from '@/lib/efp';

const calls = [{ to: '0xmint', data: '0x01' }, { to: '0xrec', data: '0x02' }];

describe('EFP opt-in', () => {
  beforeEach(() => { paths.length = 0; writeBatchAA.mockClear(); writeContractAA.mockClear(); });

  it('built-in wallet: both calls in one sponsored batch, then confirm', async () => {
    source = 'web3auth';
    setup = { ok: true, status: 'pending', calls };
    expect(await turnOnEfp()).toBe('on');
    expect(writeBatchAA).toHaveBeenCalledWith(calls, expect.objectContaining({ chainId: 8453 }));
    expect(writeContractAA).not.toHaveBeenCalled();
    expect(paths).toContain('/api/follow_graph/efp/confirm');
  });

  it('own wallet: two transactions in order', async () => {
    source = 'wagmi';
    setup = { ok: true, status: 'pending', calls };
    expect(await turnOnEfp()).toBe('on');
    expect(writeContractAA).toHaveBeenCalledTimes(2);
  });

  it('says so when the wallet already has an EFP list, without sending anything', async () => {
    setup = { ok: false, error: 'already-has-list' };
    expect(await turnOnEfp()).toBe('already-has-list');
    expect(writeBatchAA).not.toHaveBeenCalled();
  });
});
