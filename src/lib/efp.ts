/**
 * "Also on EFP" (efp.app): the person's wallet mints an EFP list and makes
 * Riftn's relayer its manager; the backend (src/follow-graph/efp.service)
 * then writes their follows to it. The built-in wallet does both in one
 * sponsored transaction; an own wallet sends two and pays a few cents on Base.
 */
import { Interface } from 'ethers';
import { apiCall } from '@/lib/api/dehub/core';
import { readConnectionSource } from '@/lib/connection-source';

export type EfpStatus = 'none' | 'pending' | 'on' | 'off';
export interface EfpState { status: EfpStatus; synced: number; error: string | null }
export type EfpTurnOn = 'on' | 'already-has-list' | 'no-gas' | 'failed';

interface Setup { ok: boolean; status?: EfpStatus; error?: string; chainId?: number; calls?: Array<{ to: string; data: `0x${string}` }> }

const BASE = 8453;
const NO_ABI = new Interface([]);

export async function efpState(): Promise<EfpState | null> {
  const r = await apiCall<{ result: EfpState }>('/api/follow_graph/efp', { requiresAuth: true }).catch(() => null);
  return r?.result ?? null;
}

export async function turnOnEfp(): Promise<EfpTurnOn> {
  const setup = (await apiCall<{ result: Setup }>('/api/follow_graph/efp/setup', { method: 'POST', requiresAuth: true }).catch(() => null))?.result;
  if (!setup) return 'failed';
  if (setup.status === 'on') return 'on';
  if (setup.error === 'already-has-list') return 'already-has-list';
  if (!setup.ok || !setup.calls?.length) return 'failed';
  try {
    const aa = await import('@/lib/contracts/aa-utils');
    if (readConnectionSource() === 'wagmi') {
      for (const call of setup.calls) {
        const tx = await aa.writeContractAA(call.to, NO_ABI, 'efp', [], { calldata: call.data, chainId: BASE, context: 'EFP list' });
        const receipt = await tx.wait();
        if (receipt.status !== 1) return 'failed';
      }
    } else {
      await aa.writeBatchAA(setup.calls.map((c) => ({ to: c.to, data: c.data })), { chainId: BASE, context: 'EFP list' });
    }
  } catch (e) {
    return /INSUFFICIENT_GAS_FUNDS|insufficient funds/i.test(String((e as Error)?.message ?? e)) ? 'no-gas' : 'failed';
  }
  // The chain read can trail the receipt by a block or two.
  for (let i = 0; i < 5; i++) {
    const r = (await apiCall<{ result: Setup }>('/api/follow_graph/efp/confirm', { method: 'POST', requiresAuth: true }).catch(() => null))?.result;
    if (r?.ok) return 'on';
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return 'failed';
}

export async function turnOffEfp(): Promise<void> {
  await apiCall('/api/follow_graph/efp/off', { method: 'POST', requiresAuth: true }).catch(() => null);
}
