/**
 * Communities Page
 * =================
 * Shows user's communities first (owned at top), then all communities sorted by member count.
 */

import { BrandIcon, ThemedIcon } from '@/components/app/war/WarHudIcon';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCommunities, useDiscoverCommunities, useCommunityActivityScores } from '@/hooks/use-communities';
import { CommunityCard } from '@/components/app/communities/CommunityCard';
import { CreateCommunityModal } from '@/components/app/communities/CreateCommunityModal';
import { CommunityActivity } from '@/components/app/communities/CommunityActivity';
import { AppState } from '@/components/app/AppState';
import { SEOHead } from '@/components/SEOHead';
import { useTranslation } from 'react-i18next';
import { useCommunityNotifications, useCommunityUnreadCounts } from '@/hooks/use-community-notifications';
import { communityNotificationRef, type CommunityRef } from '@/lib/community-notifications';
import communitiesTitleIcon from '@/assets/communities-title-icon.webp';

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

  const [tab, setTab] = useState<'communities' | 'activity'>('communities');

  // Activity and unread badges are views of the main notification system — the
  // same rows the bell reads, fetched once. This page used to query
  // custom_notifications itself, which is how it ended up matching
  // `reference_id` against a form the join trigger was no longer writing.
  const { total: totalUnread, countFor } = useCommunityUnreadCounts();
  const { notifications: communityNotifications } = useCommunityNotifications();

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

  /**
   * Activity, grouped by community, newest group first.
   *
   * A row files under whichever community its reference matches — slug or uuid,
   * since the join trigger has written both — and one whose community is no
   * longer in the list keeps a heading from the title it stored rather than
   * disappearing from the tab.
   */
  const activityGroups = useMemo(() => {
    const groups = new Map<string, { community: CommunityRef; notifications: typeof communityNotifications }>();
    for (const notification of communityNotifications) {
      const ref = communityNotificationRef(notification)?.toLowerCase();
      if (!ref) continue;
      let group = groups.get(ref);
      if (!group) {
        const match = myCommunities.find((c: any) =>
          c.slug?.toLowerCase() === ref || c.id?.toLowerCase() === ref);
        group = {
          community: match
            ? { id: (match as any).id, slug: (match as any).slug, name: (match as any).name }
            : { slug: ref, name: (notification as any)._customReferenceTitle || ref },
          notifications: [],
        };
        groups.set(ref, group);
      }
      group.notifications.push(notification);
    }
    return [...groups.values()];
  }, [communityNotifications, myCommunities]);

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

  // Swallow the communities list at the sticky header bento's top edge under
  // the glass themes, exactly like the home feed cuts at its nav pill.
  const contentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(contentRef, '[data-feed-nav-outer] > [data-page-bento]');

  return (
    <div className="min-h-screen">
      <SEOHead
        title="Communities — Find Your People on DeHub"
        description="Discover DeHub communities: join public groups, follow the topics you care about and build your own community on the decentralized, user-owned social platform."
        url="https://dehub.io/communities"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'DeHub Communities',
          url: 'https://dehub.io/communities',
          description: 'Public communities on the DeHub decentralized social platform.',
          isPartOf: { '@type': 'WebSite', name: 'DeHub', url: 'https://dehub.io' },
        }}
      />

      {/* Sticky nav pill */}
      <div data-feed-nav-outer className="sticky top-11 lg:top-0 z-50 bg-black px-2 pt-1 pb-0 sm:px-3 sm:pt-1 sm:pb-0 lg:pt-2 max-w-2xl mx-auto">
        <div data-page-bento className="bg-zinc-900 rounded-2xl px-4 py-3 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <BrandIcon src={communitiesTitleIcon} alt="" className="w-9 h-9 shrink-0 object-contain" />
              <h1 className="text-xl font-bold text-white truncate">{t('communities.title')}</h1>
            </div>
          </div>

          {/* Tabs */}
          {isAuthenticated && (activityGroups.length > 0 || totalUnread > 0) && (
            <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <button
                onClick={() => setTab('communities')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${tab === 'communities' ? 'bg-white/[0.1] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {t('communities.title')}
              </button>
              <button
                onClick={() => setTab('activity')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${tab === 'activity' ? 'bg-white/[0.1] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {t('communities.activity', 'Activity')}
                {totalUnread > 0 && (
                  <span className="min-w-[16px] h-[16px] px-1 flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full leading-none">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </button>
            </div>
          )}

          <div className={`flex items-center gap-1.5 ${tab !== 'communities' ? 'hidden' : ''}`}>
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('communities.searchPlaceholder')}
                className="w-full h-10 pl-10 pr-4 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder:text-zinc-600 outline-none focus:border-white/20 text-sm"
              />
            </div>
            <LiquidGlassBubble
              shimmer
              noBorder
              onClick={() => setSortMode(sortMode === 'new' ? 'top' : 'new')}
              className={cn(
                "cursor-pointer flex-shrink-0 [&>div]:!rounded-xl [&>div]:!p-0 [&>div]:!h-full [&>div]:!flex [&>div]:!items-center [&>div]:!justify-center [&>div:before]:!rounded-xl [&>div:after]:!rounded-xl",
                sortMode === 'new' ? "opacity-100" : "opacity-60 hover:opacity-90"
              )}
              style={{ width: '40px', height: '40px' }}
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
              style={{ width: '40px', height: '40px' }}
            >
              <span className="flex items-center justify-center w-full h-full text-base">🔥</span>
            </LiquidGlassBubble>
            <LiquidGlassBubble
              shimmer
              noBorder
              onClick={() => {
                if (!isAuthenticated) { openLoginModal(); return; }
                setCreateOpen(true);
              }}
              className={cn(
                "cursor-pointer flex-shrink-0 [&>div]:!rounded-xl [&>div]:!p-0 [&>div]:!h-full [&>div]:!flex [&>div]:!items-center [&>div]:!justify-center [&>div:before]:!rounded-xl [&>div:after]:!rounded-xl opacity-60 hover:opacity-90"
              )}
              style={{ width: '40px', height: '40px' }}
            >
              <Plus className="w-5 h-5 text-white" />
            </LiquidGlassBubble>
          </div>
        </div>
      </div>

      {/* Content */}
      <div ref={contentRef} className="max-w-2xl mx-auto px-2 sm:px-3 pt-3 pb-6">
      {tab === 'activity' ? (
        activityGroups.length > 0 ? (
          <div className="space-y-4">
            {activityGroups.map(group => (
              <div key={group.community.slug || group.community.id}>
                <h3 className="text-xs font-semibold text-zinc-400 mb-2 px-1">{group.community.name}</h3>
                <CommunityActivity community={group.community} notifications={group.notifications} />
              </div>
            ))}
          </div>
        ) : (
          <AppState
            icon="notifications"
            title={t('communities.activityEmpty', 'No activity yet')}
            description={t('communities.activityEmptyDesc', 'Joins, mentions and announcements from your communities show up here.')}
            size="section"
          />
        )
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
                  unreadCount={countFor(community)}
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
              <ThemedIcon icon="communities" alt="" className="w-14 h-14 object-contain mx-auto mb-3 opacity-65" />
              <p className="text-zinc-500 text-sm">{t('communities.noCommunities')}</p>
            </div>
          ) : null}
        </div>
      )}
      </div>

      <CreateCommunityModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
