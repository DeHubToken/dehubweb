/**
 * Token Holders Utility
 * =====================
 * Queries on-chain data to get fraction holders for DeHub NFTs.
 * Each token has 1000 fractions that can be owned by different wallets.
 */

import { createPublicClient, http, parseAbiItem, type Address } from 'viem';
import { base, bsc } from 'viem/chains';

export interface TokenHolder {
  address: string;
  balance: number;
  percentage: number;
}

// DeHub NFT Contract addresses per chain
// TODO: Replace with actual contract addresses
export const DEHUB_CONTRACTS: Record<number, Address> = {
  8453: '0x0000000000000000000000000000000000000000', // Base - needs real address
  56: '0x0000000000000000000000000000000000000000',   // BNB Chain - needs real address
};

// Total fractions per token
export const TOTAL_FRACTIONS = 1000;

// ERC-1155 Transfer events ABI
const TRANSFER_SINGLE_ABI = parseAbiItem(
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)'
);

const TRANSFER_BATCH_ABI = parseAbiItem(
  'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)'
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

/**
 * Get token holders by querying Transfer events and aggregating balances
 */
export async function getTokenHolders(
  tokenId: number | string,
  chainId: number = 8453
): Promise<TokenHolder[]> {
  const contractAddress = DEHUB_CONTRACTS[chainId];
  const client = clients[chainId as keyof typeof clients];
  
  if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
    console.warn('Contract address not configured for chain:', chainId);
    return [];
  }
  
  if (!client) {
    console.warn('No client configured for chain:', chainId);
    return [];
  }
  
  try {
    // Query TransferSingle events for this token ID
    const singleLogs = await client.getLogs({
      address: contractAddress,
      event: TRANSFER_SINGLE_ABI,
      fromBlock: 'earliest',
      toBlock: 'latest',
    });
    
    // Filter logs for the specific token ID
    const tokenIdBigInt = BigInt(tokenId);
    const filteredLogs = singleLogs.filter((log) => {
      const args = log.args as { id?: bigint };
      return args.id === tokenIdBigInt;
    });
    
    // Aggregate balances from transfer events
    const balances = new Map<string, bigint>();
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
    
    for (const log of filteredLogs) {
      const { from, to, value } = log.args as { from: string; to: string; value: bigint };
      
      // Subtract from sender (unless mint)
      if (from && from !== ZERO_ADDRESS) {
        const currentBalance = balances.get(from.toLowerCase()) || 0n;
        balances.set(from.toLowerCase(), currentBalance - value);
      }
      
      // Add to receiver (unless burn)
      if (to && to !== ZERO_ADDRESS) {
        const currentBalance = balances.get(to.toLowerCase()) || 0n;
        balances.set(to.toLowerCase(), currentBalance + value);
      }
    }
    
    // Convert to array and filter out zero balances
    const holders: TokenHolder[] = [];
    
    for (const [address, balance] of balances.entries()) {
      if (balance > 0n) {
        const balanceNum = Number(balance);
        holders.push({
          address,
          balance: balanceNum,
          percentage: Math.round((balanceNum / TOTAL_FRACTIONS) * 100),
        });
      }
    }
    
    // Sort by balance descending
    holders.sort((a, b) => b.balance - a.balance);
    
    return holders;
  } catch (error) {
    console.error('Error fetching token holders:', error);
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
