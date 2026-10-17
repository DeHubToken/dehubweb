import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useIsLive } from '@/hooks/use-live-creators';
import '@/styles/live-ripple.css';

interface LiveRippleProps {
  children: ReactNode;
  /** Wallet address and/or username of the person in the avatar. */
  ids?: Array<string | null | undefined>;
  /** Skip the lookup when the caller already knows (a live stream row, a Stage). */
  live?: boolean;
  /** Ring weight: 'sm' under 32px, 'lg' for profile-sized avatars. */
  size?: 'sm' | 'md' | 'lg';
  /** Must carry the avatar's own rounded-* class so the ripple matches its shape. */
  className?: string;
}

/**
 * Wraps an avatar and, while that person is broadcasting, sends two outlines
 * of its shape rippling outward behind it. Renders the avatar untouched when
 * they are not live.
 */
export function LiveRipple({ children, ids = [], live, size = 'md', className }: LiveRippleProps) {
  const looked = useIsLive(...ids);
  const isLive = live ?? looked;
  return (
    <span data-live-ripple={isLive ? size : undefined} className={cn('inline-flex shrink-0', className)}>
      {isLive && (
        <>
          <span data-live-ripple-ring aria-hidden />
          <span data-live-ripple-ring aria-hidden />
        </>
      )}
      {children}
    </span>
  );
}
