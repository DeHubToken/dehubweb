/**
 * DAO treasury
 * ============
 * One wallet, funded by anyone who sends it DHB. It is the same address the
 * docs publish for donations, so a transfer from any wallet — in-app or a
 * plain send from an exchange — counts the same way.
 *
 * Everything here is read straight off the chain: the balance is `balanceOf`
 * on each chain's DHB contract, and the contributor table is every ERC-20
 * `Transfer` whose recipient is the treasury, summed per sender. There is no
 * database row to fall out of sync with, and nothing to trust but the token
 * contract.
 *
 * Contributions are counted on Base and BNB — the two chains `payDhb` settles
 * on and the two the app has an archive RPC for. Ethereum still shows its
 * balance, but no public Ethereum RPC will answer a full-history log query
 * without a paid key, so a transfer there holds the tokens without earning a
 * share. A holder who wants a share bridges first.
 */

import { Interface } from 'ethers';
import {
  CHAIN_CONFIGS,
  BASE_CHAIN_ID,
  BNB_CHAIN_ID,
  ETH_CHAIN_ID,
  initChainRpcUrls,
} from '@/lib/contracts/dhb-token';

/** Same address as the EVM line on /docs/donate. Change both or neither. */
export const DAO_TREASURY_ADDRESS = '0xb6FCACda06676B775188Dfc9c4D7C4AEb564d3c4';

export const DAO_CONTRIBUTION_CHAINS = [BASE_CHAIN_ID, BNB_CHAIN_ID] as const;
export const DAO_BALANCE_CHAINS = [BASE_CHAIN_ID, BNB_CHAIN_ID, ETH_CHAIN_ID] as const;

const DHB_DECIMALS = 18;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const erc20 = new Interface(['function balanceOf(address owner) view returns (uint256)']);

export interface DaoChainBalance {
  chainId: number;
  name: string;
  explorerUrl: string;
  amount: number;
}

export interface DaoContribution {
  txHash: string;
  chainId: number;
  from: string;
  amount: number;
  timestamp: number;
}

export interface DaoContributor {
  address: string;
  amount: number;
  /** Fraction of every DHB ever sent to the treasury, 0..1. */
  share: number;
  txCount: number;
  lastAt: number;
  chainIds: number[];
}

export interface DaoTreasurySnapshot {
  balances: DaoChainBalance[];
  totalBalance: number;
  totalContributed: number;
  contributors: DaoContributor[];
  recent: DaoContribution[];
  fetchedAt: number;
}

type RpcLog = {
  transactionHash: string;
  logIndex: string;
  blockNumber: string;
  blockTimestamp?: string;
  topics: string[];
  data: string;
};

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || `${method} failed`);
  return json.result as T;
}

function fromWei(hex: string): number {
  const value = BigInt(hex || '0x0');
  // Keep six decimals of precision; DHB balances fit in a double comfortably.
  return Number(value / BigInt(10 ** (DHB_DECIMALS - 6))) / 1e6;
}

function topicToAddress(topic: string): string {
  return ('0x' + topic.slice(-40)).toLowerCase();
}

async function readBalance(chainId: number): Promise<DaoChainBalance> {
  const cfg = CHAIN_CONFIGS[chainId as keyof typeof CHAIN_CONFIGS];
  const base = { chainId, name: cfg.name, explorerUrl: cfg.explorerUrl, amount: 0 };
  if (!cfg.dhbToken) return base;
  try {
    const data = erc20.encodeFunctionData('balanceOf', [DAO_TREASURY_ADDRESS]);
    const hex = await rpc<string>(cfg.rpcUrl, 'eth_call', [{ to: cfg.dhbToken, data }, 'latest']);
    return { ...base, amount: fromWei(hex) };
  } catch {
    return base;
  }
}

/**
 * Every DHB Transfer into the treasury on one chain. The archive RPC answers
 * the whole range in one call; a public node that caps the range gets a
 * chunked walk over the most recent stretch instead, so the page still shows
 * something rather than nothing.
 */
async function readIncoming(chainId: number): Promise<DaoContribution[]> {
  const cfg = CHAIN_CONFIGS[chainId as keyof typeof CHAIN_CONFIGS];
  if (!cfg.dhbToken) return [];
  const filter = {
    address: cfg.dhbToken,
    topics: [TRANSFER_TOPIC, null, '0x000000000000000000000000' + DAO_TREASURY_ADDRESS.slice(2)],
  };

  let logs: RpcLog[] = [];
  try {
    logs = await rpc<RpcLog[]>(cfg.rpcUrl, 'eth_getLogs', [{ ...filter, fromBlock: '0x0', toBlock: 'latest' }]);
  } catch {
    const latest = BigInt(await rpc<string>(cfg.rpcUrl, 'eth_blockNumber', []));
    const span = BigInt(9_000);
    const floor = latest > span * BigInt(120) ? latest - span * BigInt(120) : BigInt(0);
    const chunks: Promise<RpcLog[]>[] = [];
    for (let from = floor; from <= latest; from += span + BigInt(1)) {
      const to = from + span > latest ? latest : from + span;
      chunks.push(
        rpc<RpcLog[]>(cfg.rpcUrl, 'eth_getLogs', [
          { ...filter, fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16) },
        ]).catch(() => []),
      );
    }
    logs = (await Promise.all(chunks)).flat();
  }

  // Alchemy stamps each log with its block time; anything else needs the block.
  const missing = [...new Set(logs.filter(l => !l.blockTimestamp).map(l => l.blockNumber))];
  const stamps: Record<string, number> = {};
  for (let i = 0; i < missing.length; i += 10) {
    await Promise.all(
      missing.slice(i, i + 10).map(async bn => {
        try {
          const block = await rpc<{ timestamp: string }>(cfg.rpcUrl, 'eth_getBlockByNumber', [bn, false]);
          stamps[bn] = parseInt(block.timestamp, 16);
        } catch {
          stamps[bn] = 0;
        }
      }),
    );
  }

  return logs
    .filter(l => l.topics?.length === 3)
    .map(l => ({
      txHash: l.transactionHash,
      chainId,
      from: topicToAddress(l.topics[1]),
      amount: fromWei(l.data),
      timestamp: l.blockTimestamp ? parseInt(l.blockTimestamp, 16) : stamps[l.blockNumber] || 0,
    }))
    .filter(c => c.amount > 0 && c.from !== DAO_TREASURY_ADDRESS);
}

export function rankContributors(transfers: DaoContribution[]): DaoContributor[] {
  const byAddress = new Map<string, DaoContributor>();
  for (const t of transfers) {
    const row = byAddress.get(t.from) ?? {
      address: t.from,
      amount: 0,
      share: 0,
      txCount: 0,
      lastAt: 0,
      chainIds: [],
    };
    row.amount += t.amount;
    row.txCount += 1;
    row.lastAt = Math.max(row.lastAt, t.timestamp);
    if (!row.chainIds.includes(t.chainId)) row.chainIds.push(t.chainId);
    byAddress.set(t.from, row);
  }
  const total = [...byAddress.values()].reduce((sum, r) => sum + r.amount, 0);
  return [...byAddress.values()]
    .map(r => ({ ...r, share: total > 0 ? r.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export async function fetchDaoTreasury(): Promise<DaoTreasurySnapshot> {
  await initChainRpcUrls();
  const [balances, incoming] = await Promise.all([
    Promise.all(DAO_BALANCE_CHAINS.map(readBalance)),
    Promise.all(DAO_CONTRIBUTION_CHAINS.map(id => readIncoming(id).catch(() => [] as DaoContribution[]))),
  ]);
  const transfers = incoming.flat().sort((a, b) => b.timestamp - a.timestamp);
  const contributors = rankContributors(transfers);
  return {
    balances,
    totalBalance: balances.reduce((sum, b) => sum + b.amount, 0),
    totalContributed: contributors.reduce((sum, c) => sum + c.amount, 0),
    contributors,
    recent: transfers.slice(0, 20),
    fetchedAt: Date.now(),
  };
}

export function daoTxUrl(chainId: number, txHash: string): string {
  const cfg = CHAIN_CONFIGS[chainId as keyof typeof CHAIN_CONFIGS];
  return `${cfg?.explorerUrl || 'https://bscscan.com'}/tx/${txHash}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
