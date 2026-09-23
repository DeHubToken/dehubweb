import { describe, expect, it } from 'vitest';
import { defaultFundingAsset, fundingAssets, usdcAmountFor } from './funding';
import type { WalletToken } from '@/lib/wallet/tokens';

const token = (partial: Partial<WalletToken> & Pick<WalletToken, 'symbol' | 'address' | 'balance'>): WalletToken => ({
  name: partial.symbol, decimals: 18, formattedBalance: '', chainId: 8453, ...partial,
});
const wallet = [
  token({ symbol: 'ETH', address: '0x0', balance: 10n ** 18n, isNative: true }),
  token({ symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', balance: 50n * 10n ** 6n, decimals: 6 }),
  token({ symbol: 'USDT', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', balance: 0n, decimals: 6 }),
  token({ symbol: 'ETH', address: '0x0', balance: 5n * 10n ** 18n, isNative: true, chainId: 1 }),
];

describe('funding a buy from the wallet', () => {
  it('prices Base assets in dollars, USDC first then by value, ignoring other chains', () => {
    const assets = fundingAssets(wallet, { ETH: 2000, USDC: 1 });
    expect(assets.map((a) => a.symbol)).toEqual(['USDC', 'ETH', 'USDT']);
    expect(assets[0].usd).toBe(50);
    expect(assets[0].spendableUsd).toBe(50);
    expect(assets[1].usd).toBe(2000);
    expect(assets[1].spendableUsd).toBe(1970);
  });
  it('hides a swap asset with no price rather than valuing it at zero silently', () => {
    const eth = fundingAssets(wallet, {}).find((a) => a.symbol === 'ETH')!;
    expect(eth.usd).toBe(0);
    expect(eth.spendableUsd).toBe(0);
  });
  it('spends USDC when it covers the bill and the richest asset otherwise', () => {
    const assets = fundingAssets(wallet, { ETH: 2000 });
    expect(defaultFundingAsset(assets, 40)?.symbol).toBe('USDC');
    expect(defaultFundingAsset(assets, 400)?.symbol).toBe('ETH');
    expect(defaultFundingAsset(assets)?.symbol).toBe('USDC');
    expect(defaultFundingAsset([])).toBeNull();
  });
  it('turns a dollar amount into USDC base units and rejects junk', () => {
    expect(usdcAmountFor('12.5')).toEqual({ amount: '12.5', units: 12_500_000n });
    expect(usdcAmountFor('0')).toBeNull();
    expect(usdcAmountFor('1.1234567')).toBeNull();
    expect(usdcAmountFor('abc')).toBeNull();
  });
});
