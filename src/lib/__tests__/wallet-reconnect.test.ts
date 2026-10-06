import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finishSessionWalletConnect, waitForSessionWalletConnect, WALLET_CONNECT_REQUIRED_EVENT } from '../wallet-reconnect';
import { WalletActionCancelledError } from '../wallet-unlock-flow';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  localStorage.setItem('dehub_wallet', '0xabc');
  localStorage.setItem('dehub_supabase_uid', 'user-a');
  history.replaceState(null, '', '/app');
});
afterEach(() => { finishSessionWalletConnect(false); vi.useRealTimers(); });

describe('wallet reconnect before payment', () => {
  it('continues the original action once after a verified connection', async () => {
    await vi.advanceTimersByTimeAsync(0);
    const existingTimers = vi.getTimerCount();
    const requested = vi.fn();
    window.addEventListener(WALLET_CONNECT_REQUIRED_EVENT, requested);
    const send = vi.fn();
    const pending = waitForSessionWalletConnect().then(send);
    expect(requested).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
    finishSessionWalletConnect(true);
    finishSessionWalletConnect(true);
    await pending;
    expect(send).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(existingTimers);
    window.removeEventListener(WALLET_CONNECT_REQUIRED_EVENT, requested);
  });

  it('cancels on dismissal and never sends when a wallet connects later', async () => {
    const send = vi.fn();
    const pending = waitForSessionWalletConnect().then(send, error => error);
    finishSessionWalletConnect(false);
    finishSessionWalletConnect(true);
    expect(await pending).toBeInstanceOf(WalletActionCancelledError);
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['dehub_wallet', 'dehub_supabase_uid'])('disarms when %s changes', async key => {
    const pending = waitForSessionWalletConnect().catch(error => error);
    localStorage.setItem(key, 'another-account');
    finishSessionWalletConnect(true);
    expect(await pending).toBeInstanceOf(WalletActionCancelledError);
  });

  it('disarms on navigation and expires abandoned actions', async () => {
    const navigation = waitForSessionWalletConnect().catch(error => error);
    history.pushState(null, '', '/app/profile');
    await vi.advanceTimersByTimeAsync(250);
    expect(await navigation).toBeInstanceOf(WalletActionCancelledError);
    const expired = waitForSessionWalletConnect().catch(error => error);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(await expired).toBeInstanceOf(WalletActionCancelledError);
    expect(vi.getTimerCount()).toBe(0);
  });
});
