/**
 * Username marketplace hooks
 * ==========================
 * Browse dollar-priced handles and pay the current token equivalent.
 *
 * The buy path is the part with rules, and both of them exist because the
 * money moves before the handle does:
 *
 * - **Nothing is priced here.** The server quotes the asking price and names
 *   the seller; the wallet sends exactly that, to exactly them. The dollar asking price is fixed.
 * - **The buyer never picks a network.** `pickPayChain` reads their DHB balance
 *   on each chain the server quoted and spends the first that covers the price,
 *   Base first. A picker asked a question only the wallet could answer, and
 *   getting it wrong meant a signature that reverts for funds sitting one chain
 *   over.
 * - **The claim is retried, never abandoned.** Once the transfer is broadcast
 *   the buyer has paid, so a lost response or a receipt the node has not caught
 *   up with cannot be allowed to end the flow — the server makes the call
 *   idempotent precisely so this loop is safe.
 *
 * A completed purchase puts the name in the buyer's vault and leaves them
 * wearing the handle they had — unless they had none, in which case it becomes
 * their handle. It still pulls `refreshUser` and drops the profile-shaped
 * caches, because for that one case the header would otherwise go stale.
 */

import { useCallback, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import i18n from 'i18next';
import { useAuth } from '@/contexts/AuthContext';
import { createLogger } from '@/lib/logger';
import {
  activateUsernameHolding,
  browseUsernames,
  cancelUsernameListing,
  claimUsername,
  createUsernameListing,
  getMyUsernameMarket,
  getUsernameHoldings,
  getUsernameMarketConfig,
  quoteUsername,
  releaseUsernameHolding,
  updateUsernameListing,
  type BrowseUsernamesResult,
  type UsernameQuote,
} from '@/lib/api/dehub/username-market';

const logger = createLogger('UsernameMarket');

/** How long the claim loop keeps asking before it gives the buyer the hash. */
const CLAIM_ATTEMPTS = 12;
const CLAIM_INTERVAL_MS = 3000;

export type UsernameSort = 'newest' | 'price_asc' | 'price_desc' | 'shortest';

export interface BrowseParams {
  search?: string;
  sort?: UsernameSort;
  minPriceUsd?: number;
  maxPriceUsd?: number;
}

/** Price limits, token contracts and the current rate, refreshed every 30 seconds. */
export function useUsernameMarketConfig() {
  return useQuery({
    queryKey: ['username-market-config'],
    queryFn: getUsernameMarketConfig,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useBrowseUsernames(params: BrowseParams) {
  return useQuery<BrowseUsernamesResult>({
    queryKey: ['username-market-browse', params.search || '', params.sort || 'newest', params.minPriceUsd ?? null, params.maxPriceUsd ?? null],
    queryFn: () => browseUsernames({ ...params, limit: 48 }),
    // Typing in the search box keeps the current grid on screen rather than
    // flashing an empty state between every keystroke.
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
}

export function useMyUsernameMarket() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['username-market-mine'],
    queryFn: getMyUsernameMarket,
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
}

/**
 * Every username this account owns — the one it wears plus the vault.
 *
 * Separate from `useMyUsernameMarket` even though that carries `held` too: the
 * Assets screen wants only this, and pulling a seller's whole trade history to
 * render a list of names would be a waste on a tab most people open to check one
 * thing.
 */
export function useUsernameHoldings() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['username-holdings'],
    queryFn: getUsernameHoldings,
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
  });
}

/**
 * Everything that renders the signed-in user's own handle, dropped at once.
 *
 * The header, the sidebar and every @mention of yourself come off these caches,
 * so anything that changes which name this account wears has to clear them or
 * the app keeps showing a name the profile no longer answers on. Shared by the
 * buy path and the switch path because both do exactly that.
 */
function invalidateOwnUsername(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['username-holdings'] });
  qc.invalidateQueries({ queryKey: ['username-market-browse'] });
  qc.invalidateQueries({ queryKey: ['username-market-mine'] });
  qc.invalidateQueries({ queryKey: ['user'] });
  qc.invalidateQueries({ queryKey: ['profile'] });
  qc.invalidateQueries({ queryKey: ['account-info'] });
}

/** Wear one of the names you own. Free, and reversible by switching back. */
export function useActivateUsernameHolding() {
  const qc = useQueryClient();
  const { refreshUser } = useAuth();
  return useMutation({
    mutationFn: activateUsernameHolding,
    onSuccess: async result => {
      toast.success(i18n.t('usernames.youAreNow', { handle: result.username }));
      // The released case is worth saying out loud: it is the one irreversible
      // thing about an otherwise reversible action, and it only happens to the
      // free signup handle.
      if (result.releasedUsername) {
        toast.info(`@${result.releasedUsername} was not a username you bought, so it is free again.`, {
          duration: 10000,
        });
      }
      await refreshUser().catch(() => {});
      invalidateOwnUsername(qc);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/** Give a held name back to the pool. There is no undo, so ask first. */
export function useReleaseUsernameHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: releaseUsernameHolding,
    onSuccess: (_result, username) => {
      toast.success(`@${username} released`);
      qc.invalidateQueries({ queryKey: ['username-holdings'] });
      qc.invalidateQueries({ queryKey: ['username-market-mine'] });
      qc.invalidateQueries({ queryKey: ['username-market-browse'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCreateUsernameListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createUsernameListing,
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: ['username-market-mine'] });
      qc.invalidateQueries({ queryKey: ['username-market-browse'] });
      toast.success(`@${result.username} is on the market`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateUsernameListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listingId, ...input }: { listingId: string; priceUsd?: number; replacementUsername?: string; description?: string }) =>
      updateUsernameListing(listingId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['username-market-mine'] });
      qc.invalidateQueries({ queryKey: ['username-market-browse'] });
      toast.success('Listing updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCancelUsernameListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cancelUsernameListing,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['username-market-mine'] });
      qc.invalidateQueries({ queryKey: ['username-market-browse'] });
      toast.success('Listing withdrawn');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export type BuyStage = 'idle' | 'quoting' | 'paying' | 'confirming' | 'done';

/**
 * quote → pay → claim, for one listing.
 *
 * Exposed as a stage rather than a boolean because the three steps fail in
 * very different ways and the buyer needs to know which one they are in:
 * a failure while quoting has cost them nothing, and a failure while
 * confirming has already cost them the handle's price.
 */
export function useBuyUsername() {
  const qc = useQueryClient();
  const { refreshUser } = useAuth();
  const [stage, setStage] = useState<BuyStage>('idle');

  const getQuote = useMutation<UsernameQuote, Error, string>({
    mutationFn: async listingId => {
      setStage('quoting');
      try {
        return await quoteUsername(listingId);
      } finally {
        setStage('idle');
      }
    },
  });

  const buy = useMutation({
    mutationFn: async (quote: UsernameQuote) => {
      if (!quote.quoteId || Date.parse(quote.expiresAt) < Date.now() + 30_000) {
        throw new Error('Refresh the checkout price before paying.');
      }
      // Imported at call time: this hook is reachable from a cached page, and
      // scripts/check-entry-bundle.mjs fails the build if wagmi lands in the
      // entry chunk.
      const { sendERC20Token } = await import('@/lib/wallet/send');
      const { pickPayChain } = await import('@/lib/wallet/pay-chain');
      const { getWalletAddress } = await import('@/lib/contracts/aa-utils');
      const { toWei } = await import('@/lib/contracts/dhb-token');

      // Re-read here rather than trusting the drawer's caption: it may have
      // been open for minutes, and the balance behind it is not ours.
      const payer = await getWalletAddress();
      const { chainId } = await pickPayChain(
        payer,
        toWei(quote.priceDhb),
        quote.chains.map(c => c.chainId),
      );
      const chain = quote.chains.find(c => c.chainId === chainId);
      if (!chain?.tokenAddress) throw new Error(i18n.t('tokenErrors.unsupportedNetwork'));

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
      // transfer with no handle behind it, so the loop runs to the end and
      // then hands them the hash rather than swallowing it.
      setStage('confirming');
      let lastError = 'Could not confirm the payment';
      for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
        try {
          const result = await claimUsername({
            listingId: quote.listingId,
            quoteId: quote.quoteId,
            txHash: sent.hash,
            chainId,
          });
          if (!result.pending) return result;
          lastError = 'The payment is still confirming on-chain';
        } catch (err: any) {
          // A refusal from the server is final — underpaid, wrong chain, sold
          // to somebody else. Only a missing receipt is worth waiting on.
          logger.warn('claim attempt failed', err?.message);
          throw new Error(`${err?.message || lastError} (transaction ${sent.hash})`);
        }
        await new Promise(resolve => setTimeout(resolve, CLAIM_INTERVAL_MS));
      }

      throw new Error(
        `${lastError}. Your payment went through — reopen this listing in a minute to finish claiming it (transaction ${sent.hash}).`,
      );
    },
    onSuccess: async result => {
      setStage('done');
      if (result.pending) return;

      // A buyer who already had a handle keeps it; the new one is in the vault.
      const wearing = ('activeUsername' in result && result.activeUsername) || result.username;
      toast.success(
        wearing === result.username
          ? i18n.t('usernames.youAreNow', { handle: result.username })
          : i18n.t('usernames.boughtToVaultToast', { handle: result.username }),
      );

      // The handle may have changed (a buyer who had none), and the vault and
      // the offer that was just paid for certainly did. A stale offers list is
      // what left "Pay and claim" on screen after paying.
      await refreshUser().catch(() => {});
      qc.invalidateQueries({ queryKey: ['username-holdings'] });
      qc.invalidateQueries({ queryKey: ['username-offers-mine'] });
      qc.invalidateQueries({ queryKey: ['username-market-browse'] });
      qc.invalidateQueries({ queryKey: ['username-market-mine'] });
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
