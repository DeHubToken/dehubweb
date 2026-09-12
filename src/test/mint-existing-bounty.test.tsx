import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMintExistingPost } from '@/hooks/use-mint-existing-post';
import { getNFTInfo } from '@/lib/api/dehub/feed';
import { mintWithBounty } from '@/lib/contracts/stream-controller';
import { mintOnChainWithFee } from '@/lib/contracts/stream-collection';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('sonner', () => ({ toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/api/dehub', () => ({ mintExistingPost: vi.fn(async () => ({ createdTokenId: '5588', timestamp: 1, v: 27, r: 'r', s: 's' })), getMintFee: vi.fn() }));
vi.mock('@/lib/api/dehub/feed', () => ({ getNFTInfo: vi.fn() }));
vi.mock('@/lib/api/dehub/solana', () => ({ confirmEvmMint: vi.fn(async () => ({})) }));
vi.mock('@/lib/connection-source', () => ({ isSmartWalletSession: () => false }));
vi.mock('@/lib/contracts/dhb-token', () => ({ BASE_CHAIN_ID: 8453 }));
vi.mock('@/lib/contracts/stream-controller', () => ({ mintWithBounty: vi.fn(async () => '0xbounty'), getDHBBalance: vi.fn() }));
vi.mock('@/lib/contracts/stream-collection', () => ({ mintOnChainWithFee: vi.fn(async () => ({ hash: '0xmint' })) }));
vi.mock('@/lib/contracts/aa-utils', () => ({ getERC20Balance: vi.fn() }));

beforeEach(() => vi.clearAllMocks());
describe('mint retries preserve saved bounty terms', () => {
  it('funds a comments-only bounty instead of using an ordinary mint', async () => {
    vi.mocked(getNFTInfo).mockResolvedValue({ chainId: 8453, streamInfo: { isAddBounty: true, addBountyAmount: 10, addBountyFirstXViewers: 0, addBountyFirstXComments: 50, addBountyTokenSymbol: 'DHB' } } as any);
    const { result } = renderHook(() => useMintExistingPost());
    await act(async () => { expect(await result.current.mint('5588', 56)).toBe(true); });
    expect(mintWithBounty).toHaveBeenCalledWith(expect.objectContaining({ tokenId: '5588', chainId: 8453, bountyAmount: 10, countOfViewers: 0, countOfCommentors: 50 }));
    expect(mintOnChainWithFee).not.toHaveBeenCalled();
  });
  it('does not silently downgrade invalid bounty settings', async () => {
    vi.mocked(getNFTInfo).mockResolvedValue({ chainId: 8453, streamInfo: { isAddBounty: true } } as any);
    const { result } = renderHook(() => useMintExistingPost());
    await act(async () => { expect(await result.current.mint('5588')).toBe(false); });
    expect(mintWithBounty).not.toHaveBeenCalled();
    expect(mintOnChainWithFee).not.toHaveBeenCalled();
  });
  it('keeps ordinary posts on the normal mint path', async () => {
    vi.mocked(getNFTInfo).mockResolvedValue({ chainId: 8453 } as any);
    const { result } = renderHook(() => useMintExistingPost());
    await act(async () => { expect(await result.current.mint('5588')).toBe(true); });
    expect(mintOnChainWithFee).toHaveBeenCalled();
    expect(mintWithBounty).not.toHaveBeenCalled();
  });
});
