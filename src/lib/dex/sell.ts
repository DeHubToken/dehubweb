import { Contract, formatUnits, Interface, parseUnits, ZeroAddress, id } from 'ethers';
import { Percent, Token } from '@uniswap/sdk-core';
import { Pool, Position, V4PositionManager } from '@uniswap/v4-sdk';
import { encodeSqrtRatioX96, TickMath } from '@uniswap/v3-sdk';
import { getDHBBalance } from '@/lib/contracts/stream-controller';
import { getActiveProvider, writeContractAA } from '@/lib/contracts/aa-utils';
import { BASE_CHAIN_ID, BNB_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { DEX_CHAINS, dexProvider, type DexChainId, type VerifiedPosition } from './v4';

const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const FEE = 0;
const TICK_SPACING = 1;
const LN_TICK = Math.log(1.0001);
const MAX_UINT160 = (1n << 160n) - 1n;
const ERC20 = new Interface([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
]);
const PERMIT = new Interface([
  'function allowance(address,address,address) view returns (uint160,uint48,uint48)',
  'function approve(address,address,uint160,uint48)',
]);
const POSITION = new Interface([
  'function multicall(bytes[] data) payable returns (bytes[])',
  'function modifyLiquidities(bytes unlockData,uint256 deadline) payable',
  'event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)',
]);
const STATE = new Interface([
  'function getSlot0(bytes32) view returns (uint160,int24,uint24,uint24)',
  'function getLiquidity(bytes32) view returns (uint128)',
]);

export async function detectDhbChain(walletAddress: string): Promise<{ chainId: DexChainId | null; balance: string; base: string; bnb: string }> {
  const [baseRead, bnbRead] = await Promise.allSettled([
    getDHBBalance(walletAddress, BASE_CHAIN_ID),
    getDHBBalance(walletAddress, BNB_CHAIN_ID),
  ]);
  if (baseRead.status === 'rejected' && bnbRead.status === 'rejected') {
    throw new Error('Could not read DHB balances on Base or BNB Chain');
  }
  const base = baseRead.status === 'fulfilled' ? baseRead.value : 0n;
  const bnb = bnbRead.status === 'fulfilled' ? bnbRead.value : 0n;
  const chainId = base > 0n ? BASE_CHAIN_ID : bnb > 0n ? BNB_CHAIN_ID : null;
  return {
    chainId,
    balance: formatUnits(chainId === BASE_CHAIN_ID ? base : bnb, 18),
    base: formatUnits(base, 18),
    bnb: formatUnits(bnb, 18),
  };
}

export async function detectUsdcChain(walletAddress: string): Promise<{ chainId: DexChainId | null; balance: string }> {
  const read = (chainId: DexChainId) => new Contract(DEX_CHAINS[chainId].usdc, ERC20, dexProvider(chainId))
    .balanceOf(walletAddress) as Promise<bigint>;
  const [baseRead, bnbRead] = await Promise.allSettled([read(BASE_CHAIN_ID), read(BNB_CHAIN_ID)]);
  if (baseRead.status === 'rejected' && bnbRead.status === 'rejected') {
    throw new Error('Could not read USDC balances on Base or BNB Chain');
  }
  const base = baseRead.status === 'fulfilled' ? baseRead.value : 0n;
  const bnb = bnbRead.status === 'fulfilled' ? bnbRead.value : 0n;
  const chainId = base > 0n ? BASE_CHAIN_ID : bnb > 0n ? BNB_CHAIN_ID : null;
  return { chainId, balance: formatUnits(chainId === BASE_CHAIN_ID ? base : bnb,
    chainId ? DEX_CHAINS[chainId].usdcDecimals : 6) };
}

function tickRange(chainId: DexChainId, floor: number, ceiling: number): [number, number] {
  const rawLower = chainId === BASE_CHAIN_ID ? 1e12 / ceiling : floor;
  const rawUpper = chainId === BASE_CHAIN_ID ? 1e12 / floor : ceiling;
  // Keep the actual tick range inside the user's stated price bounds.
  const lower = Math.ceil(Math.log(rawLower) / LN_TICK / TICK_SPACING) * TICK_SPACING;
  const upper = Math.floor(Math.log(rawUpper) / LN_TICK / TICK_SPACING) * TICK_SPACING;
  if (lower < TickMath.MIN_TICK || upper > TickMath.MAX_TICK || lower >= upper) {
    throw new Error('The selected price range is too narrow or outside Uniswap limits');
  }
  return [lower, upper];
}

function initialSqrtPrice(chainId: DexChainId, floor: string): ReturnType<typeof encodeSqrtRatioX96> {
  // floor is restricted to eight decimal places so the integer ratio is exact.
  const floorUnits = parseUnits(floor, 8);
  if (floorUnits <= 0n) throw new Error('Enter a positive minimum price');
  return chainId === BASE_CHAIN_ID
    ? encodeSqrtRatioX96((10n ** 20n).toString(), floorUnits.toString())
    : encodeSqrtRatioX96(floorUnits.toString(), (10n ** 8n).toString());
}

export interface SellInput {
  walletAddress: string;
  chainId: DexChainId;
  side: 'buy' | 'sell';
  amount: string;
  minPrice: string;
  maxPrice: string;
}

export interface SellQuote {
  chainId: DexChainId;
  tickLower: number;
  tickUpper: number;
  amountIn: bigint;
  willCreatePool: boolean;
  calldata: string;
  value: string;
}

export async function quoteSellPosition(input: SellInput): Promise<SellQuote> {
  const cfg = DEX_CHAINS[input.chainId];
  const amountIn = parseUnits(input.amount, input.side === 'sell' ? 18 : cfg.usdcDecimals);
  const floor = Number(input.minPrice);
  const ceiling = Number(input.maxPrice);
  if (amountIn <= 0n || !Number.isFinite(floor) || !Number.isFinite(ceiling) ||
      floor <= 0 || ceiling <= floor || !/^\d+(?:\.\d{1,8})?$/.test(input.minPrice) ||
      !/^\d+(?:\.\d{1,8})?$/.test(input.maxPrice)) {
    throw new Error('Enter a valid amount and price range (up to 8 decimal places)');
  }
  const [tickLower, tickUpper] = tickRange(input.chainId, floor, ceiling);
  const provider = dexProvider(input.chainId);
  const dhb = new Token(input.chainId, cfg.dhb, 18, 'DHB');
  const usdc = new Token(input.chainId, cfg.usdc, cfg.usdcDecimals, 'USDC');
  const poolId = Pool.getPoolId(dhb, usdc, FEE, TICK_SPACING, ZeroAddress);
  const state = new Contract(cfg.stateView, STATE, provider);
  const [slot0, liquidity] = await Promise.all([
    state.getSlot0(poolId) as Promise<[bigint, bigint, bigint, bigint]>,
    state.getLiquidity(poolId) as Promise<bigint>,
  ]);
  const willCreatePool = slot0[0] === 0n;
  const initialSqrt = willCreatePool ? initialSqrtPrice(input.chainId,
    input.side === 'sell' ? input.minPrice : input.maxPrice) : null;
  const sqrtPriceX96 = initialSqrt ? initialSqrt.toString() : slot0[0].toString();
  const currentTick = willCreatePool
    ? TickMath.getTickAtSqrtRatio(initialSqrt!)
    : Number(slot0[1]);
  const oneSided = input.side === 'sell'
    ? input.chainId === BASE_CHAIN_ID ? currentTick >= tickUpper : currentTick <= tickLower
    : input.chainId === BASE_CHAIN_ID ? currentTick <= tickLower : currentTick >= tickUpper;
  if (!oneSided) {
    throw new Error(input.side === 'sell'
      ? 'This range overlaps the pool price. Move the range above the market price to list DHB alone.'
      : 'This range overlaps the pool price. Move the range below the market price to list USDC alone.');
  }
  const pool = new Pool(dhb, usdc, FEE, TICK_SPACING, ZeroAddress,
    sqrtPriceX96, willCreatePool ? '0' : liquidity.toString(), currentTick);
  const position = Position.fromAmounts({
    pool, tickLower, tickUpper,
    amount0: (input.side === 'sell') === (input.chainId === BNB_CHAIN_ID) ? amountIn.toString() : '0',
    amount1: (input.side === 'sell') === (input.chainId === BASE_CHAIN_ID) ? amountIn.toString() : '0',
    useFullPrecision: true,
  });
  if (position.liquidity.toString() === '0') throw new Error('Amount is too small for this range');
  const mintAmounts = position.mintAmounts;
  const requested = input.side === 'sell'
    ? input.chainId === BASE_CHAIN_ID ? mintAmounts.amount1 : mintAmounts.amount0
    : input.chainId === BASE_CHAIN_ID ? mintAmounts.amount0 : mintAmounts.amount1;
  const other = input.side === 'sell'
    ? input.chainId === BASE_CHAIN_ID ? mintAmounts.amount0 : mintAmounts.amount1
    : input.chainId === BASE_CHAIN_ID ? mintAmounts.amount1 : mintAmounts.amount0;
  if (BigInt(other.toString()) !== 0n || BigInt(requested.toString()) > amountIn) {
    throw new Error('The position would require more tokens than requested');
  }
  const { calldata, value } = V4PositionManager.addCallParameters(position, {
    recipient: input.walletAddress,
    slippageTolerance: new Percent(0, 1),
    deadline: Math.floor(Date.now() / 1000) + 1200,
    hookData: '0x',
    createPool: willCreatePool,
    sqrtPriceX96: willCreatePool ? sqrtPriceX96 : undefined,
  });
  return { chainId: input.chainId, tickLower, tickUpper, amountIn, willCreatePool, calldata, value };
}

async function ensureTokenApproval(input: SellInput, amount: bigint) {
  if (amount > MAX_UINT160) throw new Error('Amount exceeds Permit2 limits');
  const cfg = DEX_CHAINS[input.chainId];
  const provider = dexProvider(input.chainId);
  const tokenAddress = input.side === 'sell' ? cfg.dhb : cfg.usdc;
  const symbol = input.side === 'sell' ? 'DHB' : 'USDC';
  const token = new Contract(tokenAddress, ERC20, provider);
  const balance = await token.balanceOf(input.walletAddress) as bigint;
  if (balance < amount) throw new Error(`Insufficient ${symbol} on the selected chain`);
  const allowance = await token.allowance(input.walletAddress, PERMIT2) as bigint;
  if (allowance < amount) {
    const tx = await writeContractAA(tokenAddress, ERC20, 'approve', [PERMIT2, amount],
      { chainId: input.chainId, context: `approve ${symbol} for Permit2` });
    if ((await tx.wait()).status !== 1) throw new Error(`${symbol} approval did not confirm`);
  }
  const permit = new Contract(PERMIT2, PERMIT, provider);
  const [permitted, expiration] = await permit.allowance(input.walletAddress, tokenAddress, cfg.positionManager) as [bigint, bigint, bigint];
  if (permitted < amount || expiration <= BigInt(Math.floor(Date.now() / 1000) + 1200)) {
    const expires = Math.floor(Date.now() / 1000) + 86400;
    const tx = await writeContractAA(PERMIT2, PERMIT, 'approve', [tokenAddress, cfg.positionManager, amount, expires],
      { chainId: input.chainId, context: `approve ${symbol} for the position manager` });
    if ((await tx.wait()).status !== 1) throw new Error('Position approval did not confirm');
  }
}

export async function mintSellPosition(input: SellInput): Promise<{ tokenId: string; txHash: string }> {
  const { provider: signer } = await getActiveProvider(input.chainId);
  if (signer) {
    const accounts = await signer.request({ method: 'eth_accounts' }) as string[];
    if (!accounts[0] || accounts[0].toLowerCase() !== input.walletAddress.toLowerCase()) {
      throw new Error('The connected signing wallet does not match this DHB address');
    }
  }
  let quote = await quoteSellPosition(input);
  await ensureTokenApproval(input, quote.amountIn);
  // Approvals can take time. Recheck pool state and single-sided requirements.
  quote = await quoteSellPosition(input);
  const parsed = POSITION.parseTransaction({ data: quote.calldata });
  if (!parsed) throw new Error('Could not prepare the Uniswap position transaction');
  const cfg = DEX_CHAINS[input.chainId];
  const tx = await writeContractAA(cfg.positionManager, POSITION, parsed.name, Array.from(parsed.args),
    { chainId: input.chainId, value: quote.value, context: 'create DHB sell position' });
  const result = await tx.wait();
  if (result.status !== 1) throw new Error('The position transaction reverted');
  const receipt = await dexProvider(input.chainId).getTransactionReceipt(result.hash);
  if (!receipt) throw new Error('Position submitted but its receipt is not available yet');
  const transferTopic = id('Transfer(address,address,uint256)');
  const mintLog = receipt.logs.find((log) =>
    log.address.toLowerCase() === cfg.positionManager.toLowerCase() &&
    log.topics[0] === transferTopic &&
    log.topics[1] === `0x${'0'.repeat(64)}` &&
    log.topics[2]?.toLowerCase() === `0x${input.walletAddress.slice(2).toLowerCase().padStart(64, '0')}`,
  );
  if (!mintLog?.topics[3]) throw new Error('Position minted but its NFT could not be identified');
  return { tokenId: BigInt(mintLog.topics[3]).toString(), txHash: receipt.hash };
}

export async function withdrawSellPosition(position: VerifiedPosition, walletAddress: string): Promise<string> {
  if (position.owner.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error('Only the current position owner can withdraw');
  }
  const chainId = position.chain_id as DexChainId;
  const cfg = DEX_CHAINS[chainId];
  const { provider: signer } = await getActiveProvider(chainId);
  if (signer) {
    const accounts = await signer.request({ method: 'eth_accounts' }) as string[];
    if (accounts[0]?.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error('Connect the wallet that owns this position');
    }
  }
  const provider = dexProvider(chainId);
  const dhb = new Token(chainId, cfg.dhb, 18, 'DHB');
  const usdc = new Token(chainId, cfg.usdc, cfg.usdcDecimals, 'USDC');
  const poolId = Pool.getPoolId(dhb, usdc, position.poolFee, position.tickSpacing, ZeroAddress);
  const state = new Contract(cfg.stateView, STATE, provider);
  const [slot0, poolLiquidity] = await Promise.all([
    state.getSlot0(poolId) as Promise<[bigint, bigint, bigint, bigint]>,
    state.getLiquidity(poolId) as Promise<bigint>,
  ]);
  const pool = new Pool(dhb, usdc, position.poolFee, position.tickSpacing, ZeroAddress,
    slot0[0].toString(), poolLiquidity.toString(), Number(slot0[1]));
  const sdkPosition = new Position({ pool, liquidity: position.liquidity.toString(),
    tickLower: position.tickLower, tickUpper: position.tickUpper });
  const call = V4PositionManager.removeCallParameters(sdkPosition, {
    tokenId: position.token_id,
    liquidityPercentage: new Percent(1, 1),
    slippageTolerance: new Percent(5, 100),
    deadline: Math.floor(Date.now() / 1000) + 1200,
    burnToken: true,
  });
  const parsed = POSITION.parseTransaction({ data: call.calldata });
  if (!parsed) throw new Error('Could not prepare the withdrawal transaction');
  const tx = await writeContractAA(cfg.positionManager, POSITION, parsed.name, Array.from(parsed.args),
    { chainId, value: call.value, context: 'withdraw DHB sell position' });
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error('Withdrawal did not confirm');
  return receipt.hash;
}
