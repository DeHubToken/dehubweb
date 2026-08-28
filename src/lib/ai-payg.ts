/**
 * Pay-as-you-go generation.
 * =========================
 * Two ways to pay for a generation, and this is the second one:
 *
 *   1. Credit — bought in bulk or granted by a plan, spent from a balance.
 *   2. Pay-as-you-go — no balance, so pay for this one job in DHB.
 *
 * Rather than a second money path, pay-as-you-go is a just-in-time top-up of
 * exactly the shortfall. The user signs one transfer, it is credited, and the
 * generation immediately debits it — so a creator with no credit still signs
 * once per job, as before, but the payment is now actually verified on chain
 * instead of being taken on trust by a function that never checked.
 *
 * Everything downstream stays single-path: one ledger, one idempotency rule,
 * and a failed generation refunds into the balance rather than vanishing.
 */

import { Interface } from 'ethers';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthToken } from '@/lib/api/dehub';
import { writeContractAA, getERC20Balance, getWalletAddress, switchChain, parseTxError } from '@/lib/contracts/aa-utils';
import { toWei, getChainConfig, BASE_CHAIN_ID, BNB_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { dehubAuthHeaders, readFunctionError } from '@/lib/ai-invoke';
import type { ChainId } from '@/components/app/ChainSelector';

const erc20TransferInterface = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

const AI_TREASURY = '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c';

/**
 * Alchemy indexes a transfer a beat after it is mined, so the first claim can
 * legitimately 404. Retry briefly before giving up — the alternative is
 * telling someone who has already paid that nothing happened.
 */
const CLAIM_ATTEMPTS = 6;
const CLAIM_DELAY_MS = 2500;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** How long to let the wallet get onto the paying chain before giving up. */
const CHAIN_SWITCH_TIMEOUT_MS = 45_000;

/**
 * Reject with a useful message instead of hanging forever.
 *
 * Only safe around steps that have not signed anything — a timeout applied to a
 * submitted transaction would report a failure over money that is still in
 * flight.
 */
async function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Transfers that reached the treasury but were never credited.
 *
 * A claim can fail after the money has already moved — an indexer that stays
 * behind longer than CLAIM_ATTEMPTS covers, a 5xx, a closed laptop. Before this
 * existed the hash was thrown away with the error, and since the ledger is keyed
 * on txHash that lost the only handle on a payment the user had already made.
 * Parking it here makes the loss recoverable: the next payment flushes it first,
 * and `topup` is idempotent, so a stale entry can only ever credit once.
 */
const UNCLAIMED_KEY = 'dehub.ai.unclaimedTopups';

function readUnclaimed(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(UNCLAIMED_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((h): h is string => typeof h === 'string') : [];
  } catch {
    return [];
  }
}

function writeUnclaimed(hashes: string[]): void {
  try {
    if (hashes.length) localStorage.setItem(UNCLAIMED_KEY, JSON.stringify(hashes));
    else localStorage.removeItem(UNCLAIMED_KEY);
  } catch {
    // Private mode or a full quota. Losing the record is bad but it must not
    // take the payment down with it.
  }
}

/** Newest entries win: an unbounded list would retry forever and grow forever. */
const MAX_UNCLAIMED = 20;

function rememberUnclaimed(txHash: string): void {
  const hashes = readUnclaimed();
  if (hashes.includes(txHash)) return;
  writeUnclaimed([...hashes, txHash].slice(-MAX_UNCLAIMED));
}

function forgetUnclaimed(txHash: string): void {
  writeUnclaimed(readUnclaimed().filter((h) => h !== txHash));
}

/**
 * Retry every parked transfer. Runs before a new payment so someone who is
 * already owed credit spends that first instead of paying twice.
 */
export async function flushUnclaimedTopUps(): Promise<void> {
  // One shot per entry. The indexer-lag retries exist for a transfer that was
  // mined seconds ago; a parked hash is minutes or days old, so re-running them
  // here would only add 15s of dead waiting in front of every later payment.
  for (const txHash of readUnclaimed()) {
    try {
      await claimTopUp(txHash, 1);
      forgetUnclaimed(txHash);
    } catch {
      // Still not claimable. Keep it parked and try again next time.
    }
  }
}

async function claimTopUp(txHash: string, attempts = CLAIM_ATTEMPTS): Promise<number> {
  let lastError = 'Could not credit the transfer.';

  for (let attempt = 0; attempt < attempts; attempt++) {
    const { data, error } = await supabase.functions.invoke('ai-credits', {
      body: { action: 'topup', txHash },
      headers: dehubAuthHeaders(),
    });

    const balance = (data as { balanceDhb?: number })?.balanceDhb;
    if (!error && typeof balance === 'number') {
      forgetUnclaimed(txHash);
      return balance;
    }

    // On a non-2xx the body — and with it the actual reason — lives on the
    // error, not on `data`. Reading `data.error` alone yielded "Edge Function
    // returned a non-2xx status code" for every failure alike.
    const message = error ? await readFunctionError(error, data) : ((data as { error?: string })?.error || '');

    // Already credited is a success from the caller's point of view: the money
    // is on the balance, this is just a duplicate claim.
    if (message.includes('already credited')) {
      forgetUnclaimed(txHash);
      return NaN;
    }

    lastError = message || lastError;

    // Anything other than "not indexed yet" is terminal — retrying a rejected
    // claim just delays the error.
    if (!message.includes('not found on-chain')) break;

    await wait(CLAIM_DELAY_MS);
  }

  // The transfer is on chain and unspent. Park it so it is not lost, and say so
  // — "payment failed" would be a lie about money that has already moved.
  rememberUnclaimed(txHash);
  throw new Error(
    `${lastError} Your DHB has been sent and is safe — it will be credited automatically on your next generation. (tx ${txHash.slice(0, 10)}…)`,
  );
}

/**
 * Spendable DHB across the two chains the treasury accepts.
 *
 * Deliberately not useAllChainsTokens(): that fans out over three chains and
 * every token to build a wallet view. This has to agree exactly with what
 * payAsYouGo checks before signing, or the paywall offers a payment that then
 * fails — so it runs the same two getERC20Balance calls against the same
 * addresses.
 */
export function useSpendableDhb() {
  const { walletAddress, isAuthenticated } = useAuth();

  const query = useQuery({
    queryKey: ['spendable-dhb', walletAddress?.toLowerCase()],
    queryFn: async () => {
      const baseConfig = getChainConfig(BASE_CHAIN_ID);
      const bnbConfig = getChainConfig(BNB_CHAIN_ID);
      const [base, bnb] = await Promise.all([
        getERC20Balance(baseConfig.dhbToken, walletAddress!, BASE_CHAIN_ID).catch(() => BigInt(0)),
        getERC20Balance(bnbConfig.dhbToken, walletAddress!, BNB_CHAIN_ID).catch(() => BigInt(0)),
      ]);
      // The treasury is paid from one chain, not both, so what is actually
      // spendable on a single job is the larger balance — never the sum.
      return Math.max(Number(base), Number(bnb)) / 1e18;
    },
    enabled: !!walletAddress && isAuthenticated,
    staleTime: 60_000,
  });

  return {
    walletDhb: query.data ?? 0,
    isLoading: query.isLoading,
    refresh: query.refetch,
  };
}

export interface PaygResult {
  /** Balance after the top-up, or NaN when the claim was a duplicate. */
  balanceDhb: number;
  txHash: string;
  chain: 'Base' | 'BNB';
}

/**
 * Pay `amountDhb` on chain and have it credited.
 *
 * Pass the shortfall, not the full job price — an existing part-balance is
 * spent first, so someone holding 100 DHB of credit on a 300 DHB job signs for
 * 200, not 300.
 */
export async function payAsYouGo(amountDhb: number): Promise<PaygResult> {
  if (!getAuthToken()) throw new Error('Sign in to pay for a generation.');
  if (!Number.isFinite(amountDhb) || amountDhb <= 0) {
    throw new Error('Nothing to pay.');
  }

  // Credit already paid for but never granted is spent before asking for more
  // money. Cheap, idempotent, and it stops a failed claim quietly turning into
  // a second charge for the same generation.
  await flushUnclaimedTopUps();

  // Round up: the treasury must receive at least the shortfall, and a
  // fractional wei short would leave the balance one unit under the price.
  const amount = Math.ceil(amountDhb);
  const amountWei = toWei(amount, 18);
  const signerAddress = await getWalletAddress();

  // Treat a flaky RPC as a zero balance rather than aborting.
  const baseConfig = getChainConfig(BASE_CHAIN_ID);
  const bnbConfig = getChainConfig(BNB_CHAIN_ID);
  const [baseBalance, bnbBalance] = await Promise.all([
    getERC20Balance(baseConfig.dhbToken, signerAddress, BASE_CHAIN_ID).catch(() => BigInt(0)),
    getERC20Balance(bnbConfig.dhbToken, signerAddress, BNB_CHAIN_ID).catch(() => BigInt(0)),
  ]);

  let payChainId: ChainId;
  let chain: 'Base' | 'BNB';
  if (baseBalance >= amountWei) {
    payChainId = BASE_CHAIN_ID;
    chain = 'Base';
  } else if (bnbBalance >= amountWei) {
    payChainId = BNB_CHAIN_ID;
    chain = 'BNB';
  } else {
    const held = Math.max(Number(baseBalance), Number(bnbBalance)) / 1e18;
    throw new Error(
      `Not enough DHB in your wallet. This costs ${amount.toLocaleString()} DHB and you hold ${Math.floor(held).toLocaleString()}.`
    );
  }

  const chainConfig = getChainConfig(payChainId);

  // Bounded because it can hang rather than reject. Switching to a chain the
  // smart account has no provider for yet builds one, and that path gives up
  // silently on a locked wallet or an unfunded paymaster — leaving the paywall
  // spinning forever with its own Cancel button disabled. Nothing has been
  // signed at this point, so a timeout here cannot strand a payment.
  await withTimeout(
    switchChain(payChainId),
    CHAIN_SWITCH_TIMEOUT_MS,
    `Could not switch to ${chain}. Unlock your wallet and try again.`,
  );

  let txHash: string;
  try {
    const result = await writeContractAA(
      chainConfig.dhbToken,
      erc20TransferInterface,
      'transfer',
      [AI_TREASURY, amountWei],
      { context: 'AI generation payment', chainId: payChainId },
    );
    // wait() resolves with status 0 for a REVERTED transaction rather than
    // throwing, so ignoring the receipt would claim a transfer that failed.
    const receipt = await result.wait(1);
    if (receipt?.status !== 1) {
      throw new Error('The DHB transfer did not go through. Nothing has been charged.');
    }
    txHash = receipt.hash ?? result.hash;
  } catch (err) {
    throw new Error(parseTxError(err) || 'Payment failed.');
  }

  const balanceDhb = await claimTopUp(txHash);
  return { balanceDhb, txHash, chain };
}
