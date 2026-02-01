/**
 * DHB Token Configuration
 * =======================
 * DeHub token on Base Mainnet for PPV, Bounties, and Token Gating.
 */

// Base Mainnet chain ID
export const BASE_CHAIN_ID = 8453;

// DHB Token on Base Mainnet
export const DHB_TOKEN = {
  value: 'dhb',
  label: 'DHB',
  symbol: 'DHB',
  customAbbreviation: 'dhb',
  chainId: BASE_CHAIN_ID,
  address: '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c',
  iconUrl: '/icons/DHB.png',
  mintBlockNumber: 16428469,
  decimals: 18,
  isSubscriptionSupported: true,
} as const;

// ERC20 ABI for token approval and balance checks
export const ERC20_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Convert a human-readable amount to wei (smallest unit)
 */
export function toWei(amount: number | string, decimals: number = 18): bigint {
  const amountStr = typeof amount === 'number' ? amount.toString() : amount;
  const [whole, fraction = ''] = amountStr.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + paddedFraction);
}

/**
 * Convert wei to human-readable amount
 */
export function fromWei(wei: bigint, decimals: number = 18): string {
  const weiStr = wei.toString().padStart(decimals + 1, '0');
  const whole = weiStr.slice(0, -decimals) || '0';
  const fraction = weiStr.slice(-decimals).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}
