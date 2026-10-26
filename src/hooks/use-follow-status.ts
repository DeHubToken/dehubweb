import { useQuery, useQueries } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getFollowStatusBatch, type FollowStatus } from '@/lib/api/dehub';

// The roster and search share these checks. Keep them below the API limit.
type Lookup = { address: string; resolve: (state: FollowStatus) => void; reject: (error: unknown) => void };
const waiting = new Map<string, Lookup[]>();
function check(address: string, viewer: string): Promise<FollowStatus> {
  const owner = viewer.toLowerCase();
  return new Promise((resolve, reject) => {
    const queued = waiting.get(owner);
    const entry = { address: address.toLowerCase(), resolve, reject };
    if (queued) { queued.push(entry); return; }
    waiting.set(owner, [entry]);
    setTimeout(async () => {
      const entries = waiting.get(owner)!;
      waiting.delete(owner);
      for (let offset = 0; offset < entries.length; offset += 100) {
        const batch = entries.slice(offset, offset + 100);
        try {
          const states = await getFollowStatusBatch([...new Set(batch.map(item => item.address))], owner);
          for (const item of batch) {
            const state = states[item.address];
            if (state) item.resolve(state); else item.reject(new Error('Missing follow status'));
          }
        } catch (error) { batch.forEach(item => item.reject(error)); }
      }
    }, 0);
  });
}

function options(address: string, viewer?: string | null) {
  return {
    queryKey: ['user-follow-status', viewer?.toLowerCase(), address.toLowerCase()],
    queryFn: () => check(address, viewer!),
    enabled: !!viewer && !!address,
    staleTime: 60_000,
    retry: 1,
  };
}

export function useFollowStatus(address: string) {
  const { walletAddress } = useAuth();
  return useQuery(options(address, walletAddress));
}

export function useFollowStatuses(addresses: string[]) {
  const { walletAddress } = useAuth();
  const unique = [...new Set(addresses.map(address => address.toLowerCase()))];
  const queries = useQueries({ queries: unique.map(address => options(address, walletAddress)) });
  return Object.fromEntries(unique.map((address, index) => [address, queries[index].data]));
}
