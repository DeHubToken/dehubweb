/**
 * Communities Page
 * =================
 * Shows user's communities first, then all communities sorted by member count
 * with infinite scroll pagination.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCommunities, useDiscoverCommunities } from '@/hooks/use-communities';
import { CommunityCard } from '@/components/app/communities/CommunityCard';
import { CreateCommunityModal } from '@/components/app/communities/CreateCommunityModal';
import { SEOHead } from '@/components/SEOHead';
import { useTranslation } from 'react-i18next';

export default function CommunitiesPage() {
  const { isAuthenticated, openLoginModal } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data: userCommunities = [], isLoading: loadingUser } = useUserCommunities();
  const { data: allCommunities = [], isLoading: loadingAll } = useDiscoverCommunities();

  const userCommunityIds = new Set(userCommunities.map(m => m.community_id));
  const myCommunities = userCommunities.map(m => m.communities).filter(Boolean);

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
        <Button
          size="sm"
          className="rounded-xl bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 text-white gap-1.5"
          onClick={() => {
            if (!isAuthenticated) { openLoginModal(); return; }
            setCreateOpen(true);
          }}
        >
          <Plus className="w-4 h-4" />
          {t('communities.create')}
        </Button>
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
