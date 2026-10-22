import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readDeviceSeed: vi.fn() }));
vi.mock('@/lib/wallet-core/device-seed', () => ({ readDeviceSeed: mocks.readDeviceSeed }));

import { finishWalletSecure, offerWalletSecure, WALLET_SECURE_REQUIRED_EVENT } from '../wallet-secure-flow';
import { WalletActionCancelledError } from '../wallet-unlock-flow';
import { resumingStep } from '@/components/app/login/steps';

const seed = { secret: 'words', address: '0xabc' };

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('dehub_supabase_uid', 'user-a');
  mocks.readDeviceSeed.mockReset();
});
afterEach(() => {
  finishWalletSecure(false);
});

describe('secure your wallet at first use', () => {
  it('lets the action go on when this browser holds no unsecured wallet', async () => {
    mocks.readDeviceSeed.mockResolvedValue(null);
    const requested = vi.fn();
    window.addEventListener(WALLET_SECURE_REQUIRED_EVENT, requested);
    await expect(offerWalletSecure()).resolves.toBeUndefined();
    expect(requested).not.toHaveBeenCalled();
    window.removeEventListener(WALLET_SECURE_REQUIRED_EVENT, requested);
  });

  it('asks nothing with no signed-in identity', async () => {
    localStorage.removeItem('dehub_supabase_uid');
    await expect(offerWalletSecure()).resolves.toBeUndefined();
    expect(mocks.readDeviceSeed).not.toHaveBeenCalled();
  });

  it('holds the action until the wallet is secured, asking once for calls that arrive together', async () => {
    mocks.readDeviceSeed.mockResolvedValue(seed);
    const requested = vi.fn();
    window.addEventListener(WALLET_SECURE_REQUIRED_EVENT, requested);
    const first = offerWalletSecure();
    const second = offerWalletSecure();
    await vi.waitFor(() => expect(requested).toHaveBeenCalledOnce());
    finishWalletSecure(true);
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    expect(requested).toHaveBeenCalledOnce();
    window.removeEventListener(WALLET_SECURE_REQUIRED_EVENT, requested);
  });

  it('cancels the action when the sheet is closed', async () => {
    mocks.readDeviceSeed.mockResolvedValue(seed);
    const requested = vi.fn();
    window.addEventListener(WALLET_SECURE_REQUIRED_EVENT, requested);
    const pending = offerWalletSecure();
    await vi.waitFor(() => expect(requested).toHaveBeenCalledOnce());
    finishWalletSecure(false);
    await expect(pending).rejects.toBeInstanceOf(WalletActionCancelledError);
    window.removeEventListener(WALLET_SECURE_REQUIRED_EVENT, requested);
  });

  it('routes the login sheet to the secure step', () => {
    expect(resumingStep('secure', false)).toBe('wallet-secure');
  });
});
