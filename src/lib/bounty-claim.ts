import { Interface } from 'ethers';
import { apiCall } from '@/lib/api/dehub/core';
import { getNFTInfo } from '@/lib/api/dehub/feed';
import { writeContractAA } from '@/lib/contracts/aa-utils';
import { getChainConfig } from '@/lib/contracts/dhb-token';
import { isV3Chain } from '@/lib/chains/robinhood';
import type { ChainId } from '@/components/app/ChainSelector';

export interface BountySignature {
  r?: string;
  s?: string;
  v?: number;
  deadline?: number;
  signature?: string;
}
export interface BountyEligibility {
  error?: boolean | string;
  result?: {
    viewer?: BountySignature;
    commentor?: BountySignature;
    viewer_claimed?: boolean;
    commentor_claimed?: boolean;
  };
}

export function getBountyEligibility(tokenId: string): Promise<BountyEligibility> {
  return apiCall('/api/claim-bounty', { params: { tokenId }, requiresAuth: true });
}

export function bountyClaimCall(tokenId: string, type: 'viewer' | 'commentor', chainId: number, sig: BountySignature) {
  const bountyType = type === 'viewer' ? 0 : 1;
  if (isV3Chain(chainId)) {
    if (!sig.signature || !sig.deadline) throw new Error('Missing bounty claim signature');
    return {
      abi: 'function claimBounty(uint256 tokenId, uint8 bountyType, uint256 deadline, bytes signature)',
      args: [BigInt(tokenId), bountyType, sig.deadline, sig.signature],
    };
  }
  if (!sig.r || !sig.s || sig.v == null) throw new Error('Missing bounty claim signature');
  return {
    abi: 'function claimBounty(uint256 tokenId, bytes32 r, bytes32 s, uint8 v, uint8 bountyType)',
    args: [BigInt(tokenId), sig.r, sig.s, sig.v, bountyType],
  };
}

export async function submitBountyClaim(tokenId: string, type: 'viewer' | 'commentor') {
  // Recheck immediately before signing; eligibility and v3 deadlines can change
  // while the drawer is open. The post's chain determines the signed domain.
  const [post, eligibility] = await Promise.all([getNFTInfo(tokenId), getBountyEligibility(tokenId)]);
  const sig = eligibility.result?.[type];
  if (eligibility.result?.[`${type}_claimed`] || !sig) throw new Error('Not Eligible');
  const chainId = (post.chainId || 56) as ChainId;
  const config = getChainConfig(chainId);
  const call = bountyClaimCall(tokenId, type, chainId, sig);
  const tx = await writeContractAA(config.streamController, new Interface([call.abi]), 'claimBounty', call.args, {
    chainId, context: 'claim bounty',
  });
  await tx.wait(1);
  return tx.hash;
}
