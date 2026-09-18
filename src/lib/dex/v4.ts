import { readReceiptFromProviders } from './receipt';
import { AbiCoder, Contract, FallbackProvider, FetchRequest, JsonRpcProvider, ZeroAddress, formatUnits, id, keccak256 } from 'ethers';
import { Token } from '@uniswap/sdk-core';
import { Pool, Position } from '@uniswap/v4-sdk';
import { BASE_CHAIN_ID, BNB_CHAIN_ID, CHAIN_CONFIGS } from '@/lib/contracts/dhb-token';
import type { Database } from '@/integrations/supabase/types';

export type DexChainId = typeof BASE_CHAIN_ID | typeof BNB_CHAIN_ID;
export type IndexedPosition = Database['public']['Tables']['dex_sell_positions']['Row'];

export const DEX_CHAINS = {
  [BASE_CHAIN_ID]: {
    name: 'Base',
    dhb: CHAIN_CONFIGS[BASE_CHAIN_ID].dhbToken,
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    usdcDecimals: 6,
    positionManager: '0x7c5f5a4bbd8fd63184577525326123b519429bdc',
    stateView: '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71',
    explorer: 'https://basescan.org',
  },
  [BNB_CHAIN_ID]: {
    name: 'BNB Chain',
    dhb: CHAIN_CONFIGS[BNB_CHAIN_ID].dhbToken,
    usdc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    usdcDecimals: 18,
    positionManager: '0x7a4a5c919ae2541aed11041a1aeee68f1287f95b',
    stateView: '0xd13dd3d6e93f276fafc9db9e6bb47c1180aee0c4',
    explorer: 'https://bscscan.com',
  },
} as const;

const POSITION_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getPositionLiquidity(uint256 tokenId) view returns (uint128)',
  'function getPoolAndPositionInfo(uint256 tokenId) view returns ((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks),uint256)',
];
const STATE_ABI = [
  'function getSlot0(bytes32 poolId) view returns (uint160,int24,uint24,uint24)',
  'function getLiquidity(bytes32 poolId) view returns (uint128)',
];
const TRANSFER_TOPIC = id('Transfer(address,address,uint256)');

const providers = new Map<DexChainId, FallbackProvider>();
export function dexProvider(chainId: DexChainId) {
  let provider = providers.get(chainId);
  if (!provider) {
    const urls = chainId === BASE_CHAIN_ID
      ? ['https://mainnet.base.org', 'https://base-rpc.publicnode.com']
      : ['https://bsc-dataseed.binance.org', 'https://bsc-rpc.publicnode.com'];
    provider = new FallbackProvider(urls.map((url, index) => {
      const request = new FetchRequest(url);
      request.timeout = 10000;
      request.setThrottleParams({ maxAttempts: 1 });
      return { provider: new JsonRpcProvider(request, chainId, { staticNetwork: true, batchMaxCount: 1 }),
        priority: index + 1, stallTimeout: 1000, weight: 1 };
    }), chainId, { quorum: 1 });
    providers.set(chainId, provider);
  }
  return provider;
}

export function dexReceipt(chainId: DexChainId, hash: string) {
  return readReceiptFromProviders(dexProvider(chainId).providerConfigs.map(config => config.provider), hash);
}

function unpackTick(value: bigint, shift: bigint): number {
  const tick = Number((value >> shift) & 0xffffffn);
  return tick >= 0x800000 ? tick - 0x1000000 : tick;
}

function usdPerDhbAtTick(tick: number, chainId: DexChainId): number {
  const cfg = DEX_CHAINS[chainId];
  const raw = Math.pow(1.0001, tick);
  // Token ordering differs across chains: USDC is token0 on Base, DHB on BNB.
  return chainId === BASE_CHAIN_ID
    ? 1 / (raw * Math.pow(10, cfg.usdcDecimals - 18))
    : raw * Math.pow(10, 18 - cfg.usdcDecimals);
}

export interface VerifiedPosition extends IndexedPosition {
  owner: string;
  liquidity: bigint;
  tickLower: number;
  tickUpper: number;
  poolFee: number;
  tickSpacing: number;
  minPrice: number;
  maxPrice: number;
  amountDhb: number;
  amountUsdc: number;
  marketPrice: number;
  side: 'buy' | 'sell';
  status: 'Open' | 'In range' | 'Filled';
}

export async function verifyPosition(row: IndexedPosition, blockTag?: number): Promise<VerifiedPosition | null> {
  if (row.chain_id !== BASE_CHAIN_ID && row.chain_id !== BNB_CHAIN_ID) return null;
  const chainId = row.chain_id;
  const cfg = DEX_CHAINS[chainId];
  const provider = dexProvider(chainId);
  const manager = new Contract(cfg.positionManager, POSITION_ABI, provider);
  try {
    const [owner, liquidity, info, receipt] = await Promise.all([
      manager.ownerOf(row.token_id, { blockTag }) as Promise<string>,
      manager.getPositionLiquidity(row.token_id, { blockTag }) as Promise<bigint>,
      manager.getPoolAndPositionInfo(row.token_id, { blockTag }) as Promise<[{
        currency0: string; currency1: string; fee: bigint; tickSpacing: bigint; hooks: string;
      }, bigint]>,
      dexReceipt(chainId, row.mint_tx_hash),
    ]);
    if (!receipt || receipt.status !== 1 || !liquidity || (row.side !== 'buy' && row.side !== 'sell')) return null;
    const minted = receipt.logs.some((log) =>
      log.address.toLowerCase() === cfg.positionManager.toLowerCase() &&
      log.topics[0] === TRANSFER_TOPIC &&
      log.topics[1] === `0x${'0'.repeat(64)}` &&
      log.topics[2]?.toLowerCase() === `0x${row.owner_address.slice(2).toLowerCase().padStart(64, '0')}` &&
      log.topics[3] === `0x${BigInt(row.token_id).toString(16).padStart(64, '0')}`
    );
    if (!minted) return null;
    const [poolKey, positionInfo] = info;
    const currencies = [poolKey.currency0.toLowerCase(), poolKey.currency1.toLowerCase()];
    const poolFee = Number(poolKey.fee);
    const tickSpacing = Number(poolKey.tickSpacing);
    const supportedPool = (poolFee === 0 && tickSpacing === 1) ||
      (poolFee === 3000 && tickSpacing === 60);
    if (!currencies.includes(cfg.dhb.toLowerCase()) || !currencies.includes(cfg.usdc.toLowerCase()) ||
        !supportedPool ||
        poolKey.hooks.toLowerCase() !== ZeroAddress) return null;
    const lower = unpackTick(positionInfo, 8n);
    const upper = unpackTick(positionInfo, 32n);
    if (lower >= upper) return null;
    const prices = [usdPerDhbAtTick(lower, chainId), usdPerDhbAtTick(upper, chainId)];
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const poolId = keccak256(AbiCoder.defaultAbiCoder().encode(
      ['tuple(address,address,uint24,int24,address)'],
      [[poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks]],
    ));
    const state = new Contract(cfg.stateView, STATE_ABI, provider);
    const [slot0, poolLiquidity] = await Promise.all([
      state.getSlot0(poolId, { blockTag }) as Promise<[bigint, bigint, bigint, bigint]>,
      state.getLiquidity(poolId, { blockTag }) as Promise<bigint>,
    ]);
    const tick = Number(slot0[1]);
    const dhb = new Token(chainId, cfg.dhb, 18, 'DHB');
    const usdc = new Token(chainId, cfg.usdc, cfg.usdcDecimals, 'USDC');
    const pool = new Pool(dhb, usdc, poolFee, tickSpacing, ZeroAddress,
      slot0[0].toString(), poolLiquidity.toString(), tick);
    const sdkPosition = new Position({ pool, liquidity: liquidity.toString(), tickLower: lower, tickUpper: upper });
    const amountDhb = Number(formatUnits((chainId === BASE_CHAIN_ID ? sdkPosition.amount1 : sdkPosition.amount0).quotient.toString(), 18));
    const amountUsdc = Number(formatUnits((chainId === BASE_CHAIN_ID ? sdkPosition.amount0 : sdkPosition.amount1).quotient.toString(), cfg.usdcDecimals));
    const status = row.side === 'sell'
      ? chainId === BASE_CHAIN_ID ? tick <= lower ? 'Filled' : tick >= upper ? 'Open' : 'In range'
        : tick >= upper ? 'Filled' : tick <= lower ? 'Open' : 'In range'
      : chainId === BASE_CHAIN_ID ? tick >= upper ? 'Filled' : tick <= lower ? 'Open' : 'In range'
        : tick <= lower ? 'Filled' : tick >= upper ? 'Open' : 'In range';
    return { ...row, owner, liquidity, tickLower: lower, tickUpper: upper,
      poolFee, tickSpacing, minPrice, maxPrice, amountDhb, amountUsdc,
      marketPrice: chainId === BASE_CHAIN_ID ? 1e12 / (Number(slot0[0]) / 2 ** 96) ** 2 : (Number(slot0[0]) / 2 ** 96) ** 2,
      side: row.side, status };
  } catch (error) {
    if ((error as { code?: string }).code === 'CALL_EXCEPTION') return null;
    throw error;
  }
}
