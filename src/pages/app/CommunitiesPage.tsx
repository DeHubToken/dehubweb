/**
 * Communities Discovery Page
 * ===========================
 * "Your Communities" + "Discover" tabs with create button.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Search, Globe, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useDiscoverCommunities, useUserCommunities } from '@/hooks/use-communities';
import { CommunityCard } from '@/components/app/communities/CommunityCard';
import { CreateCommunityModal } from '@/components/app/communities/CreateCommunityModal';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';

type Tab = 'yours' | 'discover';

export default function CommunitiesPage() {
  const { walletAddress, isAuthenticated, openLoginModal } = useAuth();
  const [tab, setTab] = useState<Tab>(isAuthenticated ? 'yours' : 'discover');
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const { data: userCommunities = [], isLoading: loadingUser } = useUserCommunities();
  const { data: allCommunities = [], isLoading: loadingAll } = useDiscoverCommunities();

  const userCommunityIds = new Set(userCommunities.map(m => m.community_id));

  const displayCommunities = tab === 'yours'
    ? userCommunities.map(m => m.communities).filter(Boolean)
    : allCommunities;

  const filtered = search.trim()
    ? displayCommunities.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : displayCommunities;

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
          <h1 className="text-xl font-bold text-white">Communities</h1>
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
          Create
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-white/[0.04] rounded-xl p-1 border border-white/[0.08]">
        {([
          { key: 'yours' as Tab, label: 'Your Communities', icon: UserCheck },
          { key: 'discover' as Tab, label: 'Discover', icon: Globe },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === t.key
                ? 'bg-white/10 text-white'
                : 'text-zinc-500 hover:text-white'
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search communities..."
          className="w-full h-10 pl-10 pr-4 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder:text-zinc-600 outline-none focus:border-white/20 text-sm"
        />
      </div>

      {/* Community List */}
      <div className="space-y-2">
        {(tab === 'yours' ? loadingUser : loadingAll) ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-white/[0.04] animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">
              {tab === 'yours' ? 'You haven\'t joined any communities yet' : 'No communities found'}
            </p>
            {tab === 'yours' && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 rounded-xl border-white/10 text-white"
                onClick={() => setTab('discover')}
              >
                Discover communities
              </Button>
            )}
          </div>
        ) : (
          filtered.map(community => (
            <CommunityCard
              key={community.id}
              community={community}
              isMember={userCommunityIds.has(community.id)}
              onClick={() => navigate(`/app/communities/${community.slug}`)}
            />
          ))
        )}
      </div>

      <CreateCommunityModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
