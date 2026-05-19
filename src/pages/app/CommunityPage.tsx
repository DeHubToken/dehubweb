/**
 * Single Community Page
 * ======================
 * Header with banner/avatar, member-filtered feed, members tab, about tab, chat tab.
 */

import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity, useCommunityMembers, useIsCommunityMember, useJoinCommunity, useLeaveCommunity } from '@/hooks/use-communities';
import { CommunityHeader } from '@/components/app/communities/CommunityHeader';
import { CommunityFeed } from '@/components/app/communities/CommunityFeed';
import { CommunityMembers } from '@/components/app/communities/CommunityMembers';
import { CommunityAbout } from '@/components/app/communities/CommunityAbout';
import { CommunityChat } from '@/components/app/communities/CommunityChat';
import { CommunityEvents } from '@/components/app/communities/CommunityEvents';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { useTranslation } from 'react-i18next';

type Tab = 'posts' | 'events' | 'members' | 'about' | 'chat';

export default function CommunityPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { walletAddress, isAuthenticated, openLoginModal } = useAuth();
  const [tab, setTab] = useState<Tab>('posts');
  const { t } = useTranslation();

  const { data: community, isLoading } = useCommunity(slug);
  const { data: members = [] } = useCommunityMembers(community?.id);
  const { data: membership } = useIsCommunityMember(community?.id);
  const joinMutation = useJoinCommunity();
  const leaveMutation = useLeaveCommunity();

  const isMember = !!membership && membership.status === 'active';
  const isPendingMember = !!membership && membership.status === 'pending';
  const isOwner = membership?.role === 'owner';
  const memberAddresses = useMemo(() => new Set(members.map(m => m.wallet_address.toLowerCase())), [members]);
  

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-3 py-4 space-y-4">
        <div className="h-32 rounded-xl bg-white/[0.04] animate-pulse" />
        <div className="h-16 rounded-xl bg-white/[0.04] animate-pulse" />
      </div>
    );
  }

  if (!community) {
    return (
      <div className="max-w-2xl mx-auto px-3 py-12 text-center">
        <p className="text-zinc-500">{t('communities.communityNotFound')}</p>
        <Button variant="outline" size="sm" className="mt-3 rounded-xl border-white/10 text-white" onClick={() => navigate('/app/communities')}>
          {t('communities.backButton')}
        </Button>
      </div>
    );
  }

  const handleJoinLeave = () => {
    if (!isAuthenticated) { openLoginModal(); return; }
    if (isMember) {
      if (isOwner) return;
      leaveMutation.mutate(community.id, {
        onSuccess: () => { toast.success(t('communities.leftCommunity')); },
      });
    } else if (isPendingMember) {
      leaveMutation.mutate(community.id, {
        onSuccess: () => { toast.success(t('communities.requestCancelled')); },
      });
    } else {
      joinMutation.mutate({ communityId: community.id, isPrivate: community.is_private });
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <SEOHead
        title={`${community.name} - DeHub Community`}
        description={community.description || `Join ${community.name} on DeHub`}
      />

      <button
        onClick={() => navigate('/app/communities')}
        className="flex items-center gap-1.5 px-3 pt-3 text-sm text-zinc-500 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('communities.backToCommunities')}
      </button>

      <CommunityHeader
        community={community}
        isMember={isMember}
        isPendingMember={isPendingMember}
        isOwner={isOwner}
        isPending={joinMutation.isPending || leaveMutation.isPending}
        onJoinLeave={handleJoinLeave}
      />

      {/* Tabs */}
      <div className="flex border-b border-white/[0.08] px-3">
        {([
          { key: 'posts' as Tab, label: t('communities.posts') },
          { key: 'chat' as Tab, label: t('communities.chat') },
          { key: 'events' as Tab, label: 'Events' },
          { key: 'members' as Tab, label: t('communities.membersLabel') },
          { key: 'about' as Tab, label: t('communities.about') },
        ]).map(tItem => (
          <button
            key={tItem.key}
            onClick={() => setTab(tItem.key)}
            className={cn(
              'relative px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px] whitespace-nowrap',
              tab === tItem.key
                ? 'text-white border-white'
                : 'text-zinc-500 border-transparent hover:text-white'
            )}
          >
            {tItem.label}
            {'badge' in tItem && (tItem as any).badge > 0 && (
              <span className="absolute top-1.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full leading-none">
                {(tItem as any).badge > 99 ? '99+' : (tItem as any).badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="px-3 py-4">
        <div className={tab === 'posts' ? '' : 'hidden'}>
          <CommunityFeed
            communitySlug={community.slug}
            memberAddresses={memberAddresses}
            isMember={isMember}
            tickerSymbol={community.ticker_symbol}
            tickerContractAddress={community.ticker_contract_address}
            tickerChainId={community.ticker_chain_id}
            tickerPairAddress={community.ticker_pair_address}
          />
        </div>
        <div className={tab === 'chat' ? '' : 'hidden'}>
          <CommunityChat communityId={community.id} isMember={isMember} />
        </div>
        <div className={tab === 'events' ? '' : 'hidden'}>
          <CommunityEvents communityId={community.id} isMember={isMember} />
        </div>
        <div className={tab === 'members' ? '' : 'hidden'}>
          <CommunityMembers members={members} communityId={community.id} isOwner={isOwner} />
        </div>
        <div className={tab === 'about' ? '' : 'hidden'}>
          <CommunityAbout community={community} isOwner={isOwner} />
        </div>
      </div>
    </div>
  );
}
