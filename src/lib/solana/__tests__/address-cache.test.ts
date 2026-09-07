// The cache hands out a deposit address, so the only interesting question is
// whether it can ever hand out the WRONG one. A stale entry surviving a wallet
// switch would offer the previous account's Solana address to the new one, and
// anything sent there is unrecoverable.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearCachedSolanaAddress,
  getCachedSolanaAddress,
  SOLANA_ADDRESS_CHANGED_EVENT,
  writeCachedSolanaAddress,
} from '../address-cache';

const WALLET_A = '0xAAAAaaaAAAAaaaAAAAaaaAAAAaaaAAAAaaaAAAAa';
const WALLET_B = '0xBBBBbbbBBBBbbbBBBBbbbBBBBbbbBBBBbbbBBBBb';
const SOLANA_A = '48Mr8FYZiZx2riVj6yRafaNS8SCW2wf5aY1QDXYKSGDe';

const setWalletCache = (ethAddress: string) =>
  localStorage.setItem('dehub_wallet_enc', JSON.stringify({ ethAddress, payload: null }));

describe('the derived Solana address cache', () => {
  beforeEach(() => {
    localStorage.clear();
    clearCachedSolanaAddress();
  });

  it('is empty before anything derives an address', () => {
    expect(getCachedSolanaAddress()).toBeNull();
  });

  it('reads back what was written', () => {
    setWalletCache(WALLET_A);
    writeCachedSolanaAddress(WALLET_A, SOLANA_A);
    expect(getCachedSolanaAddress()).toBe(SOLANA_A);
  });

  it('matches the owner case-insensitively', () => {
    setWalletCache(WALLET_A.toLowerCase());
    writeCachedSolanaAddress(WALLET_A, SOLANA_A);
    expect(getCachedSolanaAddress()).toBe(SOLANA_A);
  });

  it('refuses an entry belonging to a different wallet, and drops it', () => {
    setWalletCache(WALLET_A);
    writeCachedSolanaAddress(WALLET_A, SOLANA_A);
    expect(getCachedSolanaAddress()).toBe(SOLANA_A);

    // The browser now holds a different wallet — a profile switch, or a second
    // account signing in.
    setWalletCache(WALLET_B);
    expect(getCachedSolanaAddress()).toBeNull();
    expect(localStorage.getItem('dehub_solana_address')).toBeNull();
  });

  it('still answers when there is no wallet ciphertext to check against', () => {
    // External-wallet sessions never cache one; there is nothing to disagree
    // with, so the entry is taken at face value rather than discarded.
    writeCachedSolanaAddress(WALLET_A, SOLANA_A);
    expect(getCachedSolanaAddress()).toBe(SOLANA_A);
  });

  it('survives a malformed wallet cache rather than throwing', () => {
    localStorage.setItem('dehub_wallet_enc', '{not json');
    writeCachedSolanaAddress(WALLET_A, SOLANA_A);
    expect(getCachedSolanaAddress()).toBe(SOLANA_A);
  });

  it('returns null for a malformed entry', () => {
    localStorage.setItem('dehub_solana_address', '{not json');
    expect(getCachedSolanaAddress()).toBeNull();
  });

  it('announces a write so open surfaces can pick it up', () => {
    let heard = 0;
    const listener = () => { heard += 1; };
    window.addEventListener(SOLANA_ADDRESS_CHANGED_EVENT, listener);
    writeCachedSolanaAddress(WALLET_A, SOLANA_A);
    window.removeEventListener(SOLANA_ADDRESS_CHANGED_EVENT, listener);
    expect(heard).toBe(1);
  });
});
