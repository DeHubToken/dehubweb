import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * A failed wallet setup, retried, must produce the SAME wallet.
 *
 * It did not. The mnemonic was generated inside resolveSecret(), which runs on
 * every submit, so tapping "Secure account" again after any failure minted a
 * second wallet — and saveWallet upserts on user_id, so the row silently moved
 * to it. When the first attempt had already reached the backend, the account
 * stayed linked to wallet #1 while the browser could only derive wallet #2:
 * every later login logged "Supabase session maps to a different wallet", fell
 * back to a signature, and that signature arrived as a NEW signup, which the
 * wallet-history gate refuses for an empty wallet. Two users reached exactly
 * that state in the three days after the gate shipped — locked out of accounts
 * they had created minutes earlier, on every device, with no way back.
 *
 * The retry is the whole test: one tap that fails, one that succeeds, and the
 * two writes must name one address.
 *
 * Mocks are declared through vi.hoisted because vi.mock factories are hoisted
 * above the file's own consts — a plain const here is a ReferenceError at load.
 */
const mocks = vi.hoisted(() => ({
  saveWallet: vi.fn(
    async (_userId: string, _ethAddress: string, _payload: unknown) => {},
  ),
  fetchWallet: vi.fn(
    async (_userId: string): Promise<{ ethAddress: string; payload: unknown } | null> => null,
  ),
  /**
   * A distinct phrase per call — a stand-in for the real generator, which
   * mints a new wallet every time it is asked. That is the whole point: the
   * component must ask once and keep the answer, so "phrase-2" should never
   * reach a wallet.
   */
  generateMnemonic12: vi.fn(
    () => `phrase-${mocks.generateMnemonic12.mock.calls.length}`,
  ),
}));

/**
 * Derivation is stubbed rather than run.
 *
 * ethers cannot do mnemonics under jsdom here: its sha256 is handed a Node
 * Buffer, its own getBytes rejects that as an invalid BytesLike, and
 * isValidMnemonic swallows the failure and answers "not a valid phrase" — so
 * every real derivation fails for a reason that has nothing to do with this
 * component. The mapping below is deterministic and one-to-one, which is all
 * the assertions need: same phrase in, same address out.
 */
vi.mock('@/lib/wallet-core/derive', () => ({
  generateMnemonic12: mocks.generateMnemonic12,
  deriveFromSecret: (secret: string) => {
    // "phrase-2" → 0x0…02, so the addresses stay well-formed hex and still say
    // at a glance which phrase produced them.
    const nth = secret.replace(/\D/g, '') || '0';
    return {
      secret,
      ethAddress: `0x${nth.padStart(40, '0')}`,
      ethPrivateKey: `0x${nth.padStart(64, '0')}`,
    };
  },
  isValidMnemonic: () => true,
  isRawPrivateKey: () => false,
}));

vi.mock('@/lib/wallet-core/store', () => ({
  saveWallet: mocks.saveWallet,
  fetchWallet: mocks.fetchWallet,
}));

vi.mock('@/lib/wallet-core/biometric-unlock', () => ({
  isBiometricUnlockAvailable: async () => true,
  enrollBiometricUnlock: async () => {},
  PasskeyCancelledError: class PasskeyCancelledError extends Error {},
  PasskeyUnsupportedError: class PasskeyUnsupportedError extends Error {},
}));

vi.mock('@/lib/wallet-core/legacy-detect', () => ({
  hasLegacyBrowserResidue: () => false,
  checkLegacyAccount: async () => ({ exists: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { WalletCreateStep } from '../WalletCreateStep';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.saveWallet.mockClear();
  mocks.fetchWallet.mockClear();
  mocks.generateMnemonic12.mockClear();
  mocks.fetchWallet.mockResolvedValue(null);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** The protect step's primary button. */
function createButton(): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((b) =>
    /secure account/i.test(b.textContent ?? ''),
  );
  if (!button) throw new Error('Secure account button not rendered');
  return button;
}

/** Let the component's promise chains settle between acts. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(onComplete: (privKeyHex: string) => Promise<void>) {
  await act(async () => {
    root.render(createElement(WalletCreateStep, { userId: 'user-1', onComplete }));
  });
  // Biometric availability resolves asynchronously and swaps in the button.
  await flush();
}

describe('wallet setup retry', () => {
  it('re-derives the same wallet after a failed attempt', async () => {
    // The first sign-in fails the way the real one did — after the wallet was
    // written, which is what leaves the backend holding a link to it.
    const onComplete = vi
      .fn(async (_privKeyHex: string) => {})
      .mockRejectedValueOnce(new Error('Authentication failed'))
      .mockResolvedValueOnce(undefined);

    await mount(onComplete);

    await act(async () => {
      createButton().click();
    });
    await flush();

    await act(async () => {
      createButton().click();
    });
    await flush();

    expect(mocks.saveWallet).toHaveBeenCalledTimes(2);
    const addresses = mocks.saveWallet.mock.calls.map((call) => call[1]);
    expect(addresses[0]).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(addresses[1]).toBe(addresses[0]);
    // The generator is the thing that must not run twice.
    expect(mocks.generateMnemonic12).toHaveBeenCalledTimes(1);
    // And the key handed to the sign-in is that same wallet's, both times.
    expect(onComplete.mock.calls[1][0]).toBe(onComplete.mock.calls[0][0]);
  });

  it('refuses to overwrite a wallet that appeared underneath it', async () => {
    // A row written by another tab between the lookup that opened this step
    // and the write it is about to make.
    mocks.fetchWallet.mockResolvedValue({
      ethAddress: '0x000000000000000000000000000000000000dEaD',
      payload: null,
    });
    const onComplete = vi.fn(async (_privKeyHex: string) => {});

    await mount(onComplete);

    await act(async () => {
      createButton().click();
    });
    await flush();

    expect(mocks.saveWallet).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/already has a wallet/i);
  });
});
