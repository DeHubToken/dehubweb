/**
 * Community Link Embed
 * ====================
 * Detects community URLs in post content and renders them as community preview cards
 * (same style as pinned communities on profiles).
 */

import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useCommunity } from '@/hooks/use-communities';

/** Extract community slug from a URL like /app/communities/dehub */
export function extractCommunitySlug(text: string): string | null {
  const match = text.match(/\/app\/communities\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/** Check if text contains a community link */
export function hasCommunityLink(text: string): boolean {
  return /\/app\/communities\/[a-zA-Z0-9_-]+/.test(text);
}

interface CommunityLinkEmbedProps {
  slug: string;
}

export function CommunityLinkEmbed({ slug }: CommunityLinkEmbedProps) {
  const navigate = useNavigate();
  const { data: community, isLoading } = useCommunity(slug);

  if (isLoading) {
    return (
      <div className="mt-2 h-16 rounded-xl bg-white/[0.04] animate-pulse" />
    );
  }

  if (!community) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/app/communities/${community.slug}`);
      }}
      data-no-navigate
      className="w-full flex items-center gap-3 p-3 mt-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-colors text-left"
    >
      {/* Community avatar */}
      <div className="w-12 h-12 rounded-lg bg-white/[0.06] flex items-center justify-center overflow-hidden flex-shrink-0">
        {community.avatar_url ? (
          <img src={community.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <Users className="w-5 h-5 text-zinc-500" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{community.name}</p>
        {community.description && (
          <p className="text-xs text-zinc-500 truncate mt-0.5">{community.description}</p>
        )}
        <div className="flex items-center gap-1.5 mt-1">
          <Users className="w-3 h-3 text-zinc-500" />
          <span className="text-xs text-zinc-500">
            <span className="font-semibold text-zinc-300">{community.member_count.toLocaleString()}</span> Members
          </span>
        </div>
      </div>
    </button>
  );
}
