/**
 * Communities Page
 * =================
 * Shows user's communities first (owned at top), then all communities sorted by member count.
 */

import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Search, Bell } from 'lucide-react';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCommunities, useDiscoverCommunities, useCommunityActivityScores } from '@/hooks/use-communities';
import { CommunityCard } from '@/components/app/communities/CommunityCard';
import { CreateCommunityModal } from '@/components/app/communities/CreateCommunityModal';
import { CommunityOwnerActivity } from '@/components/app/communities/CommunityOwnerActivity';
import { SEOHead } from '@/components/SEOHead';
import { useTranslation } from 'react-i18next';
import { useCommunityActivityUnreadCount } from '@/hooks/use-community-activity-unread';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';

export default function CommunitiesPage() {
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data: userCommunities = [], isLoading: loadingUser } = useUserCommunities();
  const { data: allCommunities = [], isLoading: loadingAll } = useDiscoverCommunities();
  const { data: activityScores = {} } = useCommunityActivityScores();
  const [sortMode, setSortMode] = useState<'top' | 'new' | 'hot'>('top');

  // Fetch per-community unread counts for owned communities
  const ownedCommunityIds = useMemo(
    () => userCommunities.filter(m => m.role === 'owner').map(m => m.community_id),
    [userCommunities]
  );

  const { data: perCommunityUnread = {} } = useQuery({
    queryKey: ['community-activity-unread-per', ownedCommunityIds],
    queryFn: async () => {
      if (ownedCommunityIds.length === 0) return {};
      const { data, error } = await withWalletHeader(
        supabase
          .from('custom_notifications')
          .select('reference_id')
          .eq('type', 'community_join')
          .eq('read', false)
          .in('reference_id', ownedCommunityIds),
        walletAddress!
      );
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        if (row.reference_id) {
          counts[row.reference_id] = (counts[row.reference_id] || 0) + 1;
        }
      });
      return counts;
    },
    enabled: ownedCommunityIds.length > 0 && !!walletAddress,
    staleTime: 60_000,
  });

  const [tab, setTab] = useState<'communities' | 'activity'>('communities');

  const totalUnread = useMemo(() => Object.values(perCommunityUnread).reduce((a, b) => a + b, 0), [perCommunityUnread]);

  const userCommunityIds = new Set(userCommunities.map(m => m.community_id));
  const roleMap = useMemo(() => {
    const map: Record<string, string> = {};
    userCommunities.forEach(m => { map[m.community_id] = m.role; });
    return map;
  }, [userCommunities]);

  // Sort: owned first, then the rest. Filter out rows where the joined
  // community row failed to load — without this we render empty card stubs.
  const myCommunities = useMemo(() => {
    const list = userCommunities
      .filter(m => m.communities && (m.communities as any).id)
      .map(m => ({ ...m.communities, _role: m.role }));
    return list.sort((a, b) => {
      if (a._role === 'owner' && b._role !== 'owner') return -1;
      if (a._role !== 'owner' && b._role === 'owner') return 1;
      return 0;
    });
  }, [userCommunities]);

  const otherCommunities = useMemo(() => {
    const list = allCommunities.filter(c => !userCommunityIds.has(c.id));
    if (sortMode === 'new') {
      return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    if (sortMode === 'hot') {
      return [...list].sort((a, b) => {
        const sa = (a.member_count || 0) + (activityScores[a.id] || 0);
        const sb = (b.member_count || 0) + (activityScores[b.id] || 0);
        return sb - sa;
      });
    }
    return list;
  }, [allCommunities, userCommunityIds, sortMode, activityScores]);

  const filterBySearch = (list: typeof allCommunities) =>
    search.trim()
      ? list.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
      : list;

  const filteredMine = filterBySearch(myCommunities);
  const filteredOthers = filterBySearch(otherCommunities);

  // When the user is authenticated but walletAddress hasn't resolved yet,
  // useUserCommunities is disabled (loadingUser=false). Previously the page
  // would render with an empty "mine" list and only fix itself after refresh.
  // Treat that pre-wallet window as loading to ensure all communities show.
  const waitingForWallet = isAuthenticated && !walletAddress;
  const isLoading = loadingUser || loadingAll || waitingForWallet;

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4">
      <SEOHead
        title="Communities - DeHub"
        description="Join and discover communities on DeHub"
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="w-6 h-6 text-white shrink-0" />
          <h1 className="text-xl font-bold text-white truncate">{t('communities.title')}</h1>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <LiquidGlassBubble
            shimmer
            noBorder
            onClick={() => setSortMode(sortMode === 'new' ? 'top' : 'new')}
            className={cn(
              "cursor-pointer flex-shrink-0 [&>div]:!rounded-xl [&>div]:!p-0 [&>div]:!h-full [&>div]:!flex [&>div]:!items-center [&>div]:!justify-center [&>div:before]:!rounded-xl [&>div:after]:!rounded-xl",
              sortMode === 'new' ? "opacity-100" : "opacity-60 hover:opacity-90"
            )}
            style={{ width: '36px', height: '36px' }}
          >
            <span className="flex items-center justify-center w-full h-full text-base">💎</span>
          </LiquidGlassBubble>
          <LiquidGlassBubble
            shimmer
            noBorder
            onClick={() => setSortMode(sortMode === 'hot' ? 'top' : 'hot')}
            className={cn(
              "cursor-pointer flex-shrink-0 [&>div]:!rounded-xl [&>div]:!p-0 [&>div]:!h-full [&>div]:!flex [&>div]:!items-center [&>div]:!justify-center [&>div:before]:!rounded-xl [&>div:after]:!rounded-xl",
              sortMode === 'hot' ? "opacity-100" : "opacity-60 hover:opacity-90"
            )}
            style={{ width: '36px', height: '36px' }}
          >
            <span className="flex items-center justify-center w-full h-full text-base">🔥</span>
          </LiquidGlassBubble>
          <LiquidGlassBubble2
            label={t('communities.create')}
            icon={<Plus className="w-4 h-4" />}
            onClick={() => {
              if (!isAuthenticated) { openLoginModal(); return; }
              setCreateOpen(true);
            }}
            height="36px"
            width="auto"
            className="px-3.5"
          />
        </div>
      </div>

      {/* Search */}
      {/* Tabs */}
      {isAuthenticated && ownedCommunityIds.length > 0 && (
        <div className="flex gap-1 mb-4 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
          <button
            onClick={() => setTab('communities')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${tab === 'communities' ? 'bg-white/[0.1] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Communities
          </button>
          <button
            onClick={() => setTab('activity')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${tab === 'activity' ? 'bg-white/[0.1] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Activity
            {totalUnread > 0 && (
              <span className="min-w-[16px] h-[16px] px-1 flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full leading-none">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </button>
        </div>
      )}

      <div className={`relative mb-4 ${tab !== 'communities' ? 'hidden' : ''}`}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('communities.searchPlaceholder')}
          className="w-full h-10 pl-10 pr-4 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder:text-zinc-600 outline-none focus:border-white/20 text-sm"
        />
      </div>

      {tab === 'activity' ? (
        <div className="space-y-4">
          {ownedCommunityIds.map(id => {
            const community = myCommunities.find((c: any) => c.id === id);
            return (
              <div key={id}>
                {community && (
                  <h3 className="text-xs font-semibold text-zinc-400 mb-2 px-1">{(community as any).name}</h3>
                )}
                <CommunityOwnerActivity communityId={id} />
              </div>
            );
          })}
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      ) : (
        <div>
          {isAuthenticated && filteredMine.length > 0 && (
            <div className="space-y-2">
              {filteredMine.map(community => (
                <CommunityCard
                  key={community.id}
                  community={community}
                  isMember={true}
                  role={roleMap[community.id]}
                  unreadCount={perCommunityUnread[community.id]}
                  onClick={() => navigate(`/app/communities/${community.slug}`)}
                />
              ))}
            </div>
          )}

          {isAuthenticated && filteredMine.length > 0 && filteredOthers.length > 0 && (
            <div className="my-6 border-t border-white/[0.06]" />
          )}

          {filteredOthers.length > 0 ? (
            <div className="space-y-2">
              {filteredOthers.map(community => (
                <CommunityCard
                  key={community.id}
                  community={community}
                  isMember={userCommunityIds.has(community.id)}
                  role={roleMap[community.id]}
                  onClick={() => navigate(`/app/communities/${community.slug}`)}
                />
              ))}
            </div>
          ) : filteredMine.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-500 text-sm">{t('communities.noCommunities')}</p>
            </div>
          ) : null}
        </div>
      )}

      <CreateCommunityModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
