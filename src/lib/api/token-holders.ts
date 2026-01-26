/**
 * Token Holders Utility
 * =====================
 * Queries on-chain data to get fraction holders for DeHub NFTs.
 * Each token has 1000 fractions that can be owned by different wallets.
 */

import { createPublicClient, http, parseAbiItem, encodeFunctionData, decodeFunctionResult, type Address, type Hex } from 'viem';
import { base, bsc } from 'viem/chains';

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

// Create public clients for each chain
const clients = {
  8453: createPublicClient({
    chain: base,
    transport: http(),
  }),
  56: createPublicClient({
    chain: bsc,
    transport: http(),
  }),
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const QUERY_TIMEOUT_MS = 8000; // 8 second timeout
const RECENT_BLOCKS = 500_000n; // ~2 weeks on Base

/**
 * Get token holders by querying recent transfers then checking current balances
 */
export async function getTokenHolders(
  tokenId: number | string,
  chainId: number = 8453
): Promise<TokenHolder[]> {
  const contractAddress = DEHUB_CONTRACTS[chainId];
  const client = clients[chainId as keyof typeof clients];
  
  if (!contractAddress || contractAddress === ZERO_ADDRESS) {
    console.warn('Contract address not configured for chain:', chainId);
    return [];
  }
  
  if (!client) {
    console.warn('No client configured for chain:', chainId);
    return [];
  }
  
  const tokenIdBigInt = BigInt(tokenId);
  
  // Wrap in timeout to prevent hanging
  const timeoutPromise = new Promise<TokenHolder[]>((_, reject) =>
    setTimeout(() => reject(new Error('Query timeout')), QUERY_TIMEOUT_MS)
  );
  
  const fetchHolders = async (): Promise<TokenHolder[]> => {
    try {
      // Get current block number
      const currentBlock = await client.getBlockNumber();
      const fromBlock = currentBlock > RECENT_BLOCKS ? currentBlock - RECENT_BLOCKS : 0n;
      
      // Query recent TransferSingle events to find addresses that have held this token
      const singleLogs = await client.getLogs({
        address: contractAddress,
        event: TRANSFER_SINGLE_ABI,
        fromBlock,
        toBlock: 'latest',
      });
      
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
      
      // Sort by balance descending
      holders.sort((a, b) => b.balance - a.balance);
      
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
