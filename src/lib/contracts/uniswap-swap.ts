/**
 * Uniswap V3 Auto-Swap Utility (Base Chain)
 * ==========================================
 * Swaps native ETH → DHB via Uniswap V3 SwapRouter on Base.
 * Used by PPV payment flow when user lacks DHB but has ETH.
 */

import { Interface } from 'ethers';
import { writeContractAA, readContract } from './aa-utils';
import { BASE_CHAIN_ID, CHAIN_CONFIGS, initChainRpcUrls } from './dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';

// ── Contract Addresses (Base Mainnet) ──────────────────────────
const UNISWAP_SWAP_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';
const UNISWAP_QUOTER_V2   = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a';
const WETH_BASE            = '0x4200000000000000000000000000000000000006';
const DHB_BASE             = CHAIN_CONFIGS[BASE_CHAIN_ID].dhbToken;

// Pool fee tier — 1% (10000) is common for lower-liquidity pairs
const POOL_FEE = 10000;

// Swap deadline: 20 seconds (Base has ~2s block times)
const SWAP_DEADLINE_SECONDS = 20;

// Slippage buffer: 2% extra ETH to account for price movement
const SLIPPAGE_BPS = 200; // 2% = 200 basis points

// ── ABIs ───────────────────────────────────────────────────────
const quoterInterface = new Interface([
  'function quoteExactOutputSingle((address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]);

const swapRouterInterface = new Interface([
  'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountIn)',
  'function refundETH() external payable',
]);

const multicallInterface = new Interface([
  'function multicall(uint256 deadline, bytes[] calldata data) external payable returns (bytes[] memory)',
]);

/**
 * Get a quote for swapping ETH → DHB on Uniswap V3.
 * Returns the estimated ETH (wei) needed to receive `amountOutDHB` (wei) of DHB.
 * Returns null if the quote fails (e.g. no liquidity).
 */
export async function getSwapQuote(amountOutDHB: bigint): Promise<bigint | null> {
  await initChainRpcUrls();
  
  try {
    const result = await readContract<bigint>(
      UNISWAP_QUOTER_V2,
      quoterInterface,
      'quoteExactOutputSingle',
      [{
        tokenIn: WETH_BASE,
        tokenOut: DHB_BASE,
        amount: amountOutDHB,
        fee: POOL_FEE,
        sqrtPriceLimitX96: BigInt(0),
      }],
      BASE_CHAIN_ID
    );
    
    // result is amountIn (ETH needed in wei)
    console.log('[Uniswap] Quote:', { amountOutDHB: amountOutDHB.toString(), ethNeeded: result.toString() });
    return result;
  } catch (error) {
    console.error('[Uniswap] Quote failed:', error);
    return null;
  }
}

/**
 * Apply slippage buffer to an ETH amount.
 * Adds 2% to cover price movement between quote and execution.
 */
export function applySlippage(amountWei: bigint): bigint {
  return amountWei + (amountWei * BigInt(SLIPPAGE_BPS)) / BigInt(10000);
}

/**
 * Swap ETH → DHB via Uniswap V3 SwapRouter on Base.
 *
 * Uses `exactOutputSingle` wrapped in `multicall` with a deadline,
 * followed by `refundETH` to return any unused ETH.
 *
 * @param amountOutDHB  - exact DHB output desired (wei)
 * @param maxETH        - maximum ETH to spend (wei), should include slippage
 * @param recipient     - address to receive the DHB
 * @returns transaction receipt
 */
export async function swapETHForDHB(
  amountOutDHB: bigint,
  maxETH: bigint,
  recipient: string,
): Promise<{ hash: string }> {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + SWAP_DEADLINE_SECONDS);

  // Encode exactOutputSingle call
  const swapCalldata = swapRouterInterface.encodeFunctionData('exactOutputSingle', [{
    tokenIn: WETH_BASE,
    tokenOut: DHB_BASE,
    fee: POOL_FEE,
    recipient,
    amountOut: amountOutDHB,
    amountInMaximum: maxETH,
    sqrtPriceLimitX96: BigInt(0),
  }]);

  // Encode refundETH to return any unused ETH
  const refundCalldata = swapRouterInterface.encodeFunctionData('refundETH', []);

  // Wrap both in multicall with deadline
  const result = await writeContractAA(
    UNISWAP_SWAP_ROUTER,
    multicallInterface,
    'multicall',
    [deadline, [swapCalldata, refundCalldata]],
    {
      value: maxETH,
      context: 'Uniswap ETH→DHB swap',
      chainId: BASE_CHAIN_ID,
    }
  );

  const receipt = await result.wait(1);
  console.log('[Uniswap] Swap confirmed:', receipt.hash);
  return receipt;
}

/**
 * Check if auto-swap is supported for the given chain.
 * Currently only Base has DHB/WETH liquidity on Uniswap V3.
 */
export function isAutoSwapSupported(chainId: ChainId): boolean {
  return chainId === BASE_CHAIN_ID;
}

/**
 * Get native ETH balance for an address via public RPC.
 */
export async function getNativeBalance(address: string, chainId: ChainId = BASE_CHAIN_ID): Promise<bigint> {
  await initChainRpcUrls();
  const rpcUrl = CHAIN_CONFIGS[chainId]?.rpcUrl || 'https://mainnet.base.org';
  
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'eth_getBalance',
      params: [address, 'latest'],
    }),
  });
  const result = await response.json();
  if (result.error) throw new Error(result.error.message);
  return BigInt(result.result);
}
