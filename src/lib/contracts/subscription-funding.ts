/**
 * Subscription smart funding
 * ==========================
 *
 * Subscription plans settle in a fixed stablecoin amount. Buyers should not
 * have to leave checkout just because that stablecoin is not the asset they
 * happen to hold. This module fills only the stablecoin shortfall with an
 * exact-output DEX trade, then hands back to the normal subscription purchase.
 *
 * The contract still receives its configured token and amount. Nothing here
 * changes creator accounting or guesses at a USD price: the DEX quote buys the
 * exact raw token amount the contract is about to pull.
 */

import { Interface, solidityPacked } from 'ethers';
import type { ChainId } from '@/components/app/ChainSelector';
import {
  approveERC20,
  getERC20Allowance,
  getERC20Balance,
  readContract,
  waitForERC20Balance,
  writeContractAA,
} from './aa-utils';
import { BASE_CHAIN_ID, BNB_CHAIN_ID } from './dhb-token';
import { DEFAULT_TOKENS, getERC20TokenBalance, getNativeBalance } from '@/lib/wallet/tokens';

const ZERO = '0x0000000000000000000000000000000000000000';
const SLIPPAGE_BPS = 200;
const DEADLINE_SECONDS = 60;

type DexKind = 'uniswap02' | 'pancake-v3';

interface DexConfig {
  kind: DexKind;
  router: string;
  quoter: string;
  wrappedNative: string;
  nativeSymbol: 'ETH' | 'BNB';
  feeTiers: readonly number[];
  /** Leave enough native token for a non-sponsored follow-up transaction. */
  gasReserve: bigint;
}

const DEX_CONFIG: Partial<Record<number, DexConfig>> = {
  [BASE_CHAIN_ID]: {
    kind: 'uniswap02',
    router: '0x2626664c2603336E57B271c5C0b26F421741e481',
    quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    wrappedNative: '0x4200000000000000000000000000000000000006',
    nativeSymbol: 'ETH',
    feeTiers: [100, 500, 3000, 10000],
    gasReserve: 20_000_000_000_000n, // 0.00002 ETH
  },
  [BNB_CHAIN_ID]: {
    kind: 'pancake-v3',
    router: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
    quoter: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
    wrappedNative: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    nativeSymbol: 'BNB',
    feeTiers: [100, 500, 2500, 10000],
    gasReserve: 200_000_000_000_000n, // 0.0002 BNB
  },
};

const quoterInterface = new Interface([
  'function quoteExactOutputSingle((address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
  'function quoteExactOutput(bytes path, uint256 amountOut) returns (uint256 amountIn, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)',
]);

const uniswapRouterInterface = new Interface([
  'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountIn)',
  'function exactOutput((bytes path, address recipient, uint256 amountOut, uint256 amountInMaximum)) payable returns (uint256 amountIn)',
  'function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)',
  'function refundETH() payable',
]);

const pancakeRouterInterface = new Interface([
  'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountIn)',
  'function exactOutput((bytes path, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum)) payable returns (uint256 amountIn)',
  'function multicall(bytes[] data) payable returns (bytes[] results)',
  'function refundETH() payable',
]);

export interface FundingToken {
  symbol: string;
  address: string;
  decimals: number;
  balance: bigint;
  native: boolean;
}

export type SubscriptionFundingRoute =
  | {
      kind: 'single';
      chainId: ChainId;
      token: FundingToken;
      outputToken: string;
      amountOut: bigint;
      amountIn: bigint;
      feeTier: number;
    }
  | {
      kind: 'path';
      chainId: ChainId;
      token: FundingToken;
      outputToken: string;
      amountOut: bigint;
      amountIn: bigint;
      path: string;
    };

export interface SubscriptionFundingResult {
  swapped: boolean;
  sourceSymbol: string;
  amountIn?: bigint;
}

interface EnsureSubscriptionFundingParams {
  chainId: ChainId;
  owner: string;
  outputToken: string;
  outputSymbol: string;
  total: bigint;
  onStage?: (message: string) => void;
}

function isNative(address: string): boolean {
  return !address || address === '0x0' || address.toLowerCase() === ZERO;
}

function withSlippage(amount: bigint, bps = SLIPPAGE_BPS): bigint {
  return amount + (amount * BigInt(bps)) / 10_000n;
}

function exactOutputPath(
  outputToken: string,
  outputFee: number,
  wrappedNative: string,
  inputFee: number,
  inputToken: string,
): string {
  return solidityPacked(
    ['address', 'uint24', 'address', 'uint24', 'address'],
    [outputToken, outputFee, wrappedNative, inputFee, inputToken],
  );
}

async function bestRoute(
  chainId: ChainId,
  token: FundingToken,
  outputToken: string,
  amountOut: bigint,
): Promise<SubscriptionFundingRoute | null> {
  const config = DEX_CONFIG[chainId];
  if (!config) return null;

  const tokenIn = isNative(token.address) ? config.wrappedNative : token.address;
  const direct = await Promise.all(
    config.feeTiers.map(async (feeTier) => {
      try {
        const amountIn = await readContract<bigint>(
          config.quoter,
          quoterInterface,
          'quoteExactOutputSingle',
          [{ tokenIn, tokenOut: outputToken, amount: amountOut, fee: feeTier, sqrtPriceLimitX96: 0n }],
          chainId,
        );
        return amountIn > 0n
          ? ({ kind: 'single', chainId, token, outputToken, amountOut, amountIn, feeTier } as const)
          : null;
      } catch {
        return null;
      }
    }),
  );

  const routes: SubscriptionFundingRoute[] = direct.filter(
    (route): route is Extract<SubscriptionFundingRoute, { kind: 'single' }> => route !== null,
  );

  // If neither side is the wrapped native token, also try a two-pool route.
  // Exact-output paths are encoded backwards: output -> wrapped -> input.
  if (
    tokenIn.toLowerCase() !== config.wrappedNative.toLowerCase() &&
    outputToken.toLowerCase() !== config.wrappedNative.toLowerCase()
  ) {
    const attempts = config.feeTiers.flatMap((outputFee) =>
      config.feeTiers.map(async (inputFee) => {
        const path = exactOutputPath(
          outputToken,
          outputFee,
          config.wrappedNative,
          inputFee,
          tokenIn,
        );
        try {
          const amountIn = await readContract<bigint>(
            config.quoter,
            quoterInterface,
            'quoteExactOutput',
            [path, amountOut],
            chainId,
          );
          return amountIn > 0n
            ? ({ kind: 'path', chainId, token, outputToken, amountOut, amountIn, path } as const)
            : null;
        } catch {
          return null;
        }
      }),
    );
    const pathRoutes = (await Promise.all(attempts)).filter(
      (route): route is Extract<SubscriptionFundingRoute, { kind: 'path' }> => route !== null,
    );
    routes.push(...pathRoutes);
  }

  routes.sort((a, b) => (a.amountIn < b.amountIn ? -1 : a.amountIn > b.amountIn ? 1 : 0));
  return routes[0] ?? null;
}

async function walletCandidates(owner: string, chainId: ChainId): Promise<FundingToken[]> {
  const config = DEX_CONFIG[chainId];
  if (!config) return [];
  const erc20s = DEFAULT_TOKENS[chainId] ?? [];
  const tokens = await Promise.all<FundingToken>([
    getNativeBalance(owner, chainId)
      .then((balance) => ({
        symbol: config.nativeSymbol,
        address: '0x0',
        decimals: 18,
        balance,
        native: true,
      }))
      .catch(() => ({
        symbol: config.nativeSymbol,
        address: '0x0',
        decimals: 18,
        balance: 0n,
        native: true,
      })),
    ...erc20s.map((token) =>
      getERC20TokenBalance(token.address, owner, chainId)
        .then((balance) => ({ ...token, balance, native: false }))
        .catch(() => ({ ...token, balance: 0n, native: false })),
    ),
  ]);

  const priority = ['USDC', 'DHB', 'WETH', config.nativeSymbol, 'BTC'];
  return tokens
    .filter((token) => token.balance > 0n)
    .sort((a, b) => {
      const ai = priority.indexOf(a.symbol);
      const bi = priority.indexOf(b.symbol);
      return (ai < 0 ? priority.length : ai) - (bi < 0 ? priority.length : bi);
    });
}

export async function findSubscriptionFundingRoute(
  params: Omit<EnsureSubscriptionFundingParams, 'onStage'>,
): Promise<{ balance: bigint; route: SubscriptionFundingRoute | null }> {
  const config = DEX_CONFIG[params.chainId];
  const balance = await getERC20Balance(params.outputToken, params.owner, params.chainId).catch(() => 0n);
  if (!config || balance >= params.total) return { balance, route: null };

  const shortfall = params.total - balance;
  const candidates = await walletCandidates(params.owner, params.chainId);
  for (const token of candidates) {
    if (token.address.toLowerCase() === params.outputToken.toLowerCase()) continue;
    const route = await bestRoute(params.chainId, token, params.outputToken, shortfall);
    if (!route) continue;
    const maxIn = withSlippage(route.amountIn);
    const spendable = token.native
      ? token.balance > config.gasReserve
        ? token.balance - config.gasReserve
        : 0n
      : token.balance;
    if (spendable >= maxIn) return { balance, route };
  }

  return { balance, route: null };
}

async function executeRoute(route: SubscriptionFundingRoute, owner: string): Promise<void> {
  const config = DEX_CONFIG[route.chainId];
  if (!config) throw new Error('Smart funding is not available on this chain');

  const maxIn = withSlippage(route.amountIn);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
  const tokenIn = isNative(route.token.address) ? config.wrappedNative : route.token.address;
  const routerInterface = config.kind === 'uniswap02' ? uniswapRouterInterface : pancakeRouterInterface;
  const method = route.kind === 'single' ? 'exactOutputSingle' : 'exactOutput';

  const params = route.kind === 'single'
    ? config.kind === 'uniswap02'
      ? {
          tokenIn,
          tokenOut: route.outputToken,
          fee: route.feeTier,
          recipient: owner,
          amountOut: route.amountOut,
          amountInMaximum: maxIn,
          sqrtPriceLimitX96: 0n,
        }
      : {
          tokenIn,
          tokenOut: route.outputToken,
          fee: route.feeTier,
          recipient: owner,
          deadline,
          amountOut: route.amountOut,
          amountInMaximum: maxIn,
          sqrtPriceLimitX96: 0n,
        }
    : config.kind === 'uniswap02'
      ? { path: route.path, recipient: owner, amountOut: route.amountOut, amountInMaximum: maxIn }
      : { path: route.path, recipient: owner, deadline, amountOut: route.amountOut, amountInMaximum: maxIn };

  if (!route.token.native) {
    const allowance = await getERC20Allowance(
      route.token.address,
      owner,
      config.router,
      route.chainId,
    );
    if (allowance < maxIn) {
      const approval = await approveERC20(route.token.address, config.router, maxIn, route.chainId);
      await approval.wait(1);
    }
    const result = await writeContractAA(
      config.router,
      routerInterface,
      method,
      [params],
      { context: `swap ${route.token.symbol} to stablecoin`, chainId: route.chainId },
    );
    await result.wait(1);
    return;
  }

  const swap = routerInterface.encodeFunctionData(method, [params]);
  const refund = routerInterface.encodeFunctionData('refundETH', []);
  const args = config.kind === 'uniswap02'
    ? [deadline, [swap, refund]]
    : [[swap, refund]];
  const result = await writeContractAA(
    config.router,
    routerInterface,
    'multicall',
    args,
    {
      value: maxIn,
      context: `swap ${route.token.symbol} to stablecoin`,
      chainId: route.chainId,
    },
  );
  await result.wait(1);
}

/**
 * Make sure the wallet has the exact stablecoin debit the contract will pull.
 * Stablecoin already in the wallet is always used first; only the shortfall is
 * swapped. Throws before any write when no liquid, balance-covered route exists.
 */
export async function ensureSubscriptionFunding(
  params: EnsureSubscriptionFundingParams,
): Promise<SubscriptionFundingResult> {
  const { balance, route } = await findSubscriptionFundingRoute(params);
  if (balance >= params.total) {
    return { swapped: false, sourceSymbol: params.outputSymbol };
  }
  if (!route) {
    throw new Error(
      `Not enough ${params.outputSymbol}, and no safe in-app swap route can cover the difference from this wallet.`,
    );
  }

  params.onStage?.(`Swapping ${route.token.symbol} to ${params.outputSymbol}…`);
  await executeRoute(route, params.owner);
  const funded = await waitForERC20Balance(
    params.outputToken,
    params.owner,
    params.total,
    params.chainId,
  );
  if (funded < params.total) {
    throw new Error(
      `The ${params.outputSymbol} swap may still be settling. Check the balance before trying again so it is not swapped twice.`,
    );
  }

  return { swapped: true, sourceSymbol: route.token.symbol, amountIn: route.amountIn };
}

export function isSubscriptionSmartFundingChain(chainId: number): boolean {
  return Boolean(DEX_CONFIG[chainId]);
}
