/**
 * Staking Contract Configuration
 * ===============================
 * Addresses and helpers for DHB staking on BNB and Base chains.
 */

import { Interface } from 'ethers';
import { readContract } from './aa-utils';
import { CHAIN_CONFIGS, BNB_CHAIN_ID, BASE_CHAIN_ID } from './dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';

// BNB staking contract (proxy)
export const BNB_STAKING_CONTRACT = '0x26d2cd7763106fdce443fadd36163e2ad33a76e6';

// Base staking address (just tracks DHB transfers to this address)
export const BASE_STAKING_ADDRESS = '0x7b10dd033Ac41B8AF85eE1701e344B86e446250B';

// The DHB token address held by the BNB staking contract (may differ from the main DHB token)
const BNB_STAKING_DHB_TOKEN = '0x680d3113caf77b61b510f332d5ef4cf5b41a761d';

const erc20Interface = new Interface([
  'function balanceOf(address owner) view returns (uint256)',
]);

/**
 * Get total DHB staked on a given chain by reading balanceOf on the DHB token
 */
export async function getTotalStaked(chainId: ChainId): Promise<bigint> {
  const config = CHAIN_CONFIGS[chainId];

  // Use the correct token address per chain
  const tokenAddress = chainId === BNB_CHAIN_ID
    ? BNB_STAKING_DHB_TOKEN
    : config?.dhbToken;
  
  if (!tokenAddress) return BigInt(0);

  const stakingAddress = chainId === BNB_CHAIN_ID
    ? BNB_STAKING_CONTRACT
    : BASE_STAKING_ADDRESS;

  try {
    return await readContract<bigint>(
      tokenAddress,
      erc20Interface,
      'balanceOf',
      [stakingAddress],
      chainId
    );
  } catch (err) {
    console.error(`[Staking] Failed to read totalStaked on chain ${chainId}:`, err);
    return BigInt(0);
  }
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
