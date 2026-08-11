/**
 * Community Link Embed
 * ====================
 * Detects community URLs in post content and renders them as community preview cards
 * (same style as pinned communities on profiles).
 */

import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCommunity } from '@/hooks/use-communities';
import { findDehubLinks, stripDehubLinks } from '@/lib/dehub-links';

// ── Legacy detection helpers ────────────────────────────────────────────────
//
// Detection moved to lib/dehub-links, which is host-checked and also matches
// the /communities/<slug> form these regexes never saw. Kept as thin wrappers
// so existing call sites keep working; prefer `useDehubLinks` in new code.

/** @deprecated Use `findDehubLink` from `@/lib/dehub-links`. */
export function extractCommunitySlug(text: string): string | null {
  const match = findDehubLinks(text).find((l) => l.kind === 'community');
  return match?.slug ?? null;
}

/** @deprecated Use `findDehubLink` from `@/lib/dehub-links`. */
export function hasCommunityLink(text: string): boolean {
  return findDehubLinks(text).some((l) => l.kind === 'community');
}

/** @deprecated Use `stripDehubLinks` from `@/lib/dehub-links`. */
export function stripCommunityLinks(text: string): string {
  return stripDehubLinks(text);
}

interface CommunityLinkEmbedProps {
  slug: string;
  fallback?: ReactNode;
}

export function CommunityLinkEmbed({ slug, fallback = null }: CommunityLinkEmbedProps) {
  const navigate = useNavigate();
  const { data: community, isLoading } = useCommunity(slug);

  if (isLoading) {
    return (
      <div className="mt-2 h-16 rounded-xl bg-white/[0.04] animate-pulse" />
    );
  }

  if (!community) return <>{fallback}</>;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/app/communities/${community.slug}`);
      }}
      data-no-navigate
      className="w-full flex items-center gap-3 p-3 mt-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-colors text-left relative overflow-hidden"
    >
      {/* Subtle banner background fade */}
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
          <p className="text-xs truncate mt-0.5 text-slate-50">{community.description}</p>
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
