/**
 * The signed-in account's delegation slots, and the two mutations on them.
 *
 * Kept apart from `use-badge-balance` / `use-self-badge-balance`, which answer
 * "what badge does this account render" for every card on a feed and are
 * therefore tuned to be nearly free. This one is a settings-panel query: it
 * runs when someone opens the panel, and not otherwise.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchMyDelegations,
  grantDelegation,
  revokeDelegation,
  setDelegationAcceptance,
  type BadgeDelegationSummary,
} from '@/lib/api/dehub/badges';
import { useAuth } from '@/contexts/AuthContext';
import { t } from 'i18next';

export const BADGE_DELEGATIONS_KEY = ['badge-delegations'] as const;

export function useBadgeDelegations() {
  const { isAuthenticated } = useAuth();

  return useQuery<BadgeDelegationSummary>({
    queryKey: BADGE_DELEGATIONS_KEY,
    queryFn: fetchMyDelegations,
    enabled: isAuthenticated,
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * Grant and revoke, both invalidating the summary and the badge caches.
 *
 * The badge invalidation matters as much as the summary one: a delegation
 * changes what renders next to a name, and the grantee's badge is cached under
 * `['badge-balance', id]` all over the app. Without this the person you just
 * lent a badge to keeps drawing their old one until that cache expires.
 */
export function useGrantDelegation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (to: string) => grantDelegation(to),
    onSuccess: (result, to) => {
      toast.success(t('settings.badgeDelegationGranted', { to, tier: result.tier }));
      queryClient.invalidateQueries({ queryKey: BADGE_DELEGATIONS_KEY });
      queryClient.invalidateQueries({ queryKey: ['badge-balance'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Accept lent badges, or stop accepting them.
 *
 * Invalidates the badge caches as well as the summary: switching it off ends
 * the loan being worn, so the account's own badge has to be redrawn wherever
 * the lent one was showing.
 */
export function useSetDelegationAcceptance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accepts: boolean) => setDelegationAcceptance(accepts),
    onSuccess: (result) => {
      toast.success(
        result.accepts
          ? t('settings.badgeDelegationAcceptOn')
          : result.endedWith
            ? t('settings.badgeDelegationAcceptOffEnded')
            : t('settings.badgeDelegationAcceptOff'),
      );
      queryClient.invalidateQueries({ queryKey: BADGE_DELEGATIONS_KEY });
      queryClient.invalidateQueries({ queryKey: ['badge-balance'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || t('settings.badgeDelegationAcceptFailed'));
    },
  });
}

export function useRevokeDelegation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (counterparty: string) => revokeDelegation(counterparty),
    onSuccess: () => {
      toast.success(t('settings.badgeDelegationEnded'));
      queryClient.invalidateQueries({ queryKey: BADGE_DELEGATIONS_KEY });
      queryClient.invalidateQueries({ queryKey: ['badge-balance'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
