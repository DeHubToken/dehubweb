/**
 * Single Community Page
 * ======================
 * Header with banner/avatar, member-filtered feed, members tab, about tab, chat tab.
 */

import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, Shield, Info, ArrowLeft, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity, useCommunityMembers, useIsCommunityMember, useJoinCommunity, useLeaveCommunity } from '@/hooks/use-communities';
import { CommunityHeader } from '@/components/app/communities/CommunityHeader';
import { CommunityFeed } from '@/components/app/communities/CommunityFeed';
import { CommunityMembers } from '@/components/app/communities/CommunityMembers';
import { CommunityAbout } from '@/components/app/communities/CommunityAbout';
import { CommunityChat } from '@/components/app/communities/CommunityChat';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';

type Tab = 'posts' | 'members' | 'about' | 'chat';

export default function CommunityPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { walletAddress, isAuthenticated, openLoginModal } = useAuth();
  const [tab, setTab] = useState<Tab>('posts');

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
        <p className="text-zinc-500">Community not found</p>
        <Button variant="outline" size="sm" className="mt-3 rounded-xl border-white/10 text-white" onClick={() => navigate('/app/communities')}>
          Back to Communities
        </Button>
      </div>
    );
  }

  const handleJoinLeave = () => {
    if (!isAuthenticated) { openLoginModal(); return; }
    if (isMember) {
      if (isOwner) return; // owners can't leave
      leaveMutation.mutate(community.id);
    } else if (isPendingMember) {
      // Cancel pending request
      leaveMutation.mutate(community.id);
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

      {/* Back button */}
      <button
        onClick={() => navigate('/app/communities')}
        className="flex items-center gap-1.5 px-3 pt-3 text-sm text-zinc-500 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Communities
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
          { key: 'posts' as Tab, label: 'Posts' },
          { key: 'chat' as Tab, label: 'Chat' },
          { key: 'members' as Tab, label: `Members (${community.member_count})` },
          { key: 'about' as Tab, label: 'About' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px]',
              tab === t.key
                ? 'text-white border-white'
                : 'text-zinc-500 border-transparent hover:text-white'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-3 py-4">
        {tab === 'posts' && (
          <CommunityFeed
            communitySlug={community.slug}
            memberAddresses={memberAddresses}
            isMember={isMember}
            tickerSymbol={community.ticker_symbol}
            tickerContractAddress={community.ticker_contract_address}
            tickerChainId={community.ticker_chain_id}
            tickerPairAddress={community.ticker_pair_address}
          />
        )}
        {tab === 'chat' && (
          <CommunityChat
            communityId={community.id}
            isMember={isMember}
          />
        )}
        {tab === 'members' && (
          <CommunityMembers members={members} communityId={community.id} />
        )}
        {tab === 'about' && (
          <CommunityAbout community={community} />
        )}
      </div>
    </div>
  );
}
