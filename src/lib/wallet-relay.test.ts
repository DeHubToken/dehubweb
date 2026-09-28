import { describe, it, expect, vi, afterEach } from 'vitest';
import { prepareWalletRelay, isWalletRelayPublishError } from './wallet-relay';

describe('wallet relay readiness', () => {
  afterEach(() => vi.useRealTimers());
  it('waits for the relay before allowing a wallet request', async () => {
    let finish!: () => void;
    const restartTransport = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    let ready = false;
    const pending = prepareWalletRelay({ signer: { client: { core: { relayer: { connected: true, restartTransport } } } } }).then(() => { ready = true; });
    await Promise.resolve();
    expect(ready).toBe(false);
    finish();
    await pending;
    expect(ready).toBe(true);
  });
  it('does not touch injected providers', async () => {
    const request = vi.fn();
    await prepareWalletRelay({ request });
    expect(request).not.toHaveBeenCalled();
  });
  it('bounds a hung connection and clears its timer', async () => {
    vi.useFakeTimers();
    const pending = prepareWalletRelay({ client: { core: { relayer: { restartTransport: () => new Promise(() => {}) } } } });
    const check = expect(pending).rejects.toThrow('Wallet connection timed out');
    await vi.advanceTimersByTimeAsync(15_000);
    await check;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('recognizes WalletConnect publish failures inside a viem error', () => {
    expect(isWalletRelayPublishError({ cause: new Error('Failed to publish payload, please try again. id:1 tag:1108') })).toBe(true);
    expect(isWalletRelayPublishError({ code: 4001, message: 'Failed to publish payload' })).toBe(false);
  });
});
