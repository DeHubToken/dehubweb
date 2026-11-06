/**
 * Pay for AI generation with coins other than DHB.
 *
 * Prices stay in DHB. When someone presses Create without enough DHB, they can
 * send the same dollar amount in USDT, USDC, BNB, ETH or USDFC instead. The
 * coin goes to the treasury and lands in their Studio balance (subscription
 * tokens, held in dollars), and the job is then paid from that balance — the
 * route payForJob already takes first when the balance covers it.
 *
 * The API reads each transfer on chain and values it when it landed, so
 * nothing here is trusted: a wrong amount only credits what was really sent.
 */
import { apiCall } from '@/lib/api/dehub/core';
import {
  claimSubscriptionCreditTopUp,
  clearPendingCreditTopUp,
  FINAL_TOPUP_STATUSES,
  rememberPendingCreditTopUp,
} from '@/lib/api/dehub/credits';
import { translateCopy as _translateCopy } from '@/i18n/copy';

export type CoinSymbol = 'USDT' | 'USDC' | 'BNB' | 'ETH' | 'USDFC';

export interface TopUpCoin {
  symbol: CoinSymbol;
  chainId: number;
  /** ERC-20 contract; null for the chain's own coin. */
  address: string | null;
  decimals: number;
  priceUsd: number;
  treasuryAddress: string;
}

export const FILECOIN_CHAIN_ID = 314;

export const COIN_CHAIN_NAMES: Record<number, string> = {
  56: 'BNB Chain',
  8453: 'Base',
  314: 'Filecoin',
};

/** Order the sheet lists coins in: dollars first, then the chains' own coins. */
const ORDER: CoinSymbol[] = ['USDT', 'USDC', 'BNB', 'ETH', 'USDFC'];

const READ_RPCS: Record<number, string[]> = {
  56: ['https://bsc-dataseed.binance.org', 'https://bsc-rpc.publicnode.com'],
  8453: ['https://base-rpc.publicnode.com', 'https://mainnet.base.org'],
  314: ['https://api.node.glif.io/rpc/v1'],
};

/** Native coins are paid with a growing margin, since their price moves between quote and landing. Any excess stays in the balance. */
const NATIVE_BUFFER = 1.02;

export async function fetchTopUpCoins(): Promise<TopUpCoin[]> {
  const response = await apiCall<{ assets?: TopUpCoin[] }>('/api/subscription-credits/topup-options');
  const assets = (response?.assets || []).filter(
    (a) => a.treasuryAddress && Number(a.priceUsd) > 0 && ORDER.includes(a.symbol),
  );
  return assets.sort((a, b) => ORDER.indexOf(a.symbol) - ORDER.indexOf(b.symbol) || a.chainId - b.chainId);
}

export function coinKey(coin: Pick<TopUpCoin, 'symbol' | 'chainId'>): string {
  return `${coin.symbol}:${coin.chainId}`;
}

async function rpc(chainId: number, method: string, params: unknown[]): Promise<string> {
  for (const url of READ_RPCS[chainId] || []) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: controller.signal,
      });
      const body = await res.json();
      if (typeof body?.result === 'string' && /^0x[0-9a-f]*$/i.test(body.result)) return body.result;
    } catch {
      /* next endpoint */
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Balance unavailable');
}

/** Each coin's balance in whole units, or null when it could not be read. */
export async function readCoinBalances(coins: TopUpCoin[], wallet: string): Promise<Record<string, number | null>> {
  const owner = wallet.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const entries = await Promise.all(
    coins.map(async (coin) => {
      try {
        const raw = coin.address
          ? await rpc(coin.chainId, 'eth_call', [{ to: coin.address, data: `0x70a08231${owner}` }, 'latest'])
          : await rpc(coin.chainId, 'eth_getBalance', [wallet, 'latest']);
        const value = raw === '0x' ? 0n : BigInt(raw);
        return [coinKey(coin), Number(value) / 10 ** coin.decimals] as const;
      } catch {
        return [coinKey(coin), null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

/** How much of `coin` covers `usd`, as a string the wallet can sign. Rounded up. */
export function coinAmountFor(coin: TopUpCoin, usd: number): string {
  if (!coin.address) {
    const units = (usd * NATIVE_BUFFER) / coin.priceUsd;
    const step = 1e6;
    return (Math.ceil(units * step) / step).toFixed(6);
  }
  // Stablecoins: whole cents, rounded up, never less than one cent.
  return Math.max(0.01, Math.ceil(usd * 100) / 100).toFixed(2);
}

export function formatCoinAmount(value: number | string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (n === 0) return '0';
  if (n >= 100) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 3 });
}

/** Which coins this wallet can actually send to the treasury. */
export function payableCoins(coins: TopUpCoin[], smartWallet: boolean): TopUpCoin[] {
  // A smart wallet's own-coin send is an internal call a receipt does not
  // show, and smart wallets are not set up on Filecoin, so those wallets pay
  // with USDT or USDC on BNB Chain or Base.
  if (!smartWallet) return coins;
  return coins.filter((c) => c.address && c.chainId !== FILECOIN_CHAIN_ID);
}

async function sendCoin(coin: TopUpCoin, amount: string): Promise<string> {
  if (coin.chainId === FILECOIN_CHAIN_ID) {
    // Filecoin has no chain config in the shared senders, and their gas
    // estimate would ask Base. wagmi talks to Filecoin's own RPC instead.
    const [{ switchChain }, { writeContract }, { wagmiConfig }, { parseUnits }] = await Promise.all([
      import('@/lib/contracts/aa-utils'),
      import('@wagmi/core'),
      import('@/lib/wagmi'),
      import('ethers'),
    ]);
    await switchChain(FILECOIN_CHAIN_ID as never);
    return writeContract(wagmiConfig, {
      chainId: FILECOIN_CHAIN_ID as never,
      address: coin.address as `0x${string}`,
      abi: [{ type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }] as const,
      functionName: 'transfer',
      args: [coin.treasuryAddress as `0x${string}`, BigInt(parseUnits(amount, coin.decimals).toString())],
    } as never);
  }
  const { sendERC20Token, sendNativeToken } = await import('@/lib/wallet/send');
  const result = coin.address
    ? await sendERC20Token(coin.address, coin.treasuryAddress, amount, coin.decimals, coin.chainId as never)
    : await sendNativeToken(coin.treasuryAddress, amount, coin.decimals, coin.chainId as never);
  return result.hash;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send `usd` worth of `coin` to the treasury and wait until the Studio balance
 * holds it. Returns the dollars credited.
 *
 * The hash is remembered before the claim, so a closed tab or dropped
 * connection still credits it on the next balance read.
 */
export async function topUpWithCoin(coin: TopUpCoin, usd: number, wallet: string): Promise<number> {
  const amount = coinAmountFor(coin, usd);
  const hash = (await sendCoin(coin, amount)).toLowerCase();
  rememberPendingCreditTopUp({ hash, chainId: coin.chainId, address: wallet, asset: coin.symbol });

  const deadline = Date.now() + 3 * 60_000;
  let delay = 2500;
  while (Date.now() < deadline) {
    try {
      const result = await claimSubscriptionCreditTopUp(hash, coin.chainId, coin.symbol);
      if (result?.credited) {
        clearPendingCreditTopUp(hash);
        return Number(result.usd) || 0;
      }
    } catch (err) {
      const status = (err as { httpStatus?: number })?.httpStatus;
      if (status && FINAL_TOPUP_STATUSES.has(status)) {
        clearPendingCreditTopUp(hash);
        throw err;
      }
    }
    await sleep(delay);
    delay = Math.min(delay * 1.4, 8000);
  }
  throw new Error(
    _translateCopy('copy.coinTopupSlow', {
      defaultValue: 'Your payment was sent but is taking a while to arrive. It will be added to your Studio balance automatically.',
    }),
  );
}
