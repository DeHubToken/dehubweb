/**
 * Account marketplace hooks
 * =========================
 * Browse, list and buy whole accounts, all denominated in DHB.
 *
 * The buy path is the part with rules, and all of them exist because the
 * money moves before the account does:
 *
 * - **Nothing is priced here.** The server quotes the asking price and names
 *   the seller; the wallet sends exactly that, to exactly them. The USD figure
 *   beside it is decoration.
 * - **Delivery goes to a named wallet, validated first.** The account lands on
 *   a vacant wallet the buyer chooses, and `check_receive` vets that address
 *   BEFORE any DHB leaves — paying first and asking questions later is the one
 *   order of operations this screen must never allow.
 * - **The claim is retried, never abandoned — including through a 409.** Once
 *   the transfer is broadcast the buyer has paid. `pending: true` means the
 *   receipt is still catching up; a 409 means the payment landed but the
 *   account transfer was interrupted, and retrying the claim RESUMES it
 *   server-side. Both keep the loop going. Only any other refusal is final.
 */

import { useCallback, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { createLogger } from '@/lib/logger';
import type { ChainId } from '@/components/app/ChainSelector';
import {
  browseAccounts,
  cancelAccountListing,
  checkReceiveAddress,
  claimAccount,
  createAccountListing,
  getAccountMarketConfig,
  getMyAccountMarket,
  quoteAccount,
  updateAccountListing,
  type AccountClaimResult,
  type AccountQuote,
  type BrowseAccountsResult,
} from '@/lib/api/dehub/account-market';

const logger = createLogger('AccountMarket');

/** How long the claim loop keeps asking before it gives the buyer the hash. */
const CLAIM_ATTEMPTS = 12;
const CLAIM_INTERVAL_MS = 3000;
/** Extra attempts granted when the server says "interrupted, retry to resume". */
const CLAIM_RESUME_ATTEMPTS = 5;

export type AccountSort = 'newest' | 'price_asc' | 'price_desc' | 'followers' | 'uploads';

export interface BrowseAccountsParams {
  search?: string;
  sort?: AccountSort;
  minPriceDhb?: number;
  maxPriceDhb?: number;
}

/** Price floor, DHB contracts and the peg — read once and cached for the day. */
export function useAccountMarketConfig() {
  return useQuery({
    queryKey: ['account-market-config'],
    queryFn: getAccountMarketConfig,
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useBrowseAccounts(params: BrowseAccountsParams) {
  return useQuery<BrowseAccountsResult>({
    queryKey: ['account-market-browse', params.search || '', params.sort || 'newest', params.minPriceDhb ?? null, params.maxPriceDhb ?? null],
    queryFn: () => browseAccounts({ ...params, limit: 48 }),
    // Typing in the search box keeps the current list on screen rather than
    // flashing an empty state between every keystroke.
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

export function useMyAccountMarket() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['account-market-mine'],
    queryFn: getMyAccountMarket,
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
  });
}

export function useCreateAccountListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createAccountListing,
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: ['account-market-mine'] });
      qc.invalidateQueries({ queryKey: ['account-market-browse'] });
      toast.success(`@${result.username} is on the market`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateAccountListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listingId, ...input }: { listingId: string; priceDhb?: number; description?: string }) =>
      updateAccountListing(listingId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['account-market-mine'] });
      qc.invalidateQueries({ queryKey: ['account-market-browse'] });
      toast.success('Listing updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCancelAccountListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cancelAccountListing,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['account-market-mine'] });
      qc.invalidateQueries({ queryKey: ['account-market-browse'] });
      toast.success('Listing withdrawn');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/** Debounce-friendly validation of a delivery wallet. */
export function useCheckReceiveAddress() {
  return useMutation({ mutationFn: checkReceiveAddress });
}

/**
 * The shared claim loop. `pending: true` and a 409 both mean "ask again";
 * anything else thrown is final. Returns the completed claim or throws with
 * the transaction hash in the message so the buyer never loses it.
 */
async function runClaimLoop(input: {
  listingId: string;
  txHash: string;
  chainId: number;
  receiveAddress?: string;
}): Promise<Extract<AccountClaimResult, { pending: false }>> {
  let lastError = 'Could not confirm the payment';
  let resumeBudget = CLAIM_RESUME_ATTEMPTS;

  for (let attempt = 0; attempt < CLAIM_ATTEMPTS + CLAIM_RESUME_ATTEMPTS; attempt++) {
    try {
      const result: AccountClaimResult = await claimAccount(input);
      if (result.pending === false) return result;
      lastError = 'The payment is still confirming on-chain';
    } catch (err: any) {
      // 409: the payment landed but the account transfer was interrupted.
      // Retrying the claim resumes the transfer server-side, so this is a
      // reason to continue, not to stop.
      if (err?.httpStatus === 409 && resumeBudget > 0) {
        resumeBudget--;
        lastError = 'The transfer was interrupted and is being resumed';
        logger.warn('claim hit 409, retrying to resume', err?.message);
      } else {
        // Any other refusal is final — underpaid, wrong chain, sold to
        // somebody else, or a 409 that would not clear.
        logger.warn('claim attempt failed', err?.message);
        throw new Error(`${err?.message || lastError} (transaction ${input.txHash})`);
      }
    }
    await new Promise(resolve => setTimeout(resolve, CLAIM_INTERVAL_MS));
  }

  throw new Error(
    `${lastError}. Your payment went through — reopen this listing in a minute to finish claiming it (transaction ${input.txHash}).`,
  );
}

export type BuyAccountStage = 'idle' | 'quoting' | 'paying' | 'confirming' | 'done';

/**
 * quote → pay → claim, for one listing.
 *
 * Exposed as a stage rather than a boolean because the three steps fail in
 * very different ways and the buyer needs to know which one they are in:
 * a failure while quoting has cost them nothing, and a failure while
 * confirming has already cost them the account's price.
 */
export function useBuyAccount() {
  const qc = useQueryClient();
  const { refreshUser } = useAuth();
  const [stage, setStage] = useState<BuyAccountStage>('idle');

  const getQuote = useMutation<AccountQuote, Error, string>({
    mutationFn: async listingId => {
      setStage('quoting');
      try {
        return await quoteAccount(listingId);
      } finally {
        setStage('idle');
      }
    },
  });

  const buy = useMutation({
    mutationFn: async ({
      quote,
      chainId,
      receiveAddress,
    }: {
      quote: AccountQuote;
      chainId: ChainId;
      /** Omitted only when the paying wallet is itself vacant (`selfReceivable`). */
      receiveAddress?: string;
    }) => {
      const chain = quote.chains.find(c => c.chainId === chainId);
      if (!chain?.tokenAddress) throw new Error('DHB cannot be sent on that network.');

      // Imported at call time: this hook is reachable from a cached page, and
      // scripts/check-entry-bundle.mjs fails the build if wagmi lands in the
      // entry chunk.
      const { sendERC20Token } = await import('@/lib/wallet/send');

      setStage('paying');
      const sent = await sendERC20Token(
        chain.tokenAddress,
        quote.sellerAddress,
        String(quote.priceDhb),
        18,
        chainId,
      );
      if (!sent?.hash) throw new Error('The payment was not submitted.');

      // Past this line the buyer has paid. Giving up would strand a real
      // transfer with no account behind it, so the loop runs to the end and
      // then hands them the hash rather than swallowing it.
      setStage('confirming');
      return runClaimLoop({
        listingId: quote.listingId,
        txHash: sent.hash,
        chainId,
        receiveAddress,
      });
    },
    onSuccess: async result => {
      setStage('done');
      toast.success(`@${result.username} is yours — delivered to ${shortAddress(result.receiveAddress)}`);

      // If delivery went to the wallet that is signed in here, this session's
      // identity just changed wholesale — refresh it and drop every
      // profile-shaped cache with it. Harmless when delivery went elsewhere.
      await refreshUser().catch(() => {});
      qc.invalidateQueries({ queryKey: ['account-market-browse'] });
      qc.invalidateQueries({ queryKey: ['account-market-mine'] });
      qc.invalidateQueries({ queryKey: ['user'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['account-info'] });
    },
    onError: (err: Error) => {
      setStage('idle');
      toast.error(err.message, { duration: 12000 });
    },
  });

  const reset = useCallback(() => setStage('idle'), []);

  return { getQuote, buy, stage, reset };
}

/**
 * Re-run the claim for a purchase whose transfer failed after payment. The
 * sale row in `mine.bought` carries everything the server needs — the stored
 * txHash, chain and receive address — so this is the "Resume transfer" button.
 */
export function useResumeAccountClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { listingId: string; txHash: string; chainId: number; receiveAddress?: string }) =>
      runClaimLoop(input),
    onSuccess: result => {
      toast.success(`@${result.username} delivered to ${shortAddress(result.receiveAddress)}`);
      qc.invalidateQueries({ queryKey: ['account-market-mine'] });
      qc.invalidateQueries({ queryKey: ['account-market-browse'] });
    },
    onError: (err: Error) => toast.error(err.message, { duration: 12000 }),
  });
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
