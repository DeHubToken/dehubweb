/**
 * StreamCollection Smart Contract Integration
 * ============================================
 * ERC1155 contract for minting DeHub content NFTs on Base Mainnet.
 * Uses AA-aware utilities for gasless transactions via Web3Auth + Pimlico.
 */

import { Interface } from 'ethers';
import { writeContractAA, getWalletAddress, parseTxError } from './aa-utils';
import { BASE_CHAIN_ID } from './dhb-token';

// Contract address on Base Mainnet
export const STREAM_COLLECTION_ADDRESS = '0x9f8012074d27F8596C0E5038477ACB52057BC934';

// Re-export chain ID for convenience
export { BASE_CHAIN_ID };

// Minimal ABI for the mint function
export const STREAM_COLLECTION_ABI = [
  'function mint(uint256 id, uint256 timestamp, uint8 v, bytes32 r, bytes32 s, tuple(address recipient, uint256 value)[] fees, uint256 supply, string uri)',
  'function balanceOf(address owner, uint256 id) view returns (uint256)',
  'function uri(uint256 id) view returns (string)',
  'function creators(uint256 id) view returns (address)',
  'function getecrecover(uint256 id, uint8 v, bytes32 r, bytes32 s) view returns (address)',
];

// Create interface for encoding/decoding
const streamCollectionInterface = new Interface(STREAM_COLLECTION_ABI);

// Fee structure for royalties
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
  console.log('[StreamCollection] Starting on-chain mint with params:', params);
  
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
  
  // Default supply of 1 for unique content
  const supply = BigInt(params.supply || 1);
  
  // URI is typically empty as metadata is stored on DeHub's backend
  const uri = params.uri || '';

  console.log('[StreamCollection] Calling mint with:', {
    tokenId: tokenId.toString(),
    timestamp: timestamp.toString(),
    v,
    r,
    s,
    fees,
    supply: supply.toString(),
    uri,
    signerAddress,
  });

  try {
    // Use AA-aware write
    const result = await writeContractAA(
      STREAM_COLLECTION_ADDRESS,
      streamCollectionInterface,
      'mint',
      [tokenId, timestamp, v, r, s, fees, supply, uri],
      { context: 'mint NFT' }
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
export async function isTokenMinted(tokenId: string | number): Promise<boolean> {
  try {
    const { readContract } = await import('./aa-utils');
    const creator = await readContract<string>(
      STREAM_COLLECTION_ADDRESS,
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
  tokenId: string | number
): Promise<bigint> {
  const { readContract } = await import('./aa-utils');
  return readContract<bigint>(
    STREAM_COLLECTION_ADDRESS,
    streamCollectionInterface,
    'balanceOf',
    [owner, BigInt(tokenId)]
  );
}
