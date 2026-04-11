import { Users, Lock, Crown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Community } from '@/hooks/use-communities';

interface CommunityCardProps {
  community: Community;
  isMember: boolean;
  role?: string;
  unreadCount?: number;
  onClick: () => void;
}

export function CommunityCard({ community, isMember, role, unreadCount, onClick }: CommunityCardProps) {
  const { t } = useTranslation();
  const isOwner = role === 'owner';

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-colors text-left relative overflow-hidden"
    >
      {community.banner_url && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${community.banner_url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.42,
            maskImage: 'linear-gradient(to right, transparent 30%, black 70%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent 30%, black 70%)',
          }}
        />
      )}
      <div className="relative w-12 h-12 rounded-xl bg-white/[0.08] flex items-center justify-center flex-shrink-0 overflow-hidden">
        {community.avatar_url ? (
          <img src={community.avatar_url} alt={community.name} className="w-full h-full object-cover" />
        ) : (
          <Users className="w-5 h-5 text-zinc-500" />
        )}
        {unreadCount !== undefined && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full z-10 leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-white font-medium text-sm truncate">{community.name}</span>
          {community.is_private && <Lock className="w-3 h-3 text-zinc-500 flex-shrink-0" />}
        </div>
        <p className="text-zinc-500 text-xs truncate">{community.description || t('communities.noDescription')}</p>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-zinc-600 text-xs">{community.member_count.toLocaleString()} {t('communities.members')}</span>
          {isMember && (
            isOwner ? (
              <span className="flex items-center gap-1 text-xs text-amber-400/80">
                <Crown className="w-3 h-3" />
                Owner
              </span>
            ) : (
              <span className="text-xs text-emerald-500/80">{t('communities.joined')}</span>
            )
          )}
        </div>
      </div>
    </button>
  );
}
