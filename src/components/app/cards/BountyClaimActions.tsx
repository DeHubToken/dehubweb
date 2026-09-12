import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { getBountyEligibility, submitBountyClaim } from '@/lib/bounty-claim';

export default function BountyClaimActions({ tokenId, open }: { tokenId: string; open: boolean }) {
  const { t } = useTranslation();
  const { walletAddress, openLoginModal } = useAuth();
  const [pending, setPending] = useState(false);
  const [claimed, setClaimed] = useState<Record<string, boolean>>({});
  const eligibility = useQuery({
    queryKey: ['bounty-eligibility', tokenId, walletAddress],
    queryFn: () => getBountyEligibility(tokenId, !!walletAddress),
    enabled: open && !!tokenId,
    staleTime: 0,
    retry: false,
  });
  if (!open) return null;
  if (eligibility.isFetching) return <p role="status">{t('common.loading')}</p>;
  const result = eligibility.data?.result;
  return <div className="space-y-2" onClick={e => e.stopPropagation()}>
    {!walletAddress && !eligibility.error && !eligibility.data?.error && <button className="w-full rounded-xl border border-white/10 p-3" onClick={() => openLoginModal()}>{t('nav.login')}</button>}
    {(['viewer', 'commentor'] as const).map(type => {
      const key = `${walletAddress}:${tokenId}:${type}`;
      if (claimed[key] || result?.[`${type}_claimed`]) return <p key={type} role="status">{t('toasts.rewards_claimed')}</p>;
      if (!result?.[type]) return null;
      return <button key={type} disabled={pending} className="w-full rounded-xl border border-white/10 bg-white/10 p-3 disabled:opacity-50" onClick={async () => {
        if (pending) return;
        setPending(true);
        try {
          await submitBountyClaim(tokenId, type);
          setClaimed(previous => ({ ...previous, [key]: true }));
          toast.success(t('toasts.rewards_claimed'));
          await eligibility.refetch();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : t('toasts.claim_failed'));
        } finally { setPending(false); }
      }}>{pending ? t('toasts.claiming_rewards') : `${t('staking.claim')} · ${t(type === 'viewer' ? 'drawers.rewardedWatching' : 'drawers.rewardedEngaging')}`}</button>;
    })}
    {(eligibility.error || eligibility.data?.error) && <p role="status" className="text-sm text-zinc-400">{eligibility.error instanceof Error ? eligibility.error.message : String(eligibility.data?.error)}</p>}
    <button disabled={pending} className="w-full p-2 text-sm text-zinc-400" onClick={() => eligibility.refetch()}>{t('toasts.refresh')}</button>
  </div>;
}
