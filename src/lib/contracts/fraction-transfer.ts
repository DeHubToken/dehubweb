/**
 * Fraction Transfer Logic
 * =======================
 * Handles ERC-1155 safeTransferFrom for fraction trading.
 */

import { Interface } from 'ethers';
import { writeContractAA, type AAWriteResult } from './aa-utils';
import { STREAM_COLLECTION_ADDRESS } from './stream-collection';
import { BASE_CHAIN_ID } from './dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';

const ERC1155_TRANSFER_ABI = [
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address account, address operator) view returns (bool)',
];

const erc1155Interface = new Interface(ERC1155_TRANSFER_ABI);

/**
 * Transfer ERC-1155 fractions from one address to another
 */
export async function transferFractions(
  tokenId: string | number,
  from: string,
  to: string,
  amount: number,
  chainId: ChainId = BASE_CHAIN_ID as ChainId
): Promise<AAWriteResult> {
  return writeContractAA(
    STREAM_COLLECTION_ADDRESS,
    erc1155Interface,
    'safeTransferFrom',
    [from, to, BigInt(tokenId), BigInt(amount), '0x'],
    { context: 'fraction transfer', chainId }
  );
}

/**
 * Set approval for all tokens (needed for marketplace transfers)
 */
export async function setApprovalForAll(
  operator: string,
  approved: boolean,
  chainId: ChainId = BASE_CHAIN_ID as ChainId
): Promise<AAWriteResult> {
  return writeContractAA(
    STREAM_COLLECTION_ADDRESS,
    erc1155Interface,
    'setApprovalForAll',
    [operator, approved],
    { context: 'set approval', chainId }
  );
}
