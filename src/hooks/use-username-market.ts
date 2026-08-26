/**
 * Username marketplace hooks
 * ==========================
 * Browse, list and buy handles, all denominated in DHB.
 *
 * The buy path is the part with rules, and both of them exist because the
 * money moves before the handle does:
 *
 * - **Nothing is priced here.** The server quotes the asking price and names
 *   the seller; the wallet sends exactly that, to exactly them. The USD figure
 *   beside it is decoration.
 * - **The buyer never picks a network.** The payment goes out on whatever chain
 *   the wallet is already on, provided the server takes DHB there; anywhere
 *   else falls back to Base. A picker only asked a question the wallet had
 *   already answered, and choosing the other entry meant a chain switch in the
 *   middle of a purchase.
 * - **The claim is retried, never abandoned.** Once the transfer is broadcast
 *   the buyer has paid, so a lost response or a receipt the node has not caught
 *   up with cannot be allowed to end the flow — the server makes the call
 *   idempotent precisely so this loop is safe.
 *
 * A completed purchase changes the signed-in user's own handle, so it has to
 * pull `refreshUser` and drop every profile-shaped cache with it. Skipping that
 * leaves the header, the sidebar and every rendered @mention of yourself
 * showing a name you no longer own.
 */

import { useCallback, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { isSmartWalletSession } from '@/lib/connection-source';
import { createLogger } from '@/lib/logger';
import type { ChainId } from '@/components/app/ChainSelector';
import {
  browseUsernames,
  cancelUsernameListing,
  claimUsername,
  createUsernameListing,
  getMyUsernameMarket,
  getUsernameMarketConfig,
  quoteUsername,
  updateUsernameListing,
  type BrowseUsernamesResult,
  type UsernameQuote,
} from '@/lib/api/dehub/username-market';

const logger = createLogger('UsernameMarket');

/** How long the claim loop keeps asking before it gives the buyer the hash. */
const CLAIM_ATTEMPTS = 12;
const CLAIM_INTERVAL_MS = 3000;

/** Base comes first everywhere here — it is the default network and the fallback. */
const BASE_CHAIN_ID = 8453 as ChainId;

/**
 * The chain a purchase actually goes out on.
 *
 * Preference order is the wallet's own chain, then Base, then anything else the
 * server quoted. So somebody already on BNB pays on BNB and is never asked to
 * switch, and somebody sitting on a chain DHB is not quoted on (Ethereum,
 * Robinhood) lands on Base instead of on a dead button.
 */
export function resolvePayChain(
  walletChainId: number | undefined,
  chains: { chainId: number }[] | undefined,
): ChainId {
  const payable = (chains || []).map(c => c.chainId);
  if (walletChainId && payable.includes(walletChainId)) return walletChainId as ChainId;
  if (payable.includes(BASE_CHAIN_ID)) return BASE_CHAIN_ID;
  return (payable[0] ?? BASE_CHAIN_ID) as ChainId;
}

/**
 * The chain the signed-in wallet is actually sitting on.
 *
 * The built-in wallet has no chain of its own to read — it signs as a Safe that
 * the AA layer configures per call, and wagmi is not connected for it at all —
 * so those sessions count as Base.
 */
export function useWalletChainId(): number | undefined {
  const { chainId } = useAccount();
  return isSmartWalletSession() ? BASE_CHAIN_ID : chainId;
}

export type UsernameSort = 'newest' | 'price_asc' | 'price_desc' | 'shortest';

export interface BrowseParams {
  search?: string;
  sort?: UsernameSort;
  minPriceDhb?: number;
  maxPriceDhb?: number;
}

/** Price floor, DHB contracts and the peg — read once and cached for the day. */
export function useUsernameMarketConfig() {
  return useQuery({
    queryKey: ['username-market-config'],
    queryFn: getUsernameMarketConfig,
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useBrowseUsernames(params: BrowseParams) {
  return useQuery<BrowseUsernamesResult>({
    queryKey: ['username-market-browse', params.search || '', params.sort || 'newest', params.minPriceDhb ?? null, params.maxPriceDhb ?? null],
    queryFn: () => browseUsernames({ ...params, limit: 48 }),
    // Typing in the search box keeps the current grid on screen rather than
    // flashing an empty state between every keystroke.
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

export function useMyUsernameMarket() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['username-market-mine'],
    queryFn: getMyUsernameMarket,
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
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
    mutationFn: ({ listingId, ...input }: { listingId: string; priceDhb?: number; replacementUsername?: string; description?: string }) =>
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
  const walletChainId = useWalletChainId();
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
      const chainId = resolvePayChain(walletChainId, quote.chains);
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
      // transfer with no handle behind it, so the loop runs to the end and
      // then hands them the hash rather than swallowing it.
      setStage('confirming');
      let lastError = 'Could not confirm the payment';
      for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
        try {
          const result = await claimUsername({
            listingId: quote.listingId,
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

      toast.success(`You are now @${result.username}`);

      // The signed-in user's own handle just changed. Everything that renders
      // it off a cache has to be told, or the header and sidebar keep showing
      // a name this account no longer owns.
      await refreshUser().catch(() => {});
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

  return { getQuote, buy, stage, reset, walletChainId };
}
