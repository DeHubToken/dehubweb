import { useQuery, useQueries } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getFollowStatus } from '@/lib/api/dehub';

// The roster and search share these checks. Keep them below the API limit.
let active = 0;
const waiting: Array<() => void> = [];
async function check(address: string) {
  if (active >= 4) await new Promise<void>(resolve => waiting.push(resolve));
  else active++;
  try {
    return await getFollowStatus(address);
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

function options(address: string, viewer?: string | null) {
  return {
    queryKey: ['user-follow-status', viewer?.toLowerCase(), address.toLowerCase()],
    queryFn: () => check(address),
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
