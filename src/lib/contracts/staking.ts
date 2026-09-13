/**
 * Staking Contract Configuration
 * ===============================
 * Addresses and helpers for DHB staking on BNB and Base chains.
 */

import { Interface } from 'ethers';
import { readContract, readContractAll, writeContractAA, switchChain, type AAWriteResult } from './aa-utils';
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
