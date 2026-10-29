/**
 * The viem half of token-holders.
 * ===============================
 * Split out so token-holders can load it on the first on-chain read. Profile
 * and fraction panels import token-holders for small helpers, and used to
 * download the RPC client on every visit for nothing.
 */

import { createPublicClient, http, parseAbiItem } from 'viem';
import { base, bsc } from 'viem/chains';

export { encodeFunctionData, decodeFunctionResult } from 'viem';

// ERC-1155 Transfer events ABI for finding holder addresses
export const TRANSFER_SINGLE_ABI = parseAbiItem(
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)'
);

export function createChainClient(chainId: number, rpcUrl: string) {
  return createPublicClient({
    chain: chainId === 8453 ? base : bsc,
    transport: http(rpcUrl),
  });
}
