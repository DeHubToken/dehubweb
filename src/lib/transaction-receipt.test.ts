import { afterEach, describe, expect, it, vi } from 'vitest';
import { receiptRpcUrls, TransactionConfirmationPendingError, waitForSubmittedReceipt } from './transaction-receipt';

afterEach(() => vi.useRealTimers());

describe('submitted transaction confirmation', () => {
  const receipt = { status: 1, transactionHash: '0xtip' };

  it('recovers a mined payment when the original RPC errors and another is stale', async () => {
    const wait = vi.fn(async () => { throw new Error('archive request denied'); });
    const readers = [vi.fn(async () => null), vi.fn(async () => receipt)];
    await expect(waitForSubmittedReceipt('0xtip', wait, readers)).resolves.toBe(receipt);
    expect(wait).toHaveBeenCalledOnce();
    expect(readers[1]).toHaveBeenCalledOnce();
  });

  it('preserves a mined revert instead of treating it as unavailable confirmation', async () => {
    const reverted = { ...receipt, status: 0 };
    await expect(waitForSubmittedReceipt('0xtip', async () => { throw { receipt: reverted }; }, []))
      .resolves.toBe(reverted);
  });

  it('does not count a wallet cancellation replacement as a successful payment', async () => {
    const cancelled = { code: 'TRANSACTION_REPLACED', cancelled: true, receipt };
    const read = vi.fn(async () => receipt);
    await expect(waitForSubmittedReceipt('0xtip', async () => { throw cancelled; }, [read])).rejects.toBe(cancelled);
    expect(read).not.toHaveBeenCalled();
  });

  it('retains the submitted hash when every receipt lookup is unavailable', async () => {
    const error = await waitForSubmittedReceipt('0xtip', async () => null, [async () => null]).catch(error => error);
    expect(error).toBeInstanceOf(TransactionConfirmationPendingError);
    expect(error.hash).toBe('0xtip');
    expect(error.message).toContain('before sending again');
  });

  it('recovers a hung receipt wait without repeating the transaction', async () => {
    vi.useFakeTimers();
    const read = vi.fn(async () => receipt);
    const result = waitForSubmittedReceipt('0xtip', () => new Promise(() => {}), [read], 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toBe(receipt);
    expect(read).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a configured endpoint and deduplicates independent chain fallbacks', () => {
    expect(receiptRpcUrls(8453, 'https://mainnet.base.org')).toEqual([
      'https://mainnet.base.org', 'https://base-rpc.publicnode.com',
    ]);
    expect(receiptRpcUrls(56, 'https://configured.example')).toHaveLength(3);
  });
});
