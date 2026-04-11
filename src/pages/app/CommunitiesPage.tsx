/**
 * Communities Page
 * =================
 * Shows user's communities first (owned at top), then all communities sorted by member count.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Search } from 'lucide-react';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble2';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCommunities, useDiscoverCommunities } from '@/hooks/use-communities';
import { CommunityCard } from '@/components/app/communities/CommunityCard';
import { CreateCommunityModal } from '@/components/app/communities/CreateCommunityModal';
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

  const userCommunityIds = new Set(userCommunities.map(m => m.community_id));
  const roleMap = useMemo(() => {
    const map: Record<string, string> = {};
    userCommunities.forEach(m => { map[m.community_id] = m.role; });
    return map;
  }, [userCommunities]);

  // Sort: owned first, then the rest
  const myCommunities = useMemo(() => {
    const list = userCommunities.map(m => ({ ...m.communities, _role: m.role })).filter(Boolean);
    return list.sort((a, b) => {
      if (a._role === 'owner' && b._role !== 'owner') return -1;
      if (a._role !== 'owner' && b._role === 'owner') return 1;
      return 0;
    });
  }, [userCommunities]);

  const otherCommunities = allCommunities.filter(c => !userCommunityIds.has(c.id));

  const filterBySearch = (list: typeof allCommunities) =>
    search.trim()
      ? list.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
      : list;

  const filteredMine = filterBySearch(myCommunities);
  const filteredOthers = filterBySearch(otherCommunities);

  const isLoading = loadingUser || loadingAll;

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4">
      <SEOHead
        title="Communities - DeHub"
        description="Join and discover communities on DeHub"
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-6 h-6 text-white" />
          <h1 className="text-xl font-bold text-white">{t('communities.title')}</h1>
        </div>
        <LiquidGlassBubble2
          onClick={() => {
            if (!isAuthenticated) { openLoginModal(); return; }
            setCreateOpen(true);
          }}
          className="h-9 px-3.5 text-sm"
        >
          <Plus className="w-4 h-4 shrink-0" />
          {t('communities.create')}
        </LiquidGlassBubble2>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('communities.searchPlaceholder')}
          className="w-full h-10 pl-10 pr-4 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder:text-zinc-600 outline-none focus:border-white/20 text-sm"
        />
      </div>

      {isLoading ? (
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
