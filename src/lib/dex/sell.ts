import { Contract, formatUnits, Interface, parseUnits, ZeroAddress, id } from 'ethers';
import { Percent, Token } from '@uniswap/sdk-core';
import { Pool, Position, V4PositionManager } from '@uniswap/v4-sdk';
import { encodeSqrtRatioX96, TickMath } from '@uniswap/v3-sdk';
import { getActiveProvider, writeContractAA } from '@/lib/contracts/aa-utils';
import { BASE_CHAIN_ID, BNB_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { DEX_CHAINS, dexProvider, dexReceipt, verifyPosition, type DexChainId, type VerifiedPosition } from './v4';
import { getAccount } from '@wagmi/core';
import { wagmiConfig } from '@/lib/wagmi';
import { readWithTimeout, type OrderStage } from './read-timeout';

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

async function assertSigningWallet(chainId: DexChainId, expected: string) {
  const { provider } = await readWithTimeout(getActiveProvider(chainId), 'Wallet connection', 60000);
  const actual = provider ? (await readWithTimeout(provider.request({ method: 'eth_accounts' }) as Promise<string[]>, 'Wallet account'))[0]
    : getAccount(wagmiConfig).address;
  if (actual?.toLowerCase() !== expected.toLowerCase()) throw new Error('Wallet account changed. Review the order again.');
}

export async function detectDhbChain(walletAddress: string): Promise<{ chainId: DexChainId | null; balance: string; base: string; bnb: string }> {
  const [baseRead, bnbRead] = await Promise.allSettled([
    readWithTimeout(new Contract(DEX_CHAINS[BASE_CHAIN_ID].dhb, ERC20, await dexProvider(BASE_CHAIN_ID)).balanceOf(walletAddress) as Promise<bigint>, 'Base balance'),
    readWithTimeout(new Contract(DEX_CHAINS[BNB_CHAIN_ID].dhb, ERC20, await dexProvider(BNB_CHAIN_ID)).balanceOf(walletAddress) as Promise<bigint>, 'BNB balance'),
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
  const read = async (chainId: DexChainId) => new Contract(DEX_CHAINS[chainId].usdc, ERC20, await dexProvider(chainId))
    .balanceOf(walletAddress) as Promise<bigint>;
  const [baseRead, bnbRead] = await Promise.allSettled([readWithTimeout(read(BASE_CHAIN_ID), 'Base balance'), readWithTimeout(read(BNB_CHAIN_ID), 'BNB balance')]);
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
  const provider = await dexProvider(input.chainId);
  const dhb = new Token(input.chainId, cfg.dhb, 18, 'DHB');
  const usdc = new Token(input.chainId, cfg.usdc, cfg.usdcDecimals, 'USDC');
  const poolId = Pool.getPoolId(dhb, usdc, FEE, TICK_SPACING, ZeroAddress);
  const state = new Contract(cfg.stateView, STATE, provider);
  const [slot0, liquidity] = await readWithTimeout(Promise.all([
    state.getSlot0(poolId) as Promise<[bigint, bigint, bigint, bigint]>,
    state.getLiquidity(poolId) as Promise<bigint>,
  ]), 'Pool preparation');
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

async function ensureTokenApproval(input: SellInput, amount: bigint, progress: (stage: OrderStage) => void) {
  if (amount > MAX_UINT160) throw new Error('Amount exceeds Permit2 limits');
  const cfg = DEX_CHAINS[input.chainId];
  const provider = await dexProvider(input.chainId);
  const tokenAddress = input.side === 'sell' ? cfg.dhb : cfg.usdc;
  const symbol = input.side === 'sell' ? 'DHB' : 'USDC';
  const token = new Contract(tokenAddress, ERC20, provider);
  progress('balance');
  const balance = await readWithTimeout(token.balanceOf(input.walletAddress) as Promise<bigint>, 'Token balance');
  if (balance < amount) throw new Error(`Insufficient ${symbol} on the selected chain`);
  const allowance = await readWithTimeout(token.allowance(input.walletAddress, PERMIT2) as Promise<bigint>, 'Token allowance');
  if (allowance < amount) {
    progress('tokenApproval');
    await assertSigningWallet(input.chainId, input.walletAddress);
    const tx = await writeContractAA(tokenAddress, ERC20, 'approve', [PERMIT2, amount],
      { chainId: input.chainId, context: `approve ${symbol} for Permit2` });
    if ((await readWithTimeout(tx.wait(), 'Approval confirmation', 120000)).status !== 1) throw new Error(`${symbol} approval did not confirm`);
  }
  const permit = new Contract(PERMIT2, PERMIT, provider);
  const [permitted, expiration] = await readWithTimeout(permit.allowance(input.walletAddress, tokenAddress, cfg.positionManager) as Promise<[bigint, bigint, bigint]>, 'Position allowance');
  if (permitted < amount || expiration <= BigInt(Math.floor(Date.now() / 1000) + 1200)) {
    const expires = Math.floor(Date.now() / 1000) + 86400;
    progress('permitApproval');
    await assertSigningWallet(input.chainId, input.walletAddress);
    const tx = await writeContractAA(PERMIT2, PERMIT, 'approve', [tokenAddress, cfg.positionManager, amount, expires],
      { chainId: input.chainId, context: `approve ${symbol} for the position manager` });
    if ((await readWithTimeout(tx.wait(), 'Approval confirmation', 120000)).status !== 1) throw new Error('Position approval did not confirm');
  }
}

export async function mintSellPosition(input: SellInput, progress: (stage: OrderStage) => void = () => {}, submitted?: (hash: string) => void): Promise<{ tokenId: string; txHash: string }> {
  progress('wallet');
  const { provider: signer } = await readWithTimeout(getActiveProvider(input.chainId), 'Wallet connection', 60000);
  if (signer) {
    const accounts = await readWithTimeout(signer.request({ method: 'eth_accounts' }) as Promise<string[]>, 'Wallet account');
    if (!accounts[0] || accounts[0].toLowerCase() !== input.walletAddress.toLowerCase()) {
      throw new Error('The connected signing wallet does not match this DHB address');
    }
  }
  if (!signer && getAccount(wagmiConfig).address?.toLowerCase() !== input.walletAddress.toLowerCase()) {
    throw new Error('Connect the wallet holding this balance before creating a position');
  }
  progress('quote');
  let quote = await quoteSellPosition(input);
  await ensureTokenApproval(input, quote.amountIn, progress);
  // Approvals can take time. Recheck pool state and single-sided requirements.
  quote = await quoteSellPosition(input);
  const parsed = POSITION.parseTransaction({ data: quote.calldata });
  if (!parsed) throw new Error('Could not prepare the Uniswap position transaction');
  const cfg = DEX_CHAINS[input.chainId];
  progress('submit');
  await assertSigningWallet(input.chainId, input.walletAddress);
  const tx = await writeContractAA(cfg.positionManager, POSITION, parsed.name, Array.from(parsed.args),
    { chainId: input.chainId, value: quote.value, context: 'create DHB market position' });
  progress('confirm');
  submitted?.(tx.hash);
  const result = await readWithTimeout(tx.wait(), 'Position confirmation; use Resume listing to check this transaction', 120000);
  if (result.status !== 1) throw Object.assign(new Error('The position transaction reverted. No position was created.'), { code: 'DEX_REVERTED' });
  return recoverMint(input, result.hash);
}

export async function recoverMint(input: SellInput, hash: string): Promise<{ tokenId: string; txHash: string }> {
  const cfg = DEX_CHAINS[input.chainId];
  const receipt = await readWithTimeout(dexReceipt(input.chainId, hash), 'Transaction receipt');
  if (!receipt) throw new Error('Position submitted but its receipt is not available yet');
  if (receipt.status !== 1) throw Object.assign(new Error('The position transaction reverted. No position was created.'), { code: 'DEX_REVERTED' });
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
  const fresh = await readWithTimeout(verifyPosition(position), 'Position refresh');
  if (!fresh) throw new Error('This position has already been withdrawn or is unavailable');
  position = fresh;
  if (position.owner.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error('Only the current position owner can withdraw');
  }
  const chainId = position.chain_id as DexChainId;
  const cfg = DEX_CHAINS[chainId];
  const { provider: signer } = await readWithTimeout(getActiveProvider(chainId), 'Wallet connection', 60000);
  if (signer) {
    const accounts = await readWithTimeout(signer.request({ method: 'eth_accounts' }) as Promise<string[]>, 'Wallet account');
    if (accounts[0]?.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error('Connect the wallet that owns this position');
    }
  }
  if (!signer && getAccount(wagmiConfig).address?.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error('Connect the wallet that owns this position');
  }
  const provider = await dexProvider(chainId);
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
    slippageTolerance: new Percent(5, 1000),
    deadline: Math.floor(Date.now() / 1000) + 1200,
    burnToken: true,
  });
  const parsed = POSITION.parseTransaction({ data: call.calldata });
  if (!parsed) throw new Error('Could not prepare the withdrawal transaction');
  await assertSigningWallet(chainId, walletAddress);
  const tx = await writeContractAA(cfg.positionManager, POSITION, parsed.name, Array.from(parsed.args),
    { chainId, value: call.value, context: 'withdraw DHB sell position' });
  const receipt = await readWithTimeout(tx.wait(), 'Withdrawal confirmation; check your wallet transaction before retrying', 120000);
  if (receipt.status !== 1) throw new Error('Withdrawal did not confirm');
  return receipt.hash;
}
