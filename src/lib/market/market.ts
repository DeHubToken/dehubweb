/**
 * NFT market: API calls and wallet steps.
 *
 * Reads go to api.dehub.io /api/market. Writes are wallet actions: approve,
 * sign an order, fill or cancel on Seaport. Every wallet step goes through the
 * shared AA-aware helpers so the DeHub smart wallet and external wallets both
 * work, on whichever chain the NFT lives on.
 */

import { signTypedData, getAccount } from '@wagmi/core';
import { apiCall } from '@/lib/api/dehub/core';
import { wagmiConfig } from '@/lib/wagmi';
import { isSmartWalletSession } from '@/lib/connection-source';
import {
  approveERC20,
  ensureSignerOnChain,
  getActiveProvider,
  getERC20Allowance,
  getWalletAddress,
  readContract,
  writeContractAA,
} from '@/lib/contracts/aa-utils';
import type { ChainId } from '@/components/app/ChainSelector';
import { ROBINHOOD_EXPLORER_URL } from '@/lib/chains/robinhood';
import {
  NFT_IFACE,
  SEAPORT_ADDRESS,
  SEAPORT_IFACE,
  SEAPORT_TYPES,
  seaportDomain,
  typedDataJson,
  toOrderParameters,
  nativeValue,
  fillerTokenSpend,
  type OrderComponents,
  type FeeTerms,
} from './seaport';

export const MARKET_CHAINS = [56, 8453, 1, 4663] as const;
export type MarketChainId = (typeof MARKET_CHAINS)[number];

export const CHAIN_LABEL: Record<number, string> = { 56: 'BNB', 8453: 'Base', 1: 'Ethereum', 4663: 'Robinhood' };
export const EXPLORER: Record<number, string> = {
  56: 'https://bscscan.com',
  8453: 'https://basescan.org',
  1: 'https://etherscan.io',
  4663: ROBINHOOD_EXPLORER_URL,
};

export interface MarketCurrency {
  address: string;
  symbol: string;
  decimals: number;
  feeBps: number;
}

export interface MarketConfig {
  seaport: string;
  feeRecipient: string | null;
  maxRoyaltyBps: number;
  chains: { chainId: number; currencies: MarketCurrency[] }[];
}

export interface MarketOrder {
  orderHash: string;
  kind: 'listing' | 'offer';
  chainId: number;
  maker: string;
  contract: string;
  tokenId: string;
  standard: 'erc721' | 'erc1155';
  amount: string;
  currency: string;
  currencySymbol: string;
  currencyDecimals: number;
  price: string;
  fee: string;
  royalty: string;
  status: 'active' | 'unfillable' | 'filled' | 'cancelled' | 'expired';
  startTime: string;
  endTime: string;
  taker: string | null;
  fillTxHash: string | null;
  filledAt: string | null;
  nftName: string | null;
  nftImage: string | null;
  collectionName: string | null;
  isDehub: boolean;
  /** Every NFT in the order; more than one is a bundle. */
  items?: { contract: string; tokenId: string; amount: string; standard: 'erc721' | 'erc1155' }[];
  /** An offer on any token of the collection. */
  isCollection?: boolean;
  /** Price at the end; below `price` on a price-drop auction. */
  endPrice?: string;
  createdAt: string;
  components: OrderComponents;
  signature: string;
  makerProfile?: { username: string | null; displayName: string | null; avatarImageUrl: string | null } | null;
}

export interface WalletNft {
  contract: string;
  tokenId: string;
  standard: 'erc721' | 'erc1155';
  name: string | null;
  image: string | null;
  collectionName: string | null;
  balance: string;
}

export interface NftDetail {
  nft: { contract: string; tokenId: string; name: string | null; image: string | null; collectionName: string | null; standard?: string };
  chainId: number;
  isDehub: boolean;
  listings: MarketOrder[];
  offers: MarketOrder[];
  sales: MarketOrder[];
}

// ─── Reads ───────────────────────────────────────────────────────────────

export const fetchMarketConfig = () => apiCall<MarketConfig>('/api/market/config');

export const fetchOrders = (params: Record<string, string | number | undefined>) =>
  apiCall<{ items: MarketOrder[]; hasMore: boolean }>('/api/market/orders', { params });

export const fetchNft = (chainId: number, contract: string, tokenId: string) =>
  apiCall<NftDetail>(`/api/market/nft/${chainId}/${contract}/${tokenId}`);

export const fetchWalletNfts = (address: string, chainId: number, pageKey?: string) =>
  apiCall<{ items: WalletNft[]; pageKey: string | null }>(`/api/market/wallet/${address}`, { params: { chainId, pageKey } });

export const fetchTerms = (params: { chainId: number; contract: string; tokenId: string; price: string; currency: string }) =>
  apiCall<FeeTerms & { fee: string }>('/api/market/terms', { params });

export interface MarketAlert {
  id: string;
  chainId: number;
  contract: string;
  tokenId: string | null;
  maxPrice: number | null;
  currency: string | null;
}

export const fetchAlerts = () => apiCall<{ items: MarketAlert[] }>('/api/market/alerts', { requiresAuth: true });

export const addAlert = (body: { chainId: number; contract: string; tokenId?: string | null; maxPrice?: number | null; currency?: string | null }) =>
  apiCall<{ alert: MarketAlert }>('/api/market/alerts', { method: 'POST', requiresAuth: true, body: body as unknown as Record<string, unknown> });

export const removeAlert = (id: string) => apiCall<{ ok: boolean }>(`/api/market/alerts/${id}`, { method: 'DELETE', requiresAuth: true });

export const syncOrder = (orderHash: string, txHash?: string) =>
  apiCall<{ order: MarketOrder }>(`/api/market/orders/${orderHash}/sync`, { method: 'POST', body: txHash ? { txHash } : {} });

// ─── Wallet steps ────────────────────────────────────────────────────────

async function counterOf(address: string, chainId: number): Promise<string> {
  const counter = await readContract<bigint>(SEAPORT_ADDRESS, SEAPORT_IFACE, 'getCounter', [address], chainId as ChainId);
  return counter.toString();
}

/** One-time per collection: let Seaport move this collection's NFTs when they sell. */
export async function ensureNftApproval(contract: string, owner: string, chainId: number) {
  const approved = await readContract<boolean>(contract, NFT_IFACE, 'isApprovedForAll', [owner, SEAPORT_ADDRESS], chainId as ChainId).catch(() => false);
  if (approved) return;
  const tx = await writeContractAA(contract, NFT_IFACE, 'setApprovalForAll', [SEAPORT_ADDRESS, true], {
    chainId,
    context: 'approve the market for this collection',
  });
  await tx.wait();
}

/** Make sure Seaport may take `amount` of `token` from `owner`. */
export async function ensureTokenAllowance(token: string, owner: string, amount: bigint, chainId: number) {
  const allowance = await getERC20Allowance(token, owner, SEAPORT_ADDRESS, chainId as ChainId).catch(() => 0n);
  if (BigInt(allowance as bigint | string | number) >= amount) return;
  const tx = await approveERC20(token, SEAPORT_ADDRESS, amount, chainId as ChainId);
  await tx.wait();
}

async function signOrder(components: OrderComponents, chainId: number): Promise<string> {
  await ensureSignerOnChain(chainId as ChainId);
  if (isSmartWalletSession()) {
    const { provider } = await getActiveProvider(chainId);
    const [from] = (await provider.request({ method: 'eth_accounts' })) as string[];
    return (await provider.request({ method: 'eth_signTypedData_v4', params: [from, typedDataJson(components, chainId)] })) as string;
  }
  const account = getAccount(wagmiConfig);
  return signTypedData(wagmiConfig, {
    account: account.address,
    domain: { ...seaportDomain(chainId), verifyingContract: SEAPORT_ADDRESS as `0x${string}` },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- viem's typed-data generics cannot see the runtime type table
    types: SEAPORT_TYPES as any,
    primaryType: 'OrderComponents',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
    message: components as any,
  });
}

export async function walletAddress(): Promise<string> {
  return (await getWalletAddress()).toLowerCase();
}

/** Sign and post a listing or offer built by `build(counter)`. */
export async function postOrder(
  kind: 'listing' | 'offer',
  chainId: number,
  maker: string,
  build: (counter: string) => OrderComponents,
): Promise<MarketOrder> {
  const components = build(await counterOf(maker, chainId));
  const signature = await signOrder(components, chainId);
  const { order } = await apiCall<{ order: MarketOrder }>('/api/market/orders', {
    method: 'POST',
    requiresAuth: true,
    body: { kind, chainId, components, signature } as unknown as Record<string, unknown>,
  });
  return order;
}

/**
 * Fill an order: buy a listing, or accept an offer on an NFT you hold.
 * Handles the approvals first, then one Seaport transaction. A collection
 * offer is filled with the token you pick (`tokenId`).
 */
export async function fillOrder(order: MarketOrder, me: string, tokenId?: string): Promise<string> {
  const chainId = order.chainId;
  await ensureSignerOnChain(chainId as ChainId);
  if (order.kind === 'offer') await ensureNftApproval(order.contract, me, chainId);
  const spend = fillerTokenSpend(order.components, order.kind);
  if (spend && spend.amount > 0n) await ensureTokenAllowance(spend.token, me, spend.amount, chainId);
  const zero = '0x' + '0'.repeat(64);
  const context = order.kind === 'listing' ? 'buy this NFT' : 'accept this offer';
  const tx = order.isCollection
    ? await writeContractAA(
        SEAPORT_ADDRESS,
        SEAPORT_IFACE,
        'fulfillAdvancedOrder',
        [
          { parameters: toOrderParameters(order.components), numerator: 1, denominator: 1, signature: order.signature, extraData: '0x' },
          // side 1 = consideration: the NFT the offerer asked for, resolved to the token being sold.
          [{ orderIndex: 0, side: 1, index: 0, identifier: tokenId ?? '0', criteriaProof: [] }],
          zero,
          '0x' + '0'.repeat(40),
        ],
        { chainId, value: 0n, context },
      )
    : await writeContractAA(
        SEAPORT_ADDRESS,
        SEAPORT_IFACE,
        'fulfillOrder',
        [{ parameters: toOrderParameters(order.components), signature: order.signature }, zero],
        // A price-drop auction is sent at its start price; Seaport refunds the difference.
        { chainId, value: nativeValue(order.components), context },
      );
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error('The transaction failed');
  await syncOrder(order.orderHash, tx.hash).catch(() => undefined);
  return tx.hash;
}

/** Cancel on-chain, so a copy of the signed order can never be filled later. */
export async function cancelOrder(order: MarketOrder): Promise<string> {
  const tx = await writeContractAA(SEAPORT_ADDRESS, SEAPORT_IFACE, 'cancel', [[order.components]], {
    chainId: order.chainId,
    context: 'cancel this order',
  });
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error('The transaction failed');
  await syncOrder(order.orderHash, tx.hash).catch(() => undefined);
  return tx.hash;
}

