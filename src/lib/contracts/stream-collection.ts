/**
 * StreamCollection Smart Contract Integration
 * ============================================
 * ERC1155 contract for minting DeHub content NFTs.
 * Supports Base and BNB chains with chain-specific contract addresses.
 */

import { Interface } from 'ethers';
import { writeContractAA, getWalletAddress, parseTxError, switchChain } from './aa-utils';
import { BASE_CHAIN_ID, getChainConfig } from './dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';

// Contract address on Base Mainnet (default for backward compatibility)
export const STREAM_COLLECTION_ADDRESS = '0x9f8012074d27F8596C0E5038477ACB52057BC934';

// Re-export chain ID for convenience
export { BASE_CHAIN_ID };

// Minimal ABI for the mint function - matches actual contract signature
// mint(id, timestamp, v, r, s, fees[], supply, uri)
export const STREAM_COLLECTION_ABI = [
  'function mint(uint256 id, uint256 timestamp, uint8 v, bytes32 r, bytes32 s, tuple(address recipient, uint256 value)[] fees, uint256 supply, string uri)',
  'function balanceOf(address owner, uint256 id) view returns (uint256)',
  'function uri(uint256 id) view returns (string)',
  'function creators(uint256 id) view returns (address)',
  'function getecrecover(uint256 id, uint8 v, bytes32 r, bytes32 s) view returns (address)',
];

// Create interface for encoding/decoding
const streamCollectionInterface = new Interface(STREAM_COLLECTION_ABI);

// Fee structure for royalties (recipient + value in basis points)
export interface MintFee {
  recipient: string;
  value: bigint;
}

// Parameters for the mint function
export interface MintParams {
  tokenId: string | number;
  timestamp: number;
  v: number;
  r: string;
  s: string;
  fees?: MintFee[];
  supply?: number;
  uri?: string;
  chainId?: ChainId;
}

/**
 * Get wallet address from Web3Auth - exported for backward compatibility
 */
export { getWalletAddress as getWeb3AuthSigner };

/**
 * Execute the mint function on StreamCollection contract
 * This is Step 2 of the minting flow - the on-chain transaction
 * 
 * @param params - Mint parameters from API response (v, r, s, createdTokenId, timestamp)
 * @returns Transaction hash
 */
export async function mintOnChain(params: MintParams): Promise<string> {
  const chainId = params.chainId || BASE_CHAIN_ID;
  const chainConfig = getChainConfig(chainId);
  
  console.log('[StreamCollection] Starting on-chain mint with params:', { ...params, chain: chainConfig.name });
  
  // Switch to the correct chain first
  await switchChain(chainId);
  
  const signerAddress = await getWalletAddress();
  console.log('[StreamCollection] Signer address:', signerAddress);
  
  // Prepare parameters
  const tokenId = BigInt(params.tokenId);
  const timestamp = BigInt(params.timestamp);
  const v = params.v;
  const r = params.r.startsWith('0x') ? params.r : `0x${params.r}`;
  const s = params.s.startsWith('0x') ? params.s : `0x${params.s}`;
  
  // Default to empty fees array (no royalties)
  const fees: Array<{ recipient: string; value: bigint }> = params.fees || [];
  
  // Default supply of 1000 for content (matches existing app behavior)
  const supply = BigInt(params.supply || 1000);
  
  // URI format: {tokenId}.json
  const uri = params.uri || `${params.tokenId}.json`;

  console.log('[StreamCollection] Calling mint with:', {
    contract: chainConfig.streamCollection,
    chain: chainConfig.name,
    tokenId: tokenId.toString(),
    timestamp: timestamp.toString(),
    v,
    r,
    s,
    fees,
    supply: supply.toString(),
    uri,
  });

  try {
    // Use AA-aware write with chain-specific contract address
    const result = await writeContractAA(
      chainConfig.streamCollection,
      streamCollectionInterface,
      'mint',
      [tokenId, timestamp, v, r, s, fees, supply, uri],
      { context: 'mint NFT', chainId }
    );
    
    console.log('[StreamCollection] Transaction submitted:', result.hash);
    
    // Wait for confirmation
    const receipt = await result.wait(1);
    console.log('[StreamCollection] Transaction confirmed:', receipt.hash);
    
    return receipt.hash;
  } catch (error) {
    console.error('[StreamCollection] Mint failed:', error);
    throw error;
  }
}

/**
 * Check if a token exists (has been minted)
 */
export async function isTokenMinted(tokenId: string | number, chainId: ChainId = BASE_CHAIN_ID): Promise<boolean> {
  try {
    const chainConfig = getChainConfig(chainId);
    const { readContract } = await import('./aa-utils');
    const creator = await readContract<string>(
      chainConfig.streamCollection,
      streamCollectionInterface,
      'creators',
      [BigInt(tokenId)]
    );
    return creator !== '0x0000000000000000000000000000000000000000';
  } catch {
    return false;
  }
}

/**
 * Get the balance of a token for a specific owner
 */
export async function getTokenBalance(
  owner: string,
  tokenId: string | number,
  chainId: ChainId = BASE_CHAIN_ID
): Promise<bigint> {
  const chainConfig = getChainConfig(chainId);
  const { readContract } = await import('./aa-utils');
  return readContract<bigint>(
    chainConfig.streamCollection,
    streamCollectionInterface,
    'balanceOf',
    [owner, BigInt(tokenId)]
  );
}
