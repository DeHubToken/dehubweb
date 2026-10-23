import { describe, expect, it } from 'vitest';
import type { PostChainId } from '@/components/app/ChainSelector';
import { postUploadChainId } from '@/lib/post-upload-chain';

describe('wallet-free off-chain publishing', () => {
  it.each([101, 103] as PostChainId[])('publishes off-chain through account authentication with Solana preference %s', (chain) => {
    expect(postUploadChainId(chain, false)).toBe(8453);
  });

  it.each([101, 103] as PostChainId[])('preserves an explicitly requested Solana mint on %s', (chain) => {
    expect(postUploadChainId(chain, true)).toBe(chain);
  });

  it.each([8453, 56, 1] as PostChainId[])('preserves the EVM publishing network %s with or without minting', (chain) => {
    expect(postUploadChainId(chain, false)).toBe(chain);
    expect(postUploadChainId(chain, true)).toBe(chain);
  });
});
