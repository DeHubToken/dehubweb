/**
 * Fraction Transfer Logic
 * =======================
 * Handles ERC-1155 safeTransferFrom for fraction trading.
 *
 * The collection address is resolved from the chain, not hardcoded. Both
 * functions here take a chainId and used to send to `STREAM_COLLECTION_ADDRESS`
 * regardless — that constant is **Base's** collection, and it has no bytecode
 * at all on BSC (`eth_getCode` → `0x`). A call to an address with no code does
 * not revert: it mines successfully, moves nothing, and emits nothing. So a BSC
 * fraction transfer looked like it worked, cost the seller gas, and delivered
 * no fractions.
 *
 * This is the exact failure `CHAIN_CONFIGS` documents for streamController,
 * where the same address was copied across chains and sendTip/sendFundsForPPV
 * mined while moving nothing. Same constant, same mistake, second place.
 */

import { Interface } from 'ethers';
import { writeContractAA, type AAWriteResult } from './aa-utils';
import { BASE_CHAIN_ID, getChainConfig } from './dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';

const ERC1155_TRANSFER_ABI = [
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address account, address operator) view returns (bool)',
];

const erc1155Interface = new Interface(ERC1155_TRANSFER_ABI);

/**
 * The collection holding this chain's fractions.
 *
 * Throws on a chain with no configured collection rather than falling back to
 * Base's — a wrong address here is silent, and silence is what made the BSC
 * path look healthy. Robinhood's is env-driven and empty until the bridge
 * lands, so it is treated as unconfigured too.
 */
function collectionFor(chainId: ChainId): string {
  const address = getChainConfig(chainId).streamCollection;
  if (!address) {
    throw new Error(`Fractions are not available on this chain yet (${chainId})`);
  }
  return address;
}

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
    collectionFor(chainId),
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
    collectionFor(chainId),
    erc1155Interface,
    'setApprovalForAll',
    [operator, approved],
    { context: 'set approval', chainId }
  );
}
