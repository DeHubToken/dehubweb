/**
 * Solana balances for the wallet page.
 *
 * Deliberately plain JSON-RPC rather than @solana/web3.js. Two reasons: the
 * runtime is ~350 kB and the wallet page is a first-class route, and every
 * question asked here is answerable in two calls — `getBalance` for SOL, and
 * one `getTokenAccountsByOwner` per token program, which returns every SPL
 * balance the owner holds in a single round trip with mint and decimals
 * already parsed.
 *
 * The address read is the account's LINKED Solana address, not a connected
 * wallet. That matters: a creator signed in with Google has no Phantom
 * attached to the page, and their holdings should still show.
 */

import type { WalletToken } from '@/lib/wallet/tokens';
import {
  SOLANA_MAINNET_CHAIN_ID,
  SOLANA_TOKENS,
  SPL_TOKEN_2022_PROGRAM_ID,
  SPL_TOKEN_PROGRAM_ID,
  dhbSolanaMint,
  solanaRpcUrl,
} from '@/lib/chains/solana';

const RPC_TIMEOUT_MS = 8000;

interface ParsedTokenAccount {
  account: {
    data: {
      parsed: {
        info: {
          mint: string;
          tokenAmount: { amount: string; decimals: number; uiAmountString?: string };
        };
      };
    };
  };
}

async function rpc(chainId: number, method: string, params: unknown[]): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const res = await fetch(solanaRpcUrl(chainId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.error ? null : (json?.result ?? null);
  } catch {
    // A dead RPC means "no Solana row", never a broken wallet page.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Trailing-zero-free decimal string, matching what the EVM reader produces. */
function formatUnits(raw: bigint, decimals: number): string {
  if (raw === BigInt(0)) return '0';
  const base = BigInt(10) ** BigInt(decimals);
  const whole = raw / base;
  const fraction = raw % base;
  if (fraction === BigInt(0)) return whole.toString();
  const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fractionStr}`;
}

/** Mints DeHub knows by name. Everything else is shown by a truncated mint. */
function knownMints(): Record<string, { symbol: string; name: string }> {
  const map: Record<string, { symbol: string; name: string }> = {
    [SOLANA_TOKENS.USDC]: { symbol: 'USDC', name: 'USD Coin' },
    [SOLANA_TOKENS.USDT]: { symbol: 'USDT', name: 'Tether' },
  };
  // Present only once the mint exists. Naming it DHB is what makes the wallet
  // page fold this balance into the same row as DHB on Base and BNB — the
  // grouping there keys on symbol.
  const dhb = dhbSolanaMint();
  if (dhb) map[dhb] = { symbol: 'DHB', name: 'DeHub' };
  return map;
}

/**
 * Every balance the given Solana address holds, as `WalletToken`s.
 *
 * Returns `[]` — never throws — when the address is absent or the RPC is
 * unreachable, so a Solana outage costs the Solana rows and nothing else.
 */
export async function getSolanaTokenBalances(
  ownerAddress: string | null | undefined,
  chainId: number = SOLANA_MAINNET_CHAIN_ID,
): Promise<WalletToken[]> {
  if (!ownerAddress) return [];

  const [lamports, splAccounts, spl2022Accounts] = await Promise.all([
    rpc(chainId, 'getBalance', [ownerAddress]),
    rpc(chainId, 'getTokenAccountsByOwner', [
      ownerAddress,
      { programId: SPL_TOKEN_PROGRAM_ID },
      { encoding: 'jsonParsed' },
    ]),
    // Token-2022 is a separate program, so its holdings are invisible to the
    // call above. Newer mints increasingly use it; missing it would silently
    // under-report a balance rather than fail.
    rpc(chainId, 'getTokenAccountsByOwner', [
      ownerAddress,
      { programId: SPL_TOKEN_2022_PROGRAM_ID },
      { encoding: 'jsonParsed' },
    ]),
  ]);

  const tokens: WalletToken[] = [];
  const named = knownMints();

  // Native SOL. Listed even at zero so the chain is visibly present in the
  // wallet rather than appearing only once somebody funds it.
  if (typeof lamports?.value === 'number') {
    const raw = BigInt(lamports.value);
    tokens.push({
      address: '0x0',
      symbol: 'SOL',
      name: 'Solana',
      decimals: 9,
      balance: raw,
      formattedBalance: formatUnits(raw, 9),
      isNative: true,
      chainId: chainId as WalletToken['chainId'],
    });
  }

  const accounts: ParsedTokenAccount[] = [
    ...(splAccounts?.value ?? []),
    ...(spl2022Accounts?.value ?? []),
  ];

  for (const entry of accounts) {
    const info = entry?.account?.data?.parsed?.info;
    if (!info?.mint || !info.tokenAmount) continue;

    let raw: bigint;
    try {
      raw = BigInt(info.tokenAmount.amount);
    } catch {
      continue;
    }
    // An owner accumulates empty token accounts from every airdrop and closed
    // position they have ever touched. Showing them turns the wallet into a
    // list of zeroes; the known mints below are added back regardless.
    if (raw === BigInt(0)) continue;

    const decimals = info.tokenAmount.decimals ?? 0;
    const meta = named[info.mint];
    tokens.push({
      address: info.mint,
      symbol: meta?.symbol ?? `${info.mint.slice(0, 4)}…${info.mint.slice(-4)}`,
      name: meta?.name ?? 'Unknown token',
      decimals,
      balance: raw,
      formattedBalance: formatUnits(raw, decimals),
      isCustom: !meta,
      chainId: chainId as WalletToken['chainId'],
    });
  }

  // Named mints the owner holds no account for yet, so USDC/USDT/DHB read as
  // "0" rather than vanishing — the same courtesy the EVM chains get from
  // DEFAULT_TOKENS.
  //
  // The decimals here only ever describe a zero, since any real holding
  // carries its own `tokenAmount.decimals` read straight off the account
  // above. 9 is the Solana convention and the guess for DHB; being wrong
  // about it cannot mis-scale a balance, only label an empty row.
  for (const [mint, meta] of Object.entries(named)) {
    if (tokens.some(t => t.address === mint)) continue;
    tokens.push({
      address: mint,
      symbol: meta.symbol,
      name: meta.name,
      decimals: meta.symbol === 'DHB' ? 9 : 6,
      balance: BigInt(0),
      formattedBalance: '0',
      chainId: chainId as WalletToken['chainId'],
    });
  }

  return tokens;
}
