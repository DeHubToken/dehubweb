import { useQuery } from '@tanstack/react-query';
import { getAuthToken } from '@/lib/api/dehub';

const DEHUB_API_BASE = 'https://api.dehub.io';

/** Per-tab totals for a profile, from the same filter each tab lists with. */
export interface ProfileContentCounts {
  home?: number;
  posts?: number;
  images?: number;
  videos?: number;
  songs?: number;
  live?: number;
  subscribers?: number;
  pinned?: number;
  playlists?: number;
}

/**
 * The profile tab badges. The app reads the same endpoint, so both clients
 * print the same numbers. Sent with the viewer's token because an owner's
 * own hidden posts are listed on their profile and so are counted too.
 */
export function useProfileContentCounts(address?: string | null) {
  return useQuery({
    queryKey: ['profile-content-counts', address?.toLowerCase()],
    queryFn: async (): Promise<ProfileContentCounts> => {
      const token = getAuthToken();
      const response = await fetch(
        `${DEHUB_API_BASE}/api/profile_counts/${encodeURIComponent(String(address))}`,
        { headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } },
      );
      if (!response.ok) throw new Error(`Profile counts API error: ${response.status}`);
      const json = await response.json();
      return (json?.result || {}) as ProfileContentCounts;
    },
    enabled: !!address,
    staleTime: 60 * 1000,
    retry: 1,
  });
}
