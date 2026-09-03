import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Money that has left the wallet must always be recoverable.
 *
 * Between the pay-per-job launch on 2026-08-28 and 2026-09-03 the AI treasury
 * received four transfers worth 57 DHB and `ai_payments` held zero rows. The
 * receipt was only written inside `chargeForJob`, so everything that could go
 * wrong between signing and the generation function receiving the request lost
 * the money in silence — including `wait()` rejecting on a flaky connection,
 * which reported "Payment failed" over a transfer that was already mined and
 * threw the hash away.
 *
 * Two guarantees are tested here:
 *   1. The hash is banked before the receipt is awaited, and a lost `wait()`
 *      does not turn a mined transfer into a failure.
 *   2. Every confirmed transfer is recorded server-side, so the receipt
 *      outlives this browser.
 */

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  writeContractAA: vi.fn(),
  getWalletAddress: vi.fn(),
  getERC20Balance: vi.fn(),
  switchChain: vi.fn(),
  getAuthToken: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

vi.mock('@/lib/api/dehub', () => ({ getAuthToken: mocks.getAuthToken }));

vi.mock('@/lib/contracts/aa-utils', () => ({
  writeContractAA: mocks.writeContractAA,
  getERC20Balance: mocks.getERC20Balance,
  getWalletAddress: mocks.getWalletAddress,
  switchChain: mocks.switchChain,
  parseTxError: (err: unknown) => (err instanceof Error ? err.message : ''),
}));

const WALLET = '0xea2824aed1fc55abcf7c6b4493ceea6a09f0d049';
const HASH = `0x${'a'.repeat(64)}`;

/** Every call the ledger function receives, in order. */
function ledgerCalls() {
  return mocks.invoke.mock.calls
    .filter(([name]) => name === 'ai-payment-record')
    .map(([, options]) => (options as { body: Record<string, unknown> }).body);
}

describe('a paid transfer is never lost', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('dehub_wallet', WALLET);
    mocks.getAuthToken.mockReturnValue('token-123');
    mocks.getWalletAddress.mockResolvedValue(WALLET);
    mocks.switchChain.mockResolvedValue(undefined);
    // Enough DHB on Base to pay for anything these tests ask for.
    mocks.getERC20Balance.mockResolvedValue(BigInt('1000000000000000000000000'));
    mocks.invoke.mockResolvedValue({ data: { payments: [] }, error: null });
  });

  // Generous: the first import in the file pulls the whole wallet/contract
  // tree through the transform, which alone can outrun the default timeout.
  it('banks the hash before awaiting the receipt', { timeout: 30_000 }, async () => {
    const { payForJob } = await import('@/lib/ai-payment');
    let stored: string | null = null;
    mocks.writeContractAA.mockResolvedValue({
      hash: HASH,
      wait: async () => {
        // Whatever happens from here on, the hash is already written down.
        stored = localStorage.getItem('dehub.ai.unspentPayments');
        return { status: 1, hash: HASH };
      },
    });

    await payForJob(24);

    expect(stored).toContain(HASH);
  });

  it('records the confirmed transfer with the server', async () => {
    const { payForJob } = await import('@/lib/ai-payment');
    mocks.writeContractAA.mockResolvedValue({
      hash: HASH,
      wait: async () => ({ status: 1, hash: HASH }),
    });

    await expect(payForJob(24)).resolves.toBe(HASH);
    expect(ledgerCalls()).toContainEqual({ txHash: HASH, purpose: 'job' });
  });

  it('does not report a mined transfer as a failed payment', async () => {
    const { payForJob } = await import('@/lib/ai-payment');
    mocks.writeContractAA.mockResolvedValue({
      hash: HASH,
      // The socket dies while waiting. The transfer is in the mempool and will
      // mine; only our view of it is gone.
      wait: async () => {
        throw new Error('network error');
      },
    });
    // The server confirms it against the chain, which is the authority.
    mocks.invoke.mockResolvedValue({ data: { txHash: HASH, remainingDhb: 24 }, error: null });

    await expect(payForJob(24)).resolves.toBe(HASH);
    expect(localStorage.getItem('dehub.ai.unspentPayments')).toContain(HASH);
  });

  it('keeps the hash and says so when even the server cannot confirm it', async () => {
    const { payForJob } = await import('@/lib/ai-payment');
    mocks.writeContractAA.mockResolvedValue({
      hash: HASH,
      wait: async () => {
        throw new Error('network error');
      },
    });
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('not on chain yet') });

    await expect(payForJob(24)).rejects.toThrow(/do not send it again/i);
    // Still banked: the next attempt reuses it rather than paying twice.
    expect(localStorage.getItem('dehub.ai.unspentPayments')).toContain(HASH);
  });

  it('drops the hash when the transfer actually reverted', async () => {
    const { payForJob } = await import('@/lib/ai-payment');
    mocks.writeContractAA.mockResolvedValue({
      hash: HASH,
      wait: async () => ({ status: 0, hash: HASH }),
    });

    await expect(payForJob(24)).rejects.toThrow(/did not go through/i);
    expect(localStorage.getItem('dehub.ai.unspentPayments') ?? '').not.toContain(HASH);
  });

  it('spends DHB banked on the server instead of asking for a second transfer', async () => {
    const { payForJob } = await import('@/lib/ai-payment');
    mocks.invoke.mockResolvedValue({
      data: {
        payments: [
          { txHash: HASH, chain: 'Base', paidDhb: 24, remainingDhb: 24, purpose: 'job', createdAt: new Date().toISOString() },
        ],
      },
      error: null,
    });

    await expect(payForJob(24)).resolves.toBe(HASH);
    // Nothing was signed: the money was already there.
    expect(mocks.writeContractAA).not.toHaveBeenCalled();
  });

  it('signs when the banked balance is too small for this job', async () => {
    const { payForJob } = await import('@/lib/ai-payment');
    mocks.invoke.mockResolvedValue({
      data: {
        payments: [
          { txHash: HASH, chain: 'Base', paidDhb: 24, remainingDhb: 2, purpose: 'job', createdAt: new Date().toISOString() },
        ],
      },
      error: null,
    });
    const fresh = `0x${'b'.repeat(64)}`;
    mocks.writeContractAA.mockResolvedValue({ hash: fresh, wait: async () => ({ status: 1, hash: fresh }) });

    await expect(payForJob(24)).resolves.toBe(fresh);
    expect(mocks.writeContractAA).toHaveBeenCalled();
  });

  it('never offers a voice session hash to an ordinary job', async () => {
    const { payForJob } = await import('@/lib/ai-payment');
    mocks.invoke.mockResolvedValue({
      data: {
        payments: [
          { txHash: HASH, chain: 'Base', paidDhb: 2800, remainingDhb: 2800, purpose: 'voice', createdAt: new Date().toISOString() },
        ],
      },
      error: null,
    });
    const fresh = `0x${'c'.repeat(64)}`;
    mocks.writeContractAA.mockResolvedValue({ hash: fresh, wait: async () => ({ status: 1, hash: fresh }) });

    await expect(payForJob(24)).resolves.toBe(fresh);
  });
});

describe('paid AI auth headers', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    mocks.getAuthToken.mockReturnValue('token-123');
  });

  it('sends the token even when the cached wallet address is gone', async () => {
    const { dehubAuthHeaders } = await import('@/lib/ai-invoke');
    // A storage clear that left the token behind used to make every paid call
    // anonymous — a 401 after the DHB had already moved.
    expect(dehubAuthHeaders()).toEqual({ 'x-dehub-token': 'token-123' });
  });

  it('adds the wallet as a cross-check when it is known', async () => {
    localStorage.setItem('dehub_wallet', WALLET.toUpperCase());
    const { dehubAuthHeaders } = await import('@/lib/ai-invoke');
    expect(dehubAuthHeaders()).toEqual({
      'x-dehub-token': 'token-123',
      'x-wallet-address': WALLET,
    });
  });

  it('is empty when signed out', async () => {
    mocks.getAuthToken.mockReturnValue('');
    const { dehubAuthHeaders } = await import('@/lib/ai-invoke');
    expect(dehubAuthHeaders()).toEqual({});
  });
});
