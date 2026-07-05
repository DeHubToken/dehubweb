/**
 * Editor storage quota hook — combines the signed-in user's staking badge
 * balance with their currently used editor storage bytes.
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getAccountInfo } from "@/lib/api/dehub/users";
import { getEditorStorageUsage } from "@/lib/editor/cloudMedia";
import { getQuotaForBadge, type QuotaInfo } from "@/lib/editor/quota";

export interface EditorQuotaState {
  isAuthenticated: boolean;
  walletAddress: string | null;
  usedBytes: number;
  assetCount: number;
  quota: QuotaInfo;
  remainingBytes: number;
  overQuota: boolean;
  refetchUsage: () => Promise<unknown>;
}

export function useEditorQuota(): EditorQuotaState {
  const { walletAddress, isAuthenticated, user } = useAuth() as {
    walletAddress: string | null;
    isAuthenticated: boolean;
    user: { username?: string | null } | null;
  };

  const profileQuery = useQuery({
    queryKey: ["editor-quota-profile", walletAddress],
    queryFn: async () => {
      if (!walletAddress) return null;
      try {
        return await getAccountInfo(walletAddress, walletAddress);
      } catch {
        return null;
      }
    },
    enabled: !!walletAddress && isAuthenticated,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const usageQuery = useQuery({
    queryKey: ["editor-storage-usage", walletAddress],
    queryFn: () => getEditorStorageUsage(walletAddress!),
    enabled: !!walletAddress && isAuthenticated,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const lnBalance =
    (profileQuery.data as { lnBalance?: number; balanceData?: Array<{ walletBalance?: number; staked?: number }> } | null)
      ?.lnBalance ??
    (profileQuery.data as { balanceData?: Array<{ walletBalance?: number; staked?: number }> } | null)
      ?.balanceData?.reduce((s, b) => s + (b.walletBalance || 0) + (b.staked || 0), 0) ??
    0;

  const quota = getQuotaForBadge(lnBalance, user?.username ?? null);
  const usedBytes = usageQuery.data?.used_bytes ?? 0;
  const remainingBytes = Math.max(0, quota.bytes - usedBytes);

  return {
    isAuthenticated,
    walletAddress,
    usedBytes,
    assetCount: usageQuery.data?.asset_count ?? 0,
    quota,
    remainingBytes,
    overQuota: usedBytes >= quota.bytes,
    refetchUsage: usageQuery.refetch,
  };
}
