/**
 * Hook to fetch on-chain DHB ERC-20 Transfer events for a user's wallet.
 * Identifies fiat gateway purchases and labels them accordingly.
 */

import { useQuery } from '@tanstack/react-query';
import { createPublicClient, http, parseAbiItem, formatUnits, type Address } from 'viem';
import { base } from 'viem/chains';
import { CHAIN_CONFIGS, BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';

// Known fiat gateway / DPay hot wallets that send DHB after card purchases
const FIAT_GATEWAY_WALLETS = new Set([
  '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c', // DPay treasury
  '0x3a0b5fe1ce81251afaf7e457e1d1e23a4a85c67f', // DPay hot wallet
  '0x1be95b03ef8f10f78e078a74b0080b7e9af4c02b', // DPay sender
]);

const DHB_TOKEN_BASE = '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c' as Address;
const DHB_DECIMALS = 18;

// ERC-20 Transfer event signature
const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);

export interface OnchainDHBTransfer {
  txHash: string;
  from: string;
  to: string;
  amount: number;
  formattedAmount: string;
  timestamp: number; // unix seconds
  blockNumber: bigint;
  isFiatPurchase: boolean;
  isIncoming: boolean;
}

async function fetchRecentDHBTransfers(walletAddress: string): Promise<OnchainDHBTransfer[]> {
  const rpcUrl = CHAIN_CONFIGS[BASE_CHAIN_ID]?.rpcUrl || 'https://mainnet.base.org';

  const client = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  const addr = walletAddress.toLowerCase() as Address;

  // Fetch last ~43200 blocks (~24 hours on Base with 2s blocks)
  const currentBlock = await client.getBlockNumber();
  const fromBlock = currentBlock - BigInt(43200);

  // Fetch incoming and outgoing transfers in parallel
  const [incomingLogs, outgoingLogs] = await Promise.all([
    client.getLogs({
      address: DHB_TOKEN_BASE,
      event: TRANSFER_EVENT,
      args: { to: addr },
      fromBlock,
      toBlock: currentBlock,
    }),
    client.getLogs({
      address: DHB_TOKEN_BASE,
      event: TRANSFER_EVENT,
      args: { from: addr },
      fromBlock,
      toBlock: currentBlock,
    }),
  ]);

  const allLogs = [...incomingLogs, ...outgoingLogs];

  // Deduplicate by tx hash + log index
  const seen = new Set<string>();
  const unique = allLogs.filter(log => {
    const key = `${log.transactionHash}-${log.logIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Get block timestamps for all unique blocks
  const blockNumbers = [...new Set(unique.map(l => l.blockNumber))];
  const blockTimestamps: Record<string, number> = {};

  // Batch fetch block timestamps (max 20 at a time to avoid rate limits)
  const batches = [];
  for (let i = 0; i < blockNumbers.length; i += 20) {
    batches.push(blockNumbers.slice(i, i + 20));
  }

  for (const batch of batches) {
    const blocks = await Promise.all(
      batch.map(bn => client.getBlock({ blockNumber: bn }))
    );
    blocks.forEach(block => {
      blockTimestamps[block.number.toString()] = Number(block.timestamp);
    });
  }

  return unique.map(log => {
    const from = (log.args.from as string).toLowerCase();
    const to = (log.args.to as string).toLowerCase();
    const value = log.args.value as bigint;
    const amount = parseFloat(formatUnits(value, DHB_DECIMALS));
    const isIncoming = to === addr.toLowerCase();
    const isFiatPurchase = isIncoming && FIAT_GATEWAY_WALLETS.has(from);

    return {
      txHash: log.transactionHash!,
      from,
      to,
      amount,
      formattedAmount: amount < 1
        ? amount.toFixed(4)
        : Math.round(amount).toLocaleString(),
      timestamp: blockTimestamps[log.blockNumber.toString()] || Math.floor(Date.now() / 1000),
      blockNumber: log.blockNumber,
      isFiatPurchase,
      isIncoming,
    };
  }).sort((a, b) => b.timestamp - a.timestamp);
}

export function useOnchainDHBTransfers(walletAddress?: string | null) {
  return useQuery({
    queryKey: ['onchain-dhb-transfers', walletAddress?.toLowerCase()],
    queryFn: () => fetchRecentDHBTransfers(walletAddress!),
    enabled: !!walletAddress,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
