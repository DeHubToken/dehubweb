import { useQuery } from '@tanstack/react-query';
import { fetchSocialReach } from '@/lib/social-reach';

export const socialReachQueryKey = (wallet: string | null | undefined) =>
  ['social-reach', (wallet || '').toLowerCase()] as const;

/** A profile's connected social accounts and their verified follower counts. */
export function useSocialReach(wallet: string | null | undefined) {
  return useQuery({
    queryKey: socialReachQueryKey(wallet),
    queryFn: () => fetchSocialReach(wallet!),
    enabled: !!wallet,
    staleTime: 10 * 60_000,
    retry: false,
  });
}
