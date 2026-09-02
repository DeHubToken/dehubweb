/**
 * The wallet SDKs stay off the boot path.
 *
 * lib/wagmi.ts is what every visitor evaluates at first paint (it is inside
 * WalletProviders, which wraps every route). It used to build the RainbowKit
 * connectors there, and wagmi runs each connector's setup() when the config is
 * created — MetaMask's setup() imports and initialises the MetaMask SDK — so
 * ~500 KB of wallet code ran on the home page for a login modal most visitors
 * never open. The connectors now live in lib/wagmi-wallets and are added to
 * the live config on demand. These pin the split, because the easiest way to
 * undo it is one import statement.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const HEAVY = /@rainbow-me\/rainbowkit|@metamask\/sdk|@walletconnect\//;

describe('wagmi boot split', () => {
  it('the boot config imports no wallet SDK and ships only the injected connector', () => {
    const src = read('src/lib/wagmi.ts');
    expect(src).not.toMatch(HEAVY);
    expect(src).not.toContain('connectorsForWallets');
    expect(src).toMatch(/connectors:\s*\[\s*(\/\/[^\n]*\n\s*)*injected\(\),?\s*\]/);
  });

  it('the curated wallets are built lazily and injected into the live config', () => {
    const src = read('src/lib/wagmi-wallets.ts');
    expect(src).toContain("from '@rainbow-me/rainbowkit'");
    expect(src).toContain('export function ensureWalletConnectors');
    expect(src).toContain('wagmiConfig._internal.connectors');
  });

  it('nothing reaches lib/wagmi-wallets with a static import', () => {
    const files = [
      'src/App.tsx',
      'src/components/app/WalletProviders.tsx',
      'src/contexts/AuthProvider.tsx',
      'src/components/app/login/LoginWalletsStep.tsx',
      'src/components/app/login/LoginModalBody.tsx',
      'src/components/app/wallet-setup/ConnectLinkedWalletBody.tsx',
      'src/components/app/LoginModal.tsx',
    ];
    for (const f of files) {
      expect(read(f), f).not.toMatch(/^import [^;]*from '@\/lib\/wagmi-wallets'/m);
    }
  });

  it('every connector lookup makes sure the curated set exists first', () => {
    const auth = read('src/contexts/AuthProvider.tsx');
    const connect = auth.slice(auth.indexOf('const connectWithWallet = async'));
    expect(connect.indexOf('ensureWalletConnectors()')).toBeGreaterThan(-1);
    expect(connect.indexOf('ensureWalletConnectors()')).toBeLessThan(connect.indexOf('connectorMatchesWallet('));

    const linked = read('src/components/app/wallet-setup/ConnectLinkedWalletBody.tsx');
    expect(linked.indexOf('ensureWalletConnectors()')).toBeLessThan(linked.indexOf('connectorMatchesWallet(c, wallet)'));

    const step = read('src/components/app/login/LoginWalletsStep.tsx');
    expect(step).toContain('connectorsReady');
    expect(step.indexOf('if (!connectorsReady)')).toBeLessThan(step.indexOf('<RainbowKitProvider'));
  });

  it('a returning external-wallet session gets its connector before wagmi mounts', () => {
    const providers = read('src/components/app/WalletProviders.tsx');
    expect(providers).toContain('export async function loadWalletProviders');
    expect(providers).toContain('hasReturningWagmiSession()');
    expect(providers.indexOf('ensureWalletConnectors()')).toBeLessThan(providers.indexOf('requestWalletRuntime()'));
    expect(read('src/App.tsx')).toContain('m.loadWalletProviders()');
  });

  // wagmi + viem themselves left the first-paint path: WagmiProvider is a
  // lazily mounted sibling (WagmiRuntime) and AuthProvider reads its state
  // through lib/wallet-runtime. One static import puts ~140 KB back in front
  // of every visitor.
  it('nothing on the first-paint path imports wagmi at runtime', () => {
    const files = [
      'src/components/app/WalletProviders.tsx',
      'src/contexts/AuthProvider.tsx',
      'src/lib/wallet-runtime.ts',
      'src/lib/wagmi-session.ts',
    ];
    for (const f of files) {
      const src = read(f);
      expect(src, f).not.toMatch(/^import (?!type )[^;]*from 'wagmi[^']*'/m);
      expect(src, f).not.toMatch(/^import [^;]*from '@\/lib\/wagmi'/m);
    }
    expect(read('src/components/app/WalletProviders.tsx')).toContain("import('@/components/app/WagmiRuntime')");
  });

  it('the surfaces that call wagmi hooks provide their own WagmiScope', () => {
    for (const f of [
      'src/components/app/login/LoginModalBody.tsx',
      'src/components/app/wallet-setup/ConnectLinkedWalletBody.tsx',
      'src/components/app/settings/EnsHandleSettings.tsx',
    ]) {
      expect(read(f), f).toContain('<WagmiScope>');
    }
  });
});
