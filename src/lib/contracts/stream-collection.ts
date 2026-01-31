/**
 * StreamCollection Smart Contract Integration
 * ============================================
 * ERC1155 contract for minting DeHub content NFTs on Base Mainnet.
 * Uses Web3Auth provider for gasless transactions via Pimlico AA.
 */

import { BrowserProvider, Contract, type Signer } from 'ethers';
import { getWeb3AuthProvider } from '@/lib/web3auth';

// Contract address on Base Mainnet
export const STREAM_COLLECTION_ADDRESS = '0x9f8012074d27F8596C0E5038477ACB52057BC934';

// Minimal ABI for the mint function
export const STREAM_COLLECTION_ABI = [
  {
    inputs: [
      { internalType: 'uint256', name: 'id', type: 'uint256' },
      { internalType: 'uint256', name: 'timestamp', type: 'uint256' },
      { internalType: 'uint8', name: 'v', type: 'uint8' },
      { internalType: 'bytes32', name: 'r', type: 'bytes32' },
      { internalType: 'bytes32', name: 's', type: 'bytes32' },
      {
        components: [
          { internalType: 'address payable', name: 'recipient', type: 'address' },
          { internalType: 'uint256', name: 'value', type: 'uint256' },
        ],
        internalType: 'struct ERC1155Base.Fee[]',
        name: 'fees',
        type: 'tuple[]',
      },
      { internalType: 'uint256', name: 'supply', type: 'uint256' },
      { internalType: 'string', name: 'uri', type: 'string' },
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: '_owner', type: 'address' },
      { internalType: 'uint256', name: '_id', type: 'uint256' },
    ],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '_id', type: 'uint256' }],
    name: 'uri',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'creators',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Debug function to verify signature recovery
  {
    inputs: [
      { internalType: 'uint256', name: 'id', type: 'uint256' },
      { internalType: 'uint8', name: 'v', type: 'uint8' },
      { internalType: 'bytes32', name: 'r', type: 'bytes32' },
      { internalType: 'bytes32', name: 's', type: 'bytes32' },
    ],
    name: 'getecrecover',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

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
 * Get a signer from Web3Auth provider
 */
export async function getWeb3AuthSigner(): Promise<Signer> {
  const web3AuthProvider = getWeb3AuthProvider();
  
  if (!web3AuthProvider) {
    throw new Error('Web3Auth not connected. Please sign in first.');
  }

  const provider = new BrowserProvider(web3AuthProvider);
  return provider.getSigner();
}

/**
 * Get the StreamCollection contract instance
 */
export async function getStreamCollectionContract(): Promise<Contract> {
  const signer = await getWeb3AuthSigner();
  return new Contract(STREAM_COLLECTION_ADDRESS, STREAM_COLLECTION_ABI, signer);
}

/**
 * Execute the mint function on StreamCollection contract
 * This is Step 2 of the minting flow - the on-chain transaction
 * 
 * @param params - Mint parameters from API response (v, r, s, createdTokenId, timestamp)
 * @returns Transaction hash
 */
export async function mintOnChain(params: MintParams): Promise<string> {
  console.log('[StreamCollection] Starting on-chain mint with params:', params);
  console.log('[StreamCollection] Full mint params JSON:', JSON.stringify(params, null, 2));
  
  const contract = await getStreamCollectionContract();
  const signer = await getWeb3AuthSigner();
  const signerAddress = await signer.getAddress();
  
  console.log('[StreamCollection] Signer address (msg.sender):', signerAddress);
  
  // Prepare parameters
  const tokenId = BigInt(params.tokenId);
  const timestamp = BigInt(params.timestamp);
  const v = params.v;
  const r = params.r.startsWith('0x') ? params.r : `0x${params.r}`;
  const s = params.s.startsWith('0x') ? params.s : `0x${params.s}`;
  
  // Debug: Call getecrecover to see what address the signature recovers to
  try {
    const recoveredAddress = await contract.getecrecover(tokenId, v, r, s);
    console.log('[StreamCollection] Recovered signer from signature:', recoveredAddress);
    console.log('[StreamCollection] Expected signer (likely contract owner/backend):', 'Check if this matches DeHub backend signer');
    
    // If recovered address is the zero address, signature is invalid
    if (recoveredAddress === '0x0000000000000000000000000000000000000000') {
      console.error('[StreamCollection] Signature recovery returned zero address - invalid signature');
    }
  } catch (ecrecoverError) {
    console.warn('[StreamCollection] getecrecover call failed (function may not exist):', ecrecoverError);
  }
  
  // Default to empty fees array (no royalties) - fees can be set via DeHub backend
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
    // Call the mint function
    const tx = await contract.mint(
      tokenId,
      timestamp,
      v,
      r,
      s,
      fees,
      supply,
      uri
    );

    console.log('[StreamCollection] Transaction submitted:', tx.hash);

    // Wait for confirmation
    const receipt = await tx.wait();
    console.log('[StreamCollection] Transaction confirmed:', receipt.hash);

    return receipt.hash;
  } catch (error: unknown) {
    console.error('[StreamCollection] Mint failed:', error);
    console.error('[StreamCollection] Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    
    // Extract meaningful error message
    if (error instanceof Error) {
      // Check for common revert reasons
      if (error.message.includes('insufficient funds')) {
        throw new Error('Insufficient funds for gas. Please add ETH to your wallet.');
      }
      if (error.message.includes('user rejected')) {
        throw new Error('Transaction was rejected by user.');
      }
      if (error.message.includes('already minted') || error.message.includes('token already exists')) {
        throw new Error('This content has already been minted.');
      }
      if (error.message.includes('invalid signature') || error.message.includes('signer should sign tokenId')) {
        console.error('[StreamCollection] Signature mismatch! The backend signature does not match what the contract expects.');
        console.error('[StreamCollection] This may be because:');
        console.error('  1. The message hash format differs (minter address included?)');
        console.error('  2. The signature was meant for a different function');
        console.error('  3. The backend signer is not authorized on the contract');
        throw new Error('Signature verification failed. The minting signature could not be verified on-chain.');
      }
      throw error;
    }
    
    throw new Error('Failed to mint on-chain. Please try again.');
  }
}

/**
 * Check if a token exists (has been minted)
 */
export async function isTokenMinted(tokenId: string | number): Promise<boolean> {
  try {
    const contract = await getStreamCollectionContract();
    const creator = await contract.creators(BigInt(tokenId));
    // If creator is not the zero address, token exists
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
  const contract = await getStreamCollectionContract();
  return contract.balanceOf(owner, BigInt(tokenId));
}
