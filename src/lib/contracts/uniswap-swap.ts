/**
 * Uniswap V3 Swap Utility (Base Chain)
 * ======================================
 * Swaps any token → DHB via Uniswap V3 SwapRouter on Base.
 * Supports native ETH and ERC20 tokens as input.
 */

import { Interface, solidityPacked } from 'ethers';
import { writeContractAA, readContract } from './aa-utils';
import { BASE_CHAIN_ID, CHAIN_CONFIGS, initChainRpcUrls } from './dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';

// ── Contract Addresses (Base Mainnet) ──────────────────────────
const UNISWAP_SWAP_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';
const UNISWAP_QUOTER_V2   = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a';
const WETH_BASE            = '0x4200000000000000000000000000000000000006';
const DHB_BASE             = CHAIN_CONFIGS[BASE_CHAIN_ID].dhbToken;

// Pool fee tiers to try (Uniswap V3 supports multiple)
const FEE_TIERS = [10000, 3000, 500] as const; // 1%, 0.3%, 0.05%

// Swap deadline: 20 seconds (Base has ~2s block times)
const SWAP_DEADLINE_SECONDS = 20;

// Slippage buffer: 2% extra to account for price movement
const SLIPPAGE_BPS = 200; // 2% = 200 basis points

// ── ABIs ───────────────────────────────────────────────────────
const quoterInterface = new Interface([
  'function quoteExactOutputSingle((address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]);

const swapRouterInterface = new Interface([
  'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountIn)',
  'function exactOutput((bytes path, address recipient, uint256 amountOut, uint256 amountInMaximum)) external payable returns (uint256 amountIn)',
  'function refundETH() external payable',
]);

// Multi-hop quoting/swapping. DHB's only pool on Base is DHB/WETH, so a holder
// of USDC — which is most people — has no single-hop route and used to be told
// to "acquire DHB manually". Routing through WETH gives every liquid Base token
// a path.
const quoterPathInterface = new Interface([
  'function quoteExactOutput(bytes path, uint256 amountOut) external returns (uint256 amountIn, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)',
]);

const multicallInterface = new Interface([
  'function multicall(uint256 deadline, bytes[] calldata data) external payable returns (bytes[] memory)',
]);

const erc20Interface = new Interface([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
]);

/**
 * Resolve the on-chain token address for quoting/swapping.
 * Native ETH (address '0x0') maps to WETH on Base.
 */
function resolveTokenAddress(address: string): string {
  if (address === '0x0' || address.toLowerCase() === '0x0000000000000000000000000000000000000000') {
    return WETH_BASE;
  }
  return address;
}

/**
 * Check if a token address represents native ETH.
 */
function isNativeETH(address: string): boolean {
  return address === '0x0' || address.toLowerCase() === '0x0000000000000000000000000000000000000000';
}

/**
 * Get a quote for swapping tokenIn → tokenOut on Uniswap V3.
 * Tries multiple fee tiers and returns the best (lowest input) quote.
 * Returns null if no quote succeeds.
 */
export async function getSwapQuote(
  amountOut: bigint,
  tokenInAddress: string = '0x0',
  tokenOutAddress: string = DHB_BASE,
): Promise<{ amountIn: bigint; feeTier: number } | null> {
  await initChainRpcUrls();
  const tokenIn = resolveTokenAddress(tokenInAddress);
  const tokenOut = resolveTokenAddress(tokenOutAddress);

  const results: { amountIn: bigint; feeTier: number }[] = [];

  for (const fee of FEE_TIERS) {
    try {
      const result = await readContract<bigint>(
        UNISWAP_QUOTER_V2,
        quoterInterface,
        'quoteExactOutputSingle',
        [{
          tokenIn,
          tokenOut,
          amount: amountOut,
          fee,
          sqrtPriceLimitX96: BigInt(0),
        }],
        BASE_CHAIN_ID
      );
      results.push({ amountIn: result, feeTier: fee });
      console.log(`[Uniswap] Quote (fee=${fee}):`, { amountIn: result.toString() });
    } catch {
      // This fee tier has no pool or no liquidity — skip
    }
  }

  if (results.length === 0) {
    console.error('[Uniswap] All quote attempts failed');
    return null;
  }

  results.sort((a, b) => (a.amountIn < b.amountIn ? -1 : 1));
  const best = results[0];
  console.log('[Uniswap] Best quote:', {
    tokenIn,
    tokenOut,
    amountOut: amountOut.toString(),
    amountIn: best.amountIn.toString(),
    feeTier: best.feeTier,
  });
  return best;
}

/**
 * Apply slippage buffer to a token amount.
 * @param amountWei - the raw amount in wei
 * @param bps - slippage in basis points (default 200 = 2%)
 */
export function applySlippage(amountWei: bigint, bps: number = SLIPPAGE_BPS): bigint {
  return amountWei + (amountWei * BigInt(bps)) / BigInt(10000);
}

/**
 * Ensure the SwapRouter has sufficient ERC20 allowance.
 * If not, sends an approve transaction.
 */
async function ensureAllowance(
  tokenAddress: string,
  owner: string,
  amount: bigint,
): Promise<void> {
  const currentAllowance = await readContract<bigint>(
    tokenAddress,
    erc20Interface,
    'allowance',
    [owner, UNISWAP_SWAP_ROUTER],
    BASE_CHAIN_ID
  );

  if (currentAllowance >= amount) return;

  console.log('[Uniswap] Approving token:', tokenAddress, 'amount:', amount.toString());
  const approveTx = await writeContractAA(
    tokenAddress,
    erc20Interface,
    'approve',
    [UNISWAP_SWAP_ROUTER, amount],
    {
      context: 'Token approval for swap',
      chainId: BASE_CHAIN_ID,
    }
  );
  await approveTx.wait(1);
  console.log('[Uniswap] Approval confirmed');
}

/**
 * Swap any token → any token via Uniswap V3 SwapRouter on Base.
 *
 * For native ETH input: Uses multicall with exactOutputSingle + refundETH
 * For ERC20 input: Approves token, then calls exactOutputSingle directly
 *
 * @param amountOut        - exact output desired (wei)
 * @param maxAmountIn      - maximum input to spend (wei), should include slippage
 * @param recipient        - address to receive the output token
 * @param tokenInAddress   - input token address ('0x0' for native ETH)
 * @param feeTier          - Uniswap fee tier to use
 * @param tokenOutAddress  - output token address (defaults to DHB)
 * @returns transaction receipt
 */
export async function swapTokens(
  amountOut: bigint,
  maxAmountIn: bigint,
  recipient: string,
  tokenInAddress: string = '0x0',
  feeTier: number = 10000,
  tokenOutAddress: string = DHB_BASE,
): Promise<{ hash: string }> {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + SWAP_DEADLINE_SECONDS);
  const tokenIn = resolveTokenAddress(tokenInAddress);
  const tokenOut = resolveTokenAddress(tokenOutAddress);
  const isNative = isNativeETH(tokenInAddress);

  const swapCalldata = swapRouterInterface.encodeFunctionData('exactOutputSingle', [{
    tokenIn,
    tokenOut,
    fee: feeTier,
    recipient,
    amountOut,
    amountInMaximum: maxAmountIn,
    sqrtPriceLimitX96: BigInt(0),
  }]);

  let result;

  if (isNative) {
    const refundCalldata = swapRouterInterface.encodeFunctionData('refundETH', []);
    result = await writeContractAA(
      UNISWAP_SWAP_ROUTER,
      multicallInterface,
      'multicall',
      [deadline, [swapCalldata, refundCalldata]],
      {
        value: maxAmountIn,
        context: `Swap ETH → Token`,
        chainId: BASE_CHAIN_ID,
      }
    );
  } else {
    await ensureAllowance(tokenInAddress, recipient, maxAmountIn);
    result = await writeContractAA(
      UNISWAP_SWAP_ROUTER,
      multicallInterface,
      'multicall',
      [deadline, [swapCalldata]],
      {
        context: `Swap token → token`,
        chainId: BASE_CHAIN_ID,
      }
    );
  }

  const receipt = await result.wait(1);
  console.log('[Uniswap] Swap confirmed:', receipt.hash);
  return receipt;
}

/** @deprecated Use swapTokens instead */
export async function swapTokenForDHB(
  amountOutDHB: bigint,
  maxAmountIn: bigint,
  recipient: string,
  tokenInAddress: string = '0x0',
  feeTier: number = 10000,
): Promise<{ hash: string }> {
  return swapTokens(amountOutDHB, maxAmountIn, recipient, tokenInAddress, feeTier, DHB_BASE);
}

// Legacy wrapper for backward compatibility
export async function swapETHForDHB(
  amountOutDHB: bigint,
  maxETH: bigint,
  recipient: string,
): Promise<{ hash: string }> {
  return swapTokenForDHB(amountOutDHB, maxETH, recipient, '0x0', 10000);
}

/**
 * A priced way of buying an exact amount of DHB with one wallet token.
 *
 * `single` is a direct pool (only WETH has one). `path` hops through WETH,
 * which is what makes stablecoin balances spendable on DHB at all.
 */
export type DhbBuyRoute =
  | { kind: 'single'; tokenIn: string; amountIn: bigint; feeTier: number }
  | { kind: 'path'; tokenIn: string; amountIn: bigint; path: string };

/**
 * Encode a Uniswap V3 exactOutput path. These run OUTPUT first, so the bytes
 * read DHB → fee → WETH → fee → tokenIn even though the trade goes the other
 * way. Getting this backwards is the classic exactOutput bug; the quoter uses
 * the same encoding, so a wrong path fails at the quote and never reaches a
 * signature.
 */
function encodeExactOutputPath(tokenIn: string, midFee: number, dhbFee: number): string {
  return solidityPacked(
    ['address', 'uint24', 'address', 'uint24', 'address'],
    [DHB_BASE, dhbFee, WETH_BASE, midFee, tokenIn],
  );
}

/**
 * Cheapest route from `tokenInAddress` to an exact `amountOutDhb`, or null when
 * the token has no liquidity path at this size.
 *
 * Every tier combination is quoted at once — a pool that doesn't exist reverts
 * in eth_call, costs nothing, and simply drops out of the results.
 */
export async function quoteDhbPurchase(
  amountOutDhb: bigint,
  tokenInAddress: string,
): Promise<DhbBuyRoute | null> {
  await initChainRpcUrls();
  const resolved = resolveTokenAddress(tokenInAddress);

  // WETH (and native ETH, which resolves to it) trades against DHB directly.
  if (resolved.toLowerCase() === WETH_BASE.toLowerCase()) {
    const quote = await getSwapQuote(amountOutDhb, tokenInAddress);
    return quote
      ? { kind: 'single', tokenIn: tokenInAddress, amountIn: quote.amountIn, feeTier: quote.feeTier }
      : null;
  }

  // Fee tiers for the token↔WETH leg. Stables sit at 0.05% or 0.01% on Base,
  // volatile pairs at 0.3%/1%.
  const MID_FEES = [500, 100, 3000, 10000] as const;

  const attempts = MID_FEES.flatMap((midFee) =>
    FEE_TIERS.map(async (dhbFee) => {
      const path = encodeExactOutputPath(resolved, midFee, dhbFee);
      try {
        const amountIn = await readContract<bigint>(
          UNISWAP_QUOTER_V2,
          quoterPathInterface,
          'quoteExactOutput',
          [path, amountOutDhb],
          BASE_CHAIN_ID,
        );
        return { kind: 'path' as const, tokenIn: tokenInAddress, amountIn, path };
      } catch {
        return null;
      }
    }),
  );

  const routes = (await Promise.all(attempts)).filter(
    (r): r is Extract<DhbBuyRoute, { kind: 'path' }> => r !== null && r.amountIn > BigInt(0),
  );
  if (routes.length === 0) return null;

  routes.sort((a, b) => (a.amountIn < b.amountIn ? -1 : 1));
  return routes[0];
}

/**
 * Execute a route from `quoteDhbPurchase`, buying exactly `amountOutDhb`.
 *
 * `maxAmountIn` is the slippage-padded ceiling; native ETH is refunded in the
 * same transaction so an over-quote is never left in the router.
 */
export async function buyDhbViaRoute(
  route: DhbBuyRoute,
  amountOutDhb: bigint,
  maxAmountIn: bigint,
  recipient: string,
): Promise<{ hash: string }> {
  if (route.kind === 'single') {
    return swapTokens(amountOutDhb, maxAmountIn, recipient, route.tokenIn, route.feeTier, DHB_BASE);
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + SWAP_DEADLINE_SECONDS);
  const swapCalldata = swapRouterInterface.encodeFunctionData('exactOutput', [{
    path: route.path,
    recipient,
    amountOut: amountOutDhb,
    amountInMaximum: maxAmountIn,
  }]);

  await ensureAllowance(route.tokenIn, recipient, maxAmountIn);
  const result = await writeContractAA(
    UNISWAP_SWAP_ROUTER,
    multicallInterface,
    'multicall',
    [deadline, [swapCalldata]],
    {
      context: 'Swap token → DHB',
      chainId: BASE_CHAIN_ID,
    },
  );

  const receipt = await result.wait(1);
  console.log('[Uniswap] Multi-hop swap confirmed:', receipt.hash);
  return receipt;
}

/**
 * Check if auto-swap is supported for the given chain.
 * Currently only Base has DHB liquidity on Uniswap V3.
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
