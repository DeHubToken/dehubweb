/**
 * Paying for a generation, in live DHB.
 * =====================================
 * There is one way to pay now: sign a DHB transfer to the treasury for what
 * the job costs, and hand the hash to the generation function, which confirms
 * it on chain before it spends anything with a provider.
 *
 * What this replaces was a balance — bought in bulk, granted by a plan, or
 * minted as a free daily allowance — that the job then debited. Two of those
 * three created spendable value with no token behind it, so the balance was
 * a second currency living alongside DHB. Removing it removes the drift.
 *
 * The one piece of state kept here is the hash of a transfer that has been
 * paid but not yet used. That is not a balance: it cannot be topped up, it is
 * bounded by a single transfer, and it exists only so a job that dies between
 * the signature and the provider can be retried without paying twice.
 */

import { Interface } from 'ethers';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthToken } from '@/lib/api/dehub';
import { supabase } from '@/integrations/supabase/client';
import { writeContractAA, getERC20Balance, getWalletAddress, switchChain, parseTxError } from '@/lib/contracts/aa-utils';
import { toWei, getChainConfig, BASE_CHAIN_ID, BNB_CHAIN_ID } from '@/lib/contracts/dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';

const erc20TransferInterface = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

const AI_TREASURY = '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c';

/** How long to let the wallet get onto the paying chain before giving up. */
const CHAIN_SWITCH_TIMEOUT_MS = 45_000;

/**
 * A transfer stays reusable for well under the backend's one-hour claim
 * window, so a hash this offers is always still verifiable.
 */
const REUSE_WINDOW_MS = 45 * 60 * 1000;

const UNSPENT_KEY = 'dehub.ai.unspentPayments';

interface UnspentPayment {
  txHash: string;
  dhb: number;
  paidAt: number;
  /**
   * Who paid. Entries written before this existed have none and are ignored
   * rather than assumed to belong to whoever is signed in now — they expire
   * inside the reuse window anyway, so the cost of dropping them is one
   * re-paid job at worst.
   */
  wallet?: string;
  /**
   * What the job this hash was last handed to is about to draw.
   *
   * The server keeps a balance per transfer — `ai_payments.remaining_dhb`,
   * whose own comment says an overpayment "stays the payer's to spend on the
   * next job rather than being kept". The client did not: any job that
   * succeeded forgot the whole hash. So a failed 100 DHB job that the server
   * refunded, followed by a 10 DHB job that worked, threw away the handle to
   * the other 90, and the next large job paid in full again.
   *
   * Recorded when the hash is handed out, because that is the only moment the
   * price is known here. Absent means the old behaviour — spend the lot — which
   * is the safe direction: it can cost one re-paid job, never a phantom
   * balance the server will refuse.
   */
  pendingDhb?: number;
}

function readUnspent(): UnspentPayment[] {
  try {
    const raw = JSON.parse(localStorage.getItem(UNSPENT_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((p): p is UnspentPayment =>
      !!p && typeof p.txHash === 'string' && typeof p.dhb === 'number' && typeof p.paidAt === 'number');
  } catch {
    return [];
  }
}

/** Newest entries win: an unbounded list would grow forever. */
const MAX_UNSPENT = 10;

function writeUnspent(payments: UnspentPayment[]): void {
  try {
    const fresh = payments.filter((p) => Date.now() - p.paidAt < REUSE_WINDOW_MS).slice(-MAX_UNSPENT);
    if (fresh.length) localStorage.setItem(UNSPENT_KEY, JSON.stringify(fresh));
    else localStorage.removeItem(UNSPENT_KEY);
  } catch {
    // Private mode or a full quota. Losing the record costs a retried payment,
    // and it must not take the payment itself down with it.
  }
}

/**
 * Retire what a job drew from a transfer, and the transfer with it if that was
 * the last of it.
 *
 * Called from invokeAi rather than from a paywall, because the paywall hands
 * over before the job runs and never learns whether the hash was accepted.
 *
 * It used to drop the whole entry on any success, which threw away the rest of
 * an overpayment — see `pendingDhb`. `exhausted` is the server saying the
 * balance is gone regardless, which is the one case where dropping it is right.
 */
export function forgetPayment(txHash: string, exhausted = false): void {
  const wanted = txHash.toLowerCase();
  const kept: UnspentPayment[] = [];
  for (const p of readUnspent()) {
    if (p.txHash !== wanted) {
      kept.push(p);
      continue;
    }
    // The server said there is nothing left on it, whatever we thought.
    if (exhausted || p.pendingDhb === undefined) continue;
    const left = p.dhb - p.pendingDhb;
    // Below the smallest thing anyone can buy, a remainder is not worth
    // offering: it would be found by `reusablePayment`, refused as exhausted,
    // and cost the player a round trip before they paid anyway.
    if (left < MIN_REUSABLE_DHB) continue;
    kept.push({ ...p, dhb: left, pendingDhb: undefined });
  }
  writeUnspent(kept);
}

/**
 * A remainder smaller than this is dropped rather than offered.
 *
 * `reusablePayment` only ever hands back a hash worth at least the price, so a
 * small remainder is never wrongly spent — this just stops a dust entry
 * outliving its usefulness in a list capped at ten.
 */
const MIN_REUSABLE_DHB = 1;

/** Note what the job this hash is being handed to will draw from it. */
function markPending(txHash: string, priceDhb: number): void {
  const wanted = txHash.toLowerCase();
  writeUnspent(
    readUnspent().map((p) => (p.txHash === wanted ? { ...p, pendingDhb: priceDhb } : p)),
  );
}

/**
 * A paid-but-unused transfer big enough for `priceDhb`, if this wallet has one.
 *
 * Keyed on the wallet, not just the hash. localStorage belongs to the browser
 * and the browser can change hands — a profile switch, a second person signing
 * in — and the server refuses a hash that belongs to someone else with a 403
 * rather than the "already spent" the client knows how to recover from. So an
 * abandoned payment by the previous account used to block every generation for
 * the next one, on that browser, until the window expired.
 *
 * Exported so the reuse rule can be checked directly — it is the half of the
 * paywall that needs no wallet, and it used to be asserted against as source
 * text instead.
 */
export function reusablePayment(priceDhb: number, wallet: string): UnspentPayment | null {
  const now = Date.now();
  const holder = wallet.toLowerCase();
  return readUnspent().find((p) =>
    p.wallet === holder && p.dhb >= priceDhb && now - p.paidAt < REUSE_WINDOW_MS) ?? null;
}

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
 * Spendable DHB across the two chains the treasury accepts.
 *
 * Deliberately not useAllChainsTokens(): that fans out over three chains and
 * every token to build a wallet view. This has to agree exactly with what
 * payForJob checks before signing, or the paywall offers a payment that then
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

/**
 * Pay `priceDhb` for the job about to run and return the transfer hash.
 *
 * Pass the hash to the generation function as `txHash`. It is verified on
 * chain there, so nothing here is taken on trust.
 */
export async function payForJob(
  priceDhb: number,
  /**
   * Whether this transfer may be offered to a later job.
   *
   * A voice session is spent down over many exchanges, so its hash must not be
   * handed to an unrelated job that would then find most of it already gone.
   * The voice hook holds that hash itself instead.
   */
  { remember = true }: { remember?: boolean } = {},
): Promise<string> {
  if (!getAuthToken()) throw new Error('Sign in to pay for a generation.');
  if (!Number.isFinite(priceDhb) || priceDhb <= 0) {
    throw new Error('Nothing to pay.');
  }

  // Resolved before the reuse check, because the cache is keyed on it. One
  // extra read on the reuse path, and the same call the transfer below makes.
  const payer = await getWalletAddress();

  // Money already sent for a job that never ran is spent before asking for
  // more. This is what stops a generation that failed after payment from
  // costing a second transfer.
  const reusable = remember ? reusablePayment(priceDhb, payer) : null;
  if (reusable) {
    // What this job will draw, so forgetPayment debits it rather than binning
    // the whole hash and stranding the rest of the transfer server-side.
    markPending(reusable.txHash, priceDhb);
    return reusable.txHash;
  }

  // Nothing locally — but this browser is not the record. The server holds a
  // receipt for every transfer that reached it, with what is left on it, and
  // it survives a closed tab, a cleared cache and a different device. Asking
  // before signing is the difference between a payment that failed once and a
  // user paying twice for one result.
  if (remember) {
    const banked = (await fetchUnspentPayments()).find((p) => p.dhb >= priceDhb);
    if (banked) {
      rememberHash(banked.txHash, banked.dhb, priceDhb, payer, true);
      return banked.txHash;
    }
  }

  // Round up: the treasury must receive at least the price, and a fractional
  // wei short would leave the transfer one unit under it.
  const amount = Math.ceil(priceDhb);
  const amountWei = toWei(amount, 18);
  const signerAddress = payer;

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

  // Submitted, but not yet known to be mined. Kept out here so the catch below
  // can tell "the wallet refused to sign" — nothing sent, nothing owed — from
  // "we lost sight of a transfer that is already on chain".
  let submittedHash = '';
  let txHash = '';
  let reverted = false;

  try {
    const result = await writeContractAA(
      chainConfig.dhbToken,
      erc20TransferInterface,
      'transfer',
      [AI_TREASURY, amountWei],
      { context: 'AI generation payment', chainId: payChainId },
    );
    submittedHash = (result.hash || '').toLowerCase();
    // Written down BEFORE the receipt is awaited. `wait()` rejects on a dropped
    // socket or a provider hiccup as readily as on a real failure, and the
    // transfer is in the mempool either way — recording only after it resolved
    // is how four payments reached the treasury with no record of who sent
    // them. A hash here costs nothing if the transfer never lands: the server
    // refuses to record one it cannot find on chain.
    if (submittedHash) rememberHash(submittedHash, amount, priceDhb, payer, remember);

    // wait() resolves with status 0 for a REVERTED transaction rather than
    // throwing, so ignoring the receipt would send a hash that paid nothing.
    const receipt = await result.wait(1);
    // Flagged rather than thrown: a revert is a settled answer — no DHB moved
    // — and must not fall into the catch below, which exists for the opposite
    // case and would go looking for the transfer on chain.
    reverted = receipt?.status !== 1;
    txHash = ((receipt?.hash ?? result.hash) || '').toLowerCase();
  } catch (err) {
    // The transfer was signed and broadcast; we just could not watch it land.
    // Asking the server settles it against the chain, and if it is real the
    // receipt now exists whatever happens to this tab. Reporting "payment
    // failed" here is what turned a mined transfer into lost money.
    if (submittedHash) {
      const recorded = await recordPayment(submittedHash, remember ? 'job' : 'voice');
      if (recorded) return submittedHash;
      throw new Error(
        'Your DHB transfer was sent but we could not confirm it. It is saved and will pay for your next attempt — do not send it again.',
      );
    }
    throw new Error(parseTxError(err) || 'Payment failed.');
  }

  if (reverted) {
    // No DHB moved, so drop the hash rather than leaving a phantom payment for
    // the next job to offer.
    if (submittedHash) forgetPayment(submittedHash, true);
    throw new Error('The DHB transfer did not go through. Nothing has been charged.');
  }

  // A provider can hand back a different hash than it first reported — a
  // replacement, or a smart-account bundle. Bank the one that actually mined.
  if (txHash && submittedHash && txHash !== submittedHash) {
    forgetPayment(submittedHash, true);
    rememberHash(txHash, amount, priceDhb, payer, remember);
  }
  if (!txHash) txHash = submittedHash;

  // The receipt is the point of no return, so record it here too: from now on
  // the money is the payer's to spend even if this page never reaches the
  // generation function.
  await recordPayment(txHash, remember ? 'job' : 'voice');

  return txHash;
}

/**
 * Keep a hash where the next job can find it.
 *
 * `pendingDhb` is this job's price, not the transfer: the amount is rounded up
 * to a whole DHB, so anything over the price is the payer's for the next one.
 */
function rememberHash(
  txHash: string,
  amount: number,
  priceDhb: number,
  payer: string,
  remember: boolean,
): void {
  if (!remember) return;
  writeUnspent([
    ...readUnspent().filter((p) => p.txHash !== txHash),
    { txHash, dhb: amount, paidAt: Date.now(), wallet: payer.toLowerCase(), pendingDhb: priceDhb },
  ]);
}

/**
 * Tell the server about a mined transfer so a receipt exists independently of
 * this browser.
 *
 * localStorage is not a record. It is one device, one profile, cleared by a
 * private window, and it expires in `REUSE_WINDOW_MS`. The receipt this writes
 * outlives all of that and is what `chargeForJob` draws from, so a job that
 * dies anywhere after payment leaves spendable DHB rather than nothing.
 *
 * Never throws. A payment that is already made must not be reported as failed
 * because the bookkeeping call did not get through — the hash is still in
 * localStorage, and `chargeForJob` records it the old way if it gets there
 * first.
 */
async function recordPayment(txHash: string, purpose: 'job' | 'voice'): Promise<boolean> {
  try {
    const { error } = await callPaymentLedger({ txHash, purpose });
    if (error) {
      console.warn('[ai-payment] could not record payment yet:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[ai-payment] could not record payment yet:', err);
    return false;
  }
}

/**
 * Call the payment ledger function.
 *
 * Deliberately not `invokeAi`: that retires a hash from the local list on a
 * successful call, which is exactly wrong for a call whose whole purpose is to
 * bank one. It also imports from here, and a cycle between the two modules is
 * not worth the shared header helper — which is four lines.
 */
async function callPaymentLedger<T>(body: Record<string, unknown>) {
  const token = getAuthToken();
  const wallet = localStorage.getItem('dehub_wallet');
  const headers: Record<string, string> = {};
  if (token) headers['x-dehub-token'] = token;
  if (wallet) headers['x-wallet-address'] = wallet.toLowerCase();
  return supabase.functions.invoke<T>('ai-payment-record', { body, headers });
}

/**
 * Paid-but-unspent DHB this wallet has on the server, newest first.
 *
 * The local list only knows what this browser did. This is the same question
 * asked of the only place that actually knows the answer, which is what makes
 * a payment survive a closed tab, a cleared cache or a different device.
 */
export async function fetchUnspentPayments(): Promise<UnspentPayment[]> {
  try {
    const { data, error } = await callPaymentLedger<{ payments?: ServerPayment[] }>({ action: 'list' });
    if (error || !data?.payments) return [];
    return data.payments
      .filter((p) => p.purpose !== 'voice' && Number(p.remainingDhb) > 0)
      .map((p) => ({
        txHash: String(p.txHash).toLowerCase(),
        dhb: Number(p.remainingDhb),
        paidAt: Date.parse(p.createdAt) || Date.now(),
      }));
  } catch {
    return [];
  }
}

interface ServerPayment {
  txHash: string;
  chain: string;
  paidDhb: number;
  remainingDhb: number;
  purpose: string;
  createdAt: string;
}

/** DHB per voice exchange: Whisper 60 + Dia 80, at the server's prices. */
export const VOICE_EXCHANGE_DHB = 140;

/** Exchanges one voice session buys. Sized to a real conversation, not a demo. */
export const VOICE_SESSION_EXCHANGES = 20;

/**
 * Pay for a voice session up front.
 *
 * Voice is the one thing that cannot pay per job: it is billed per exchange,
 * and asking for a signature between every sentence is not a conversation.
 * One transfer covers a block of exchanges and the backend counts them down
 * against it, so the whole session runs on a single confirmed payment.
 */
export function payForVoiceSession(exchanges = VOICE_SESSION_EXCHANGES): Promise<string> {
  return payForJob(exchanges * VOICE_EXCHANGE_DHB, { remember: false });
}
