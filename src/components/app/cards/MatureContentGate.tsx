/**
 * Mature Content Gate
 * ===================
 * The content warning that sits over a post rated `mature`.
 *
 * The public feeds never carry these posts unless the viewer opted in
 * server-side, so this covers the surfaces where a mature post is served on
 * purpose — a creator's profile, the Following feed, a link somebody shared.
 * Opening it is per-card and per-session: it is a warning, not a lock, and
 * nothing about it is a security boundary.
 *
 * Visual language is deliberately the one PPV and holdings-locked posts
 * already use — blurred media, a rounded glass tile, one line of explanation.
 *
 * @example
 * ```tsx
 * const gate = useMatureGate(post.contentRating);
 * {gate.isGated ? <MatureContentGate preview={images[0]} onReveal={gate.reveal} /> : <TheRealMedia />}
 * ```
 */

import { useCallback, useState } from 'react';
import { EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMatureContent } from '@/hooks/use-mature-content';
import type { ContentRating } from '@/lib/api/dehub/types';

/**
 * Whether this post needs a warning, and the one-way switch that removes it.
 *
 * Safe to call on every card — the underlying profile query is shared and
 * cached, so this costs one boolean read per post.
 */
export function useMatureGate(contentRating?: ContentRating) {
  const { showMatureContent } = useMatureContent();
  const [revealed, setRevealed] = useState(false);

  const reveal = useCallback(() => setRevealed(true), []);

  return {
    isGated: contentRating === 'mature' && !showMatureContent && !revealed,
    reveal,
  };
}

interface MatureContentGateProps {
  /** Image to blur behind the warning. A plain dark panel is used without one. */
  preview?: string;
  onReveal: () => void;
  /** Short copy under the heading — say what kind of post this is where known. */
  description?: string;
  className?: string;
}

export function MatureContentGate({
  preview,
  onReveal,
  description = 'The creator marked this post as adult or graphic.',
  className,
}: MatureContentGateProps) {
  return (
    <div className={cn('relative rounded-2xl overflow-hidden', className)}>
      {preview ? (
        <img
          src={preview}
          alt=""
          aria-hidden="true"
          className="w-full max-h-[600px] object-cover blur-2xl scale-110"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-56 bg-zinc-900" />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10 mb-3">
          <EyeOff className="h-7 w-7 text-white" />
        </div>
        <p className="text-white font-semibold text-sm mb-1">Mature content</p>
        <p className="text-white/70 text-xs mb-3 max-w-xs">{description}</p>
        <button
          type="button"
          data-no-navigate
          onClick={(e) => {
            // Cards navigate on click; revealing must not open the post.
            e.stopPropagation();
            onReveal();
          }}
          className="px-4 py-1.5 rounded-full text-xs font-medium text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-colors"
        >
          View anyway
        </button>
      </div>
    </div>
  );
}
