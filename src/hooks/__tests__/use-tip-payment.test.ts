import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendTip: vi.fn(), switchChain: vi.fn(), readTip: vi.fn(), insert: vi.fn(),
  toast: { loading: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('i18next', () => ({ default: { t: (key: string) => key } }));
vi.mock('@/lib/dhb-toast', () => ({ dhbText: (value: string) => value }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ walletAddress: '0xsender' }) }));
vi.mock('@/lib/contracts/dhb-token', () => ({ BASE_CHAIN_ID: 8453 }));
vi.mock('@/lib/contracts/aa-utils', () => ({
  switchChain: mocks.switchChain, isWalletLockedError: () => false,
  parseTxError: (error: Error) => error.message,
}));
vi.mock('@/lib/contracts/stream-controller', () => ({ sendTip: mocks.sendTip }));
vi.mock('@/lib/contracts/read-tip-transaction', () => ({ readConfirmedTipDetails: mocks.readTip }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ insert: mocks.insert }) } }));
vi.mock('@/lib/supabase-wallet-client', () => ({ withWalletHeader: (query: unknown) => query }));

import { useTipPayment } from '../use-tip-payment';

function confirmation() {
  let resolve!: (hash: string) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.switchChain.mockResolvedValue(undefined);
  mocks.insert.mockResolvedValue({ error: null });
  mocks.readTip.mockResolvedValue({ receiverAddress: '0xcreator', amount: 500, tokenId: '123' });
});

describe('tip payment reporting', () => {
  it('waits for confirmation and persistence before showing success', async () => {
    const confirmed = confirmation();
    mocks.sendTip.mockResolvedValue({ hash: '0xtip', confirmed: confirmed.promise });
    const onSubmitted = vi.fn();
    const onConfirmed = vi.fn();
    const { result } = renderHook(() => useTipPayment({ creatorAddress: '0xcreator', tokenId: '123', onSubmitted, onConfirmed }));
    await act(async () => { await result.current.tip(500); });
    expect(onSubmitted).toHaveBeenCalledWith('0xtip', 500);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    confirmed.resolve('0xtip');
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledOnce());
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ tx_hash: '0xtip', amount: 500 }));
    expect(mocks.toast.success).toHaveBeenCalledOnce();
  });

  it('shows an unresolved submission as pending with its hash', async () => {
    const confirmed = confirmation();
    mocks.sendTip.mockResolvedValue({ hash: '0xtip', confirmed: confirmed.promise });
    const { result } = renderHook(() => useTipPayment({ creatorAddress: '0xcreator' }));
    await act(async () => { await result.current.tip(500); });
    confirmed.reject(Object.assign(new Error('receipt unavailable'), { code: 'TRANSACTION_CONFIRMATION_PENDING' }));
    await waitFor(() => expect(mocks.toast.warning).toHaveBeenCalledWith('staking.pendingSubmitted', expect.objectContaining({ description: '0xtip' })));
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.sendTip).toHaveBeenCalledOnce();
  });

  it('does not save or report success for a reverted tip', async () => {
    const confirmed = confirmation();
    mocks.sendTip.mockResolvedValue({ hash: '0xtip', confirmed: confirmed.promise });
    const { result } = renderHook(() => useTipPayment({ creatorAddress: '0xcreator' }));
    await act(async () => { await result.current.tip(500); });
    confirmed.reject(Object.assign(new Error('reverted'), { code: 'TRANSACTION_REVERTED' }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith('toasts.transaction_reverted', { id: 'tip-payment' }));
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('prevents two clicks from submitting two payments', async () => {
    const confirmed = confirmation();
    mocks.sendTip.mockResolvedValue({ hash: '0xtip', confirmed: confirmed.promise });
    const { result } = renderHook(() => useTipPayment({ creatorAddress: '0xcreator' }));
    await act(async () => { await Promise.all([result.current.tip(500), result.current.tip(500)]); });
    expect(mocks.sendTip).toHaveBeenCalledOnce();
    confirmed.resolve('0xtip');
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledOnce());
  });

  it('keeps a pending approval out of the failed-tip path', async () => {
    mocks.sendTip.mockRejectedValue(Object.assign(new Error('Approval submitted; check confirmation.'), { code: 'TRANSACTION_CONFIRMATION_PENDING' }));
    const { result } = renderHook(() => useTipPayment({ creatorAddress: '0xcreator' }));
    await act(async () => { await result.current.tip(500); });
    expect(mocks.toast.warning).toHaveBeenCalledOnce();
    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
