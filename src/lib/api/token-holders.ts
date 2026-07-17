/**
 * Token Holders Utility
 * =====================
 * Queries on-chain data to get fraction holders for DeHub NFTs.
 * Each token has 1000 fractions that can be owned by different wallets.
 */

import { createPublicClient, http, parseAbiItem, encodeFunctionData, decodeFunctionResult, type Address, type Hex } from 'viem';
import { base, bsc } from 'viem/chains';
import { supabase } from '@/integrations/supabase/client';

export interface TokenHolder {
  address: string;
  balance: number;
  percentage: number;
}

// DeHub NFT Contract addresses per chain
export const DEHUB_CONTRACTS: Record<number, Address> = {
  8453: '0x9f8012074d27F8596C0E5038477ACB52057BC934', // Base
  56: '0x1065F5922a336C75623B55D22c4a0C760efCe947',   // BNB Chain
};

// Total fractions per token
export const TOTAL_FRACTIONS = 1000;

// ERC-1155 balanceOf ABI for querying current holdings
const BALANCE_OF_ABI = [{
  name: 'balanceOf',
  type: 'function',
  stateMutability: 'view',
  inputs: [
    { type: 'address', name: 'account' },
    { type: 'uint256', name: 'id' }
  ],
  outputs: [{ type: 'uint256', name: '' }]
}] as const;

// ERC-1155 Transfer events ABI for finding holder addresses
const TRANSFER_SINGLE_ABI = parseAbiItem(
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)'
);

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const QUERY_TIMEOUT_MS = 15000; // 15 second timeout (increased for Alchemy)
const RECENT_BLOCKS = 500_000n; // ~2 weeks on Base
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minute cache TTL

// Cache RPC endpoints to avoid repeated edge function calls
let cachedEndpoints: { base: string; bsc: string } | null = null;

// LocalStorage cache for token holders (persists across sessions)
interface CachedHolders {
  holders: TokenHolder[];
  timestamp: number;
}

function getCacheKey(tokenId: number | string, chainId: number): string {
  return `token-holders-${chainId}-${tokenId}`;
}

function getCachedHolders(tokenId: number | string, chainId: number): TokenHolder[] | null {
  try {
    const key = getCacheKey(tokenId, chainId);
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    
    const parsed: CachedHolders = JSON.parse(cached);
    const age = Date.now() - parsed.timestamp;
    
    // Return cached data if less than TTL
    if (age < CACHE_TTL_MS) {
      console.log(`[TokenHolders] Using cached data (${Math.round(age / 1000)}s old)`);
      return parsed.holders;
    }
    
    return null;
  } catch {
    return null;
  }
}

function setCachedHolders(tokenId: number | string, chainId: number, holders: TokenHolder[]): void {
  try {
    const key = getCacheKey(tokenId, chainId);
    const cached: CachedHolders = {
      holders,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(cached));
  } catch {
    // localStorage might be full or disabled
  }
}

const RPC_SESSION_KEY = 'dehub_rpc_endpoints';
const FALLBACK_ENDPOINTS = { base: 'https://mainnet.base.org', bsc: 'https://bsc-dataseed1.binance.org' };

/**
 * Fetch RPC endpoints — cached in sessionStorage to avoid repeated edge function calls.
 */
async function getRpcEndpoints(): Promise<{ base: string; bsc: string }> {
  if (cachedEndpoints) return cachedEndpoints;

  // Check sessionStorage first (shared with dhb-token.ts)
  try {
    const stored = sessionStorage.getItem(RPC_SESSION_KEY);
    if (stored) {
      cachedEndpoints = JSON.parse(stored);
      return cachedEndpoints!;
    }
  } catch {}

  try {
    const { data, error } = await supabase.functions.invoke('get-rpc-endpoints');
    if (error || !data) {
      console.warn('Failed to fetch RPC endpoints, using fallback');
      return FALLBACK_ENDPOINTS;
    }
    cachedEndpoints = data;
    try { sessionStorage.setItem(RPC_SESSION_KEY, JSON.stringify(data)); } catch {}
    return data;
  } catch (err) {
    console.warn('Error fetching RPC endpoints:', err);
    return FALLBACK_ENDPOINTS;
  }
}

/**
 * Get token holders by querying recent transfers then checking current balances
 */
export async function getTokenHolders(
  tokenId: number | string,
  chainId: number = 8453
): Promise<TokenHolder[]> {
  const contractAddress = DEHUB_CONTRACTS[chainId];
  
  if (!contractAddress || contractAddress === ZERO_ADDRESS) {
    console.warn('Contract address not configured for chain:', chainId);
    return [];
  }
  
  // Check localStorage cache first
  const cached = getCachedHolders(tokenId, chainId);
  if (cached !== null) {
    return cached;
  }
  
  const tokenIdBigInt = BigInt(tokenId);
  
  // Wrap in timeout to prevent hanging
  const timeoutPromise = new Promise<TokenHolder[]>((_, reject) =>
    setTimeout(() => reject(new Error('Query timeout')), QUERY_TIMEOUT_MS)
  );
  
  const fetchHolders = async (): Promise<TokenHolder[]> => {
    try {
      // Get RPC endpoints dynamically
      const endpoints = await getRpcEndpoints();
      const rpcUrl = chainId === 8453 ? endpoints.base : endpoints.bsc;
      
      console.log(`[TokenHolders] Using RPC: ${rpcUrl.includes('alchemy') ? 'Alchemy' : 'Public'} for chain ${chainId}`);
      
      // Create client with the appropriate RPC
      const client = createPublicClient({
        chain: chainId === 8453 ? base : bsc,
        transport: http(rpcUrl),
      });
      
      // Get current block number
      const currentBlock = await client.getBlockNumber();
      const fromBlock = currentBlock > RECENT_BLOCKS ? currentBlock - RECENT_BLOCKS : 0n;
      
      console.log(`[TokenHolders] Querying events from block ${fromBlock} to ${currentBlock} for token ${tokenId}`);
      
      // Query recent TransferSingle events to find addresses that have held this token
      const singleLogs = await client.getLogs({
        address: contractAddress,
        event: TRANSFER_SINGLE_ABI,
        fromBlock,
        toBlock: 'latest',
      });
      
      console.log(`[TokenHolders] Found ${singleLogs.length} transfer events`);
      
      // Filter logs for the specific token ID and collect unique addresses
      const addresses = new Set<string>();
      
      for (const log of singleLogs) {
        const args = log.args as { id?: bigint; from?: string; to?: string };
        if (args.id !== tokenIdBigInt) continue;
        
        if (args.from && args.from !== ZERO_ADDRESS) {
          addresses.add(args.from.toLowerCase());
        }
        if (args.to && args.to !== ZERO_ADDRESS) {
          addresses.add(args.to.toLowerCase());
        }
      }
      
      console.log(`[TokenHolders] Found ${addresses.size} unique addresses for token ${tokenId}`);
      
      if (addresses.size === 0) {
        return [];
      }
      
      // Query current balanceOf for each discovered address
      const holders: TokenHolder[] = [];
      
      // Batch the balance queries (max 10 concurrent)
      const addressArray = Array.from(addresses);
      const batchSize = 10;
      
      for (let i = 0; i < addressArray.length; i += batchSize) {
        const batch = addressArray.slice(i, i + batchSize);
        const balancePromises = batch.map(async (addr) => {
          try {
            const callData = encodeFunctionData({
              abi: BALANCE_OF_ABI,
              functionName: 'balanceOf',
              args: [addr as Address, tokenIdBigInt],
            });
            
            const result = await client.call({
              to: contractAddress,
              data: callData,
            });
            
            if (!result.data) {
              return { addr, balance: 0n };
            }
            
            const balance = decodeFunctionResult({
              abi: BALANCE_OF_ABI,
              functionName: 'balanceOf',
              data: result.data as Hex,
            }) as bigint;
            
            return { addr, balance };
          } catch {
            return { addr, balance: 0n };
          }
        });
        
        const results = await Promise.all(balancePromises);
        
        for (const { addr, balance } of results) {
          if (balance > 0n) {
            const balanceNum = Number(balance);
            holders.push({
              address: addr,
              balance: balanceNum,
              percentage: Math.round((balanceNum / TOTAL_FRACTIONS) * 100),
            });
          }
        }
      }
      
      console.log(`[TokenHolders] Found ${holders.length} current holders for token ${tokenId}`);
      
      // Sort by balance descending
      holders.sort((a, b) => b.balance - a.balance);
      
      // Cache the results in localStorage
      setCachedHolders(tokenId, chainId, holders);
      
      return holders;
    } catch (error) {
      console.error('Error fetching token holders:', error);
      return [];
    }
  };
  
  try {
    return await Promise.race([fetchHolders(), timeoutPromise]);
  } catch (error) {
    console.warn('Token holders query failed or timed out:', error);
    return [];
  }
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address || 'Unknown';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
