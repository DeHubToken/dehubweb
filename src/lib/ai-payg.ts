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
import { dehubAuthHeaders } from '@/lib/ai-invoke';
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

async function claimTopUp(txHash: string): Promise<number> {
  let lastError = 'Could not credit the transfer.';

  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
    const { data, error } = await supabase.functions.invoke('ai-credits', {
      body: { action: 'topup', txHash },
      headers: dehubAuthHeaders(),
    });

    const balance = (data as { balanceDhb?: number })?.balanceDhb;
    if (!error && typeof balance === 'number') return balance;

    const message = (data as { error?: string })?.error
      || (error instanceof Error ? error.message : '');

    // Already credited is a success from the caller's point of view: the money
    // is on the balance, this is just a duplicate claim.
    if (message.includes('already credited')) return NaN;

    lastError = message || lastError;

    // Anything other than "not indexed yet" is terminal — retrying a rejected
    // claim just delays the error.
    if (!message.includes('not found on-chain')) break;

    await wait(CLAIM_DELAY_MS);
  }

  throw new Error(lastError);
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
  await switchChain(payChainId);

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
