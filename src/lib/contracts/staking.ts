/**
 * Staking Contract Configuration
 * ===============================
 * Addresses and helpers for DHB staking on BNB and Base chains.
 */

import { Interface } from 'ethers';
import { readContract, readContractAll, rpcRequest, writeContractAA, switchChain, type AAWriteResult } from './aa-utils';
import { CHAIN_CONFIGS, BNB_CHAIN_ID, BASE_CHAIN_ID } from './dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';

// Unified staking address for both BNB and Base (transfer-based)
export const STAKING_ADDRESS = '0xcF573a682Bf7A7Cc58000e9eCA9c9d04dA102Da7';

// Legacy addresses (kept for reading old staked balances)
export const BNB_STAKING_CONTRACT = '0x26d2cd7763106fdce443fadd36163e2ad33a76e6';
export const BASE_STAKING_ADDRESS = '0x7b10dd033Ac41B8AF85eE1701e344B86e446250B';

const BNB_STAKING_DHB_TOKEN = CHAIN_CONFIGS[BNB_CHAIN_ID].dhbToken;

const erc20Interface = new Interface([
  'function balanceOf(address owner) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

// Matches the real DeHubStaking (UUPS) ABI used by the dehub.net staking app.
// NOTE: this contract has NO balanceOf/earned — user state lives in
// userInfos(address) and rewards in pendingHarvest(address).
const legacyStakingInterface = new Interface([
  'function stake(uint256 period, uint256 amount)',
  'function unstake(uint256 amount)',
  'function claim()',
  'function pendingHarvest(address account) view returns (uint256)',
  'function totalStaked() view returns (uint256)',
  'function userInfos(address) view returns (uint256 totalAmount, uint256 unlockAt, uint256 lastTierIndex, uint256 lastRewardIndex, uint256 harvestTotal, uint256 harvestClaimed, uint256 lastStakeAt)',
  'function pool() view returns (uint256 stakingStartAt, uint256 rewardPeriod, uint256 lastRewardIndex, uint256 forceUnstakeFee, uint256 minPeriod)',
]);

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function toTopicAddress(address: string): string {
  return '0x000000000000000000000000' + address.toLowerCase().replace(/^0x/, '');
}

/**
 * Get total DHB staked on a given chain by reading balanceOf on the DHB token
 */
export async function getTotalStaked(chainId: ChainId): Promise<bigint> {
  const config = CHAIN_CONFIGS[chainId];
  const tokenAddress = chainId === BNB_CHAIN_ID ? BNB_STAKING_DHB_TOKEN : config?.dhbToken;
  if (!tokenAddress) return BigInt(0);

  try {
    if (chainId === BNB_CHAIN_ID) {
      // Legacy BNB staking is a real contract — its totalStaked() is exact
      // (token balanceOf(contract) would also count the reward pool).
      const [newBalance, legacyTotal] = await Promise.all([
        readContract<bigint>(tokenAddress, erc20Interface, 'balanceOf', [STAKING_ADDRESS], chainId),
        readContract<bigint>(BNB_STAKING_CONTRACT, legacyStakingInterface, 'totalStaked', [], chainId),
      ]);
      return newBalance + legacyTotal;
    }

    // Base: both addresses are transfer-based, token balance is the truth
    const [newBalance, legacyBalance] = await Promise.all([
      readContract<bigint>(tokenAddress, erc20Interface, 'balanceOf', [STAKING_ADDRESS], chainId),
      readContract<bigint>(tokenAddress, erc20Interface, 'balanceOf', [BASE_STAKING_ADDRESS], chainId),
    ]);
    return newBalance + legacyBalance;
  } catch (err) {
    console.error(`[Staking] Failed to read totalStaked on chain ${chainId}:`, err);
    return BigInt(0);
  }
}

/**
 * Get user's pending rewards on the legacy BNB staking contract
 */
export async function getUserEarnedBNB(userAddress: string): Promise<bigint> {
  try {
    return await readContract<bigint>(
      BNB_STAKING_CONTRACT,
      legacyStakingInterface,
      'pendingHarvest',
      [userAddress],
      BNB_CHAIN_ID
    );
  } catch (err) {
    console.error('[Staking] Failed to read earned rewards:', err);
    return BigInt(0);
  }
}

export interface StakingTransferSums {
  /** DHB the user has sent INTO the staking wallet(s) on this chain */
  inbound: bigint;
  /** DHB the staking wallet(s) have sent BACK to the user (unstake payouts) */
  outbound: bigint;
}

/** Sum the `value` of all Transfer logs matching from→to on a token */
async function sumTransferLogs(
  tokenAddress: string,
  fromTopic: string | string[],
  toTopic: string | string[],
  chainId: ChainId
): Promise<bigint> {
  const logs = await rpcRequest<Array<{ data: string }>>('eth_getLogs', [{
    address: tokenAddress,
    fromBlock: '0x0',
    toBlock: 'latest',
    topics: [TRANSFER_TOPIC, fromTopic, toTopic],
  }], chainId);

  if (!Array.isArray(logs)) throw new Error('eth_getLogs returned a non-array');
  return logs.reduce((acc, log) => acc + BigInt(log.data), BigInt(0));
}

/**
 * Compute a user's transfer-based staking sums on a chain by scanning DHB
 * Transfer events between the user and the staking wallet(s).
 * Returns null when the RPC can't serve the log scan (caller should fall
 * back to DB records).
 */
export async function getUserStakingTransfers(
  userAddress: string,
  chainId: ChainId
): Promise<StakingTransferSums | null> {
  const config = CHAIN_CONFIGS[chainId];
  if (!config?.dhbToken) return { inbound: BigInt(0), outbound: BigInt(0) };

  // On Base the legacy address was also transfer-based; on BNB the legacy
  // contract is read via userInfos(), so only the unified wallet counts here.
  const stakingTopics = chainId === BASE_CHAIN_ID
    ? [toTopicAddress(STAKING_ADDRESS), toTopicAddress(BASE_STAKING_ADDRESS)]
    : [toTopicAddress(STAKING_ADDRESS)];
  const userTopic = toTopicAddress(userAddress);

  try {
    const [inbound, outbound] = await Promise.all([
      sumTransferLogs(config.dhbToken, userTopic, stakingTopics, chainId),
      sumTransferLogs(config.dhbToken, stakingTopics, userTopic, chainId),
    ]);
    return { inbound, outbound };
  } catch (err) {
    console.error(`[Staking] Transfer scan failed on chain ${chainId}:`, err);
    return null;
  }
}

/**
 * Get user's DHB token allowance for the BNB staking contract
 */
export async function getStakingAllowance(userAddress: string): Promise<bigint> {
  try {
    return await readContract<bigint>(
      BNB_STAKING_DHB_TOKEN,
      erc20Interface,
      'allowance',
      [userAddress, BNB_STAKING_CONTRACT],
      BNB_CHAIN_ID
    );
  } catch (err) {
    console.error('[Staking] Failed to read allowance:', err);
    return BigInt(0);
  }
}

/**
 * Claim rewards on BNB staking contract
 */
export async function claimBNBRewards(): Promise<AAWriteResult> {
  await switchChain(BNB_CHAIN_ID);
  return writeContractAA(
    BNB_STAKING_CONTRACT,
    legacyStakingInterface,
    'claim',
    [],
    { context: 'claim staking rewards', chainId: BNB_CHAIN_ID }
  );
}

/**
 * Fetch all staking stats (both chains)
 */
export async function fetchStakingStats() {
  const [bnbStaked, baseStaked] = await Promise.all([
    getTotalStaked(BNB_CHAIN_ID),
    getTotalStaked(BASE_CHAIN_ID),
  ]);

  return {
    bnbStaked,
    baseStaked,
    totalStaked: bnbStaked + baseStaked,
  };
}

/** Basis points of a force-unstake charged by the legacy BNB contract (12%). */
export const DEFAULT_FORCE_UNSTAKE_FEE_BPS = 1200;

export interface LegacyStakePosition {
  /** Wei still held by the legacy BNB staking contract for this wallet. */
  amountRaw: bigint;
  /** Unix seconds the position unlocks; 0 when nothing is staked. */
  unlockAt: number;
}

/**
 * Read the user's whole legacy BNB position, not just the amount.
 *
 * `unlockAt` is the half that decides what pressing Withdraw actually does:
 * before it, `unstake()` still succeeds but the contract keeps
 * `forceUnstakeFee` basis points of the amount.
 */
export async function getUserLegacyStake(userAddress: string): Promise<LegacyStakePosition> {
  try {
    const info = await readContractAll<readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint]>(
      BNB_STAKING_CONTRACT,
      legacyStakingInterface,
      'userInfos',
      [userAddress],
      BNB_CHAIN_ID
    );
    return { amountRaw: info[0], unlockAt: Number(info[1] ?? 0) };
  } catch (err) {
    console.error('[Staking] Failed to read legacy position:', err);
    return { amountRaw: BigInt(0), unlockAt: 0 };
  }
}

/** Live force-unstake fee in basis points, falling back to the deployed 12%. */
export async function getForceUnstakeFeeBps(): Promise<number> {
  try {
    const pool = await readContractAll<readonly [bigint, bigint, bigint, bigint, bigint]>(
      BNB_STAKING_CONTRACT,
      legacyStakingInterface,
      'pool',
      [],
      BNB_CHAIN_ID
    );
    const fee = Number(pool[3]);
    return Number.isFinite(fee) && fee >= 0 && fee < 10000 ? fee : DEFAULT_FORCE_UNSTAKE_FEE_BPS;
  } catch {
    return DEFAULT_FORCE_UNSTAKE_FEE_BPS;
  }
}

/**
 * Withdraw from the legacy BNB staking contract.
 *
 * This is the only staked DHB a user can move themselves: the BNB contract is
 * a real UUPS deployment with an `unstake()`, while the unified
 * STAKING_ADDRESS is a plain wallet with no code to call.
 */
export async function unstakeBNB(amountWei: bigint): Promise<AAWriteResult> {
  await switchChain(BNB_CHAIN_ID);
  return writeContractAA(
    BNB_STAKING_CONTRACT,
    legacyStakingInterface,
    'unstake',
    [amountWei],
    { context: 'withdraw staked DHB', chainId: BNB_CHAIN_ID }
  );
}
