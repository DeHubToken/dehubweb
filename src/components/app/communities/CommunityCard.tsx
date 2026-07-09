import { Users, Lock, Crown, Link as LinkIcon, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Community } from '@/hooks/use-communities';

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 1) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}m`;
  return `${Math.floor(diffDays / 365)}y`;
}

const URL_REGEX = /https?:\/\/[^\s)<>]+/gi;

function extractUrls(text: string): string[] {
  return text.match(URL_REGEX) || [];
}

function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '');
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/, '');
  }
}

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
  const description = community.description || '';
  const links = extractUrls(description);
  const descWithoutLinks = description.replace(URL_REGEX, '').trim();

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 pr-16 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-colors text-left relative overflow-hidden"
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
      <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-sm border border-white/10 z-10">
        <Clock className="w-3 h-3 text-zinc-400" />
        <span className="text-[10px] text-zinc-300 font-medium leading-none">{formatRelativeTime(community.created_at)}</span>
      </div>
      <div className="relative w-12 h-12 rounded-xl bg-white/[0.08] flex items-center justify-center flex-shrink-0">
       <div className="w-full h-full rounded-xl overflow-hidden flex items-center justify-center">
        {community.avatar_url ? (
          <img src={community.avatar_url} alt={community.name} className="w-full h-full object-cover rounded-lg" />
        ) : (
          <Users className="w-5 h-5 text-zinc-500" />
        )}
       </div>
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
        <p className="text-xs truncate text-black dark:text-white">{descWithoutLinks || t('communities.noDescription')}</p>
        {links.length > 0 && (
          <div className="flex items-center gap-2 mt-0.5">
            {links.slice(0, 3).map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors truncate max-w-[140px]"
              >
                <LinkIcon className="w-3 h-3 shrink-0" />
                <span className="truncate">{cleanUrl(url)}</span>
              </a>
            ))}
          </div>
        )}
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
