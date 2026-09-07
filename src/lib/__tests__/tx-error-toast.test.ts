import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({
  dismiss: vi.fn(),
  error: vi.fn(),
}));

vi.mock('sonner', () => ({ toast }));
vi.mock('@/lib/contracts/aa-utils', () => ({
  isWalletLockedError: (error: unknown) =>
    (error as { code?: string } | null)?.code === 'WALLET_LOCKED',
  parseTxError: () => 'Readable failure',
}));

import { toastTxError } from '@/lib/tx-error-toast';

describe('toastTxError', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clears an in-progress toast and stays quiet while wallet unlock is requested', () => {
    expect(toastTxError({ code: 'WALLET_LOCKED' }, 'Payment failed', { id: 'dm-fee-send' })).toBe(false);
    expect(toast.dismiss).toHaveBeenCalledWith('dm-fee-send');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('still shows genuine transaction errors', () => {
    expect(toastTxError(new Error('reverted'), 'Payment failed', { id: 'dm-fee-send' })).toBe(true);
    expect(toast.error).toHaveBeenCalledWith('Readable failure', { id: 'dm-fee-send' });
  });
});
