import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finishWalletUnlock, waitForWalletUnlock, WalletActionCancelledError } from '../wallet-unlock-flow';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  localStorage.setItem('dehub_wallet', '0xabc');
  localStorage.setItem('dehub_supabase_uid', 'user-a');
  history.replaceState(null, '', '/app/dao');
});
afterEach(() => {
  finishWalletUnlock(false);
  vi.useRealTimers();
});

describe('pending wallet actions', () => {
  it('opens the prompt and resumes exactly once, only after authentication completes', async () => {
    const requested = vi.fn();
    window.addEventListener('dehub:wallet-unlock-required', requested);
    const send = vi.fn();
    const pending = waitForWalletUnlock().then(send);
    expect(requested).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).not.toHaveBeenCalled();
    finishWalletUnlock(true);
    finishWalletUnlock(true);
    await pending;
    expect(send).toHaveBeenCalledOnce();
    window.removeEventListener('dehub:wallet-unlock-required', requested);
  });

  it('dismissal cancels all pending actions; a later unlock never sends them', async () => {
    const send = vi.fn();
    const actions = [waitForWalletUnlock(), waitForWalletUnlock()];
    const outcomes = Promise.all(actions.map(action => action.then(send, error => error)));
    finishWalletUnlock(false);
    finishWalletUnlock(true);
    expect((await outcomes).every(error => error instanceof WalletActionCancelledError)).toBe(true);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['dehub_wallet', 'dehub_supabase_uid'])('cancels if %s changes while unlocking', async key => {
    const outcome = waitForWalletUnlock().catch(error => error);
    localStorage.setItem(key, 'different-account');
    finishWalletUnlock(true);
    expect(await outcome).toBeInstanceOf(WalletActionCancelledError);
  });

  it('disarms on navigation even if the user returns before unlocking', async () => {
    const outcome = waitForWalletUnlock().catch(error => error);
    history.pushState(null, '', '/app');
    await vi.advanceTimersByTimeAsync(250);
    history.pushState(null, '', '/app/dao');
    finishWalletUnlock(true);
    expect(await outcome).toBeInstanceOf(WalletActionCancelledError);
  });

  it('expires abandoned actions without leaving timers or sending later', async () => {
    const outcome = waitForWalletUnlock().catch(error => error);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    finishWalletUnlock(true);
    expect(await outcome).toBeInstanceOf(WalletActionCancelledError);
    expect(vi.getTimerCount()).toBe(0);
  });
});
