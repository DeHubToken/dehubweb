/**
 * StreamCollection Smart Contract Integration
 * ============================================
 * ERC1155 contract for minting DeHub content NFTs.
 * Supports Base and BNB chains with chain-specific contract addresses.
 */

import { Interface, parseUnits } from 'ethers';
import { writeContractAA, writeBatchAA, getWalletAddress, parseTxError, switchChain, type AABatchCall } from './aa-utils';
import { BASE_CHAIN_ID, getChainConfig } from './dhb-token';
import { isV3Chain } from '@/lib/chains/robinhood';
import { createLogger } from '@/lib/logger';

const mintChainLogger = createLogger('StreamCollection.mintOnChain');
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

/**
 * v3 collections (Robinhood Chain) take one EIP-712 signature instead of the
 * split r/s/v, and a `deadline` instead of v1's `timestamp` — which the old
 * contract only ever bounded from below, so a future-dated signature never
 * expired. There is no `fees` argument: royalties are ERC-2981 and set on the
 * contract rather than per mint.
 */
export const STREAM_COLLECTION_V3_ABI = [
  'function mint(uint256 tokenId, uint256 supply, string uri, uint256 deadline, bytes signature)',
  'function balanceOf(address owner, uint256 id) view returns (uint256)',
  'function uri(uint256 id) view returns (string)',
  'function creators(uint256 id) view returns (address)',
];

// Create interface for encoding/decoding
const streamCollectionInterface = new Interface(STREAM_COLLECTION_ABI);
const streamCollectionV3Interface = new Interface(STREAM_COLLECTION_V3_ABI);

// Fee structure for royalties (recipient + value in basis points)
export interface MintFee {
  recipient: string;
  value: bigint;
}

/**
 * What minting costs the creator, as quoted by GET /api/mint_fee.
 *
 * Only sponsored (built-in wallet) sessions are ever quoted: an external
 * wallet pays its own gas, so there is no cost to recover from it.
 */
export interface MintFeeQuote {
  amount: number;
  symbol: string;
  tokenAddress: string;
  recipient?: string;
  chargeable: boolean;
  decimals: number;
  isNative: boolean;
}

// Parameters for the mint function
export interface MintParams {
  tokenId: string | number;
  /** v1 chains only — v3 sends `deadline` instead. */
  timestamp?: number;
  v?: number;
  r?: string;
  s?: string;
  /** v3 chains: single EIP-712 signature plus its expiry. */
  signature?: string;
  deadline?: number;
  /** Set to 3 by the API when the chain runs the v3 contracts. */
  sigVersion?: number;
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
 * Mint against a v3 collection.
 *
 * The signature binds the creator, so this transaction can only be sent by the
 * address the API signed for — on v1 anyone could lift a pending mint out of
 * the mempool, resubmit it first, and end up owning the post.
 */
async function mintOnChainV3(
  params: MintParams,
  chainId: ChainId,
  chainConfig: ReturnType<typeof getChainConfig>,
): Promise<{ hash: string; confirmed: Promise<string> }> {
  if (!params.signature || !params.deadline) {
    throw new Error('Mint authorisation is missing its signature — retry the upload.');
  }

  const tokenId = BigInt(params.tokenId);
  const supply = BigInt(params.supply || 1000);
  const uri = params.uri || `${params.tokenId}.json`;

  console.log('[StreamCollection] v3 mint:', {
    contract: chainConfig.streamCollection,
    chain: chainConfig.name,
    tokenId: tokenId.toString(),
    supply: supply.toString(),
    uri,
    deadline: params.deadline,
  });

  try {
    const result = await writeContractAA(
      chainConfig.streamCollection,
      streamCollectionV3Interface,
      'mint',
      [tokenId, supply, uri, BigInt(params.deadline), params.signature],
      { context: 'mint NFT', chainId },
    );

    const confirmed = result.wait(1).then((receipt: any) => receipt.hash as string);
    return { hash: result.hash, confirmed };
  } catch (error) {
    console.error('[StreamCollection] v3 mint failed:', error);
    mintChainLogger.error(error instanceof Error ? error.message : String(error), {
      chainId,
      tokenId: String(params.tokenId),
    });
    throw new Error(parseTxError(error));
  }
}

/**
 * Execute the mint function on StreamCollection contract
 * This is Step 2 of the minting flow - the on-chain transaction
 * 
 * @param params - Mint parameters from API response (v, r, s, createdTokenId, timestamp)
 * @returns Transaction hash
 */
export async function mintOnChain(params: MintParams): Promise<{ hash: string; confirmed: Promise<string> }> {
  const chainId = params.chainId || BASE_CHAIN_ID;
  const chainConfig = getChainConfig(chainId);
  
  console.log('[StreamCollection] Starting on-chain mint with params:', { ...params, chain: chainConfig.name });
  
  // Switch to the correct chain first
  await switchChain(chainId);
  
  const signerAddress = await getWalletAddress();
  console.log('[StreamCollection] Signer address:', signerAddress);

  if (params.sigVersion === 3 || isV3Chain(chainId)) {
    return mintOnChainV3(params, chainId, chainConfig);
  }

  // Prepare parameters
  const tokenId = BigInt(params.tokenId);
  const timestamp = BigInt(params.timestamp ?? 0);
  const v = params.v;
  const r = params.r?.startsWith('0x') ? params.r : `0x${params.r}`;
  const s = params.s?.startsWith('0x') ? params.s : `0x${params.s}`;
  
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
    
    // Return hash immediately + background confirmation promise
    const confirmed = result.wait(1).then((receipt: any) => {
      console.log('[StreamCollection] Transaction confirmed:', receipt.hash);
      return receipt.hash as string;
    });
    
    return { hash: result.hash, confirmed };
  } catch (error) {
    console.error('[StreamCollection] Mint failed:', error);
    // Log to backend for server-side debugging
    mintChainLogger.error(
      error instanceof Error ? error.message : String(error),
      {
        tokenId: params.tokenId,
        chainId,
        chainName: chainConfig.name,
        contract: chainConfig.streamCollection,
      },
      error instanceof Error ? error : undefined,
    );
    throw error;
  }
}

/** Minimal ERC-20 surface — only the fee transfer is encoded here. */
const erc20Interface = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

/**
 * Mint, and pay the mint fee, in a single sponsored transaction.
 *
 * The fee transfer and the mint go into one user operation, so the creator
 * signs once and the collection contract needs no knowledge of fees. A DHB fee
 * is an ERC-20 transfer out of the smart account, which needs no `approve`
 * because the account moves its own tokens; a native fee (Robinhood Chain,
 * where DHB is not deployed) rides as the call's value.
 *
 * Falls back to an unbatched mint whenever there is nothing to charge — no
 * treasury configured, a zero quote, or a session that cannot batch. Losing
 * the fee is always preferable to losing the post.
 */
export async function mintOnChainWithFee(
  params: MintParams,
  fee: MintFeeQuote | null,
): Promise<{ hash: string; confirmed: Promise<string> }> {
  const chainId = params.chainId || BASE_CHAIN_ID;
  const chainConfig = getChainConfig(chainId);

  const collectable =
    !!fee && fee.chargeable && !!fee.recipient && fee.amount > 0;
  if (!collectable) {
    return mintOnChain(params);
  }

  await switchChain(chainId);

  const amountWei = parseUnits(fee.amount.toFixed(fee.decimals), fee.decimals);
  const isV3 = params.sigVersion === 3 || isV3Chain(chainId);

  const mintData = isV3
    ? streamCollectionV3Interface.encodeFunctionData('mint', [
        BigInt(params.tokenId),
        BigInt(params.supply || 1000),
        params.uri || `${params.tokenId}.json`,
        BigInt(params.deadline ?? 0),
        params.signature,
      ])
    : streamCollectionInterface.encodeFunctionData('mint', [
        BigInt(params.tokenId),
        BigInt(params.timestamp ?? 0),
        params.v,
        params.r?.startsWith('0x') ? params.r : `0x${params.r}`,
        params.s?.startsWith('0x') ? params.s : `0x${params.s}`,
        params.fees || [],
        BigInt(params.supply || 1000),
        params.uri || `${params.tokenId}.json`,
      ]);

  const feeCall: AABatchCall = fee.isNative
    ? { to: fee.recipient!, data: '0x' as `0x${string}`, value: amountWei }
    : {
        to: fee.tokenAddress,
        data: erc20Interface.encodeFunctionData('transfer', [
          fee.recipient,
          amountWei,
        ]) as `0x${string}`,
      };

  console.log('[StreamCollection] Minting with fee:', {
    tokenId: String(params.tokenId),
    fee: `${fee.amount} ${fee.symbol}`,
    chain: chainConfig.name,
  });

  try {
    const result = await writeBatchAA(
      [feeCall, { to: chainConfig.streamCollection, data: mintData as `0x${string}` }],
      { context: 'mint NFT', chainId },
    );
    return { hash: result.hash, confirmed: Promise.resolve(result.hash) };
  } catch (error) {
    // A session that cannot batch is not a failed mint — send the mint on its
    // own rather than blocking the creator over an uncharged fee.
    if (error instanceof Error && error.message === 'BATCH_UNSUPPORTED') {
      console.warn('[StreamCollection] Batching unavailable — minting without charging');
      return mintOnChain(params);
    }
    console.error('[StreamCollection] Mint with fee failed:', error);
    mintChainLogger.error(
      error instanceof Error ? error.message : String(error),
      { tokenId: params.tokenId, chainId, chainName: chainConfig.name, withFee: true },
      error instanceof Error ? error : undefined,
    );
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
