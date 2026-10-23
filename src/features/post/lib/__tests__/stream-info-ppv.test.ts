import { describe, it, expect } from 'vitest';
import { buildStreamInfo, type BuildStreamInfoInput } from '../stream-info';

const base: BuildStreamInfoInput = {
  chainId: 8453,
  isTokenGated: false,
  tokenAmount: '',
  tokenContract: '',
  tokenSymbol: '',
  isPPV: true,
  ppvAmount: '5',
  ppvCurrency: 'DHB',
  isWatch2Earn: false,
  w2eTotal: '',
  w2eViews: '',
  w2eComments: '',
  isSubscribersOnly: false,
  myPlanIds: [],
};

describe('buildStreamInfo pay-per-view token', () => {
  it('prices a Base post in USDC with its contract', () => {
    const { error, streamInfo } = buildStreamInfo({ ...base, ppvCurrency: 'USDC' });
    expect(error).toBeUndefined();
    expect(streamInfo.payPerViewTokenSymbol).toBe('USDC');
    expect(streamInfo.payPerViewContractAddress).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    expect(streamInfo.payPerViewChainIds).toEqual([8453]);
  });

  it('prices a BNB post in USDT with its contract', () => {
    const { streamInfo } = buildStreamInfo({ ...base, chainId: 56, ppvCurrency: 'USDT' });
    expect(streamInfo.payPerViewTokenSymbol).toBe('USDT');
    expect(streamInfo.payPerViewContractAddress).toBe('0x55d398326f99059fF775485246999027B3197955');
  });

  it('keeps DHB posts on DHB', () => {
    const { streamInfo } = buildStreamInfo(base);
    expect(streamInfo.payPerViewTokenSymbol).toBe('DHB');
  });
});
