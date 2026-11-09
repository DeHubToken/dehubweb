import { useTranslation as _useCopy } from 'react-i18next';
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
import EyeOff from "@/components/ui/cut-icons/hidden";

import { NoticeGate } from './NoticeGate';
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
  description,
  className,
}: MatureContentGateProps) {
  const { t: _copy } = _useCopy();
  return (
    <NoticeGate
      preview={preview}
      tone="rose"
      icon={<EyeOff className="h-6 w-6" />}
      label={_copy("copy.9b8b53102e77", { defaultValue: "Mature content" })}
      description={description ?? _copy("copy.5ca2fd8dd3f8", { defaultValue: "The creator marked this post as adult or graphic." })}
      action={_copy("copy.7bc2840ca04d", { defaultValue: "View anyway" })}
      onReveal={onReveal}
      className={className}
    />
  );
}
