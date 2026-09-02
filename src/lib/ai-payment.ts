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
 * Forget a transfer that has been used.
 *
 * Called from invokeAi rather than from a paywall, because the paywall hands
 * over before the job runs and never learns whether the hash was accepted.
 * A job that succeeds spends its whole payment; one refused as exhausted has
 * had it spent already. Either way the hash is finished.
 */
export function forgetPayment(txHash: string): void {
  const wanted = txHash.toLowerCase();
  writeUnspent(readUnspent().filter((p) => p.txHash !== wanted));
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
 */
function reusablePayment(priceDhb: number, wallet: string): UnspentPayment | null {
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
  if (reusable) return reusable.txHash;

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
    // throwing, so ignoring the receipt would send a hash that paid nothing.
    const receipt = await result.wait(1);
    if (receipt?.status !== 1) {
      throw new Error('The DHB transfer did not go through. Nothing has been charged.');
    }
    txHash = (receipt?.hash ?? result.hash).toLowerCase();
  } catch (err) {
    throw new Error(parseTxError(err) || 'Payment failed.');
  }

  if (remember) writeUnspent([...readUnspent(), { txHash, dhb: amount, paidAt: Date.now(), wallet: payer.toLowerCase() }]);
  return txHash;
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
