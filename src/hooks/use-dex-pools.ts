import { useQuery } from '@tanstack/react-query';
import { listPools } from '@/lib/dex/pools';

/** Every community pool, newest first. */
export const usePools = () => useQuery({ queryKey: ['dex-pools'], queryFn: listPools, staleTime: 60_000 });
