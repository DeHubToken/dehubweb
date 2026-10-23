import type { MouseEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { liveTargetPath, useLiveTarget } from '@/hooks/use-live-creators';
import '@/styles/live-ripple.css';

interface LiveRippleProps {
  children: ReactNode;
  /** Wallet address and/or username of the person in the avatar. */
  ids?: Array<string | null | undefined>;
  /** Skip the lookup when the caller already knows (a live stream row, a Stage). */
  live?: boolean;
  /**
   * Ring weight: 'sm' under 32px, 'lg' for the profile page avatar, which
   * gets a quieter ripple (one thin outline that barely leaves the edge).
   */
  size?: 'sm' | 'md' | 'lg';
  /** Must carry the avatar's own rounded-* class so the ripple matches its shape. */
  className?: string;
}

/**
 * Wraps an avatar and, while that person is broadcasting, sends outlines of
 * its shape rippling outward behind it. Renders the avatar untouched when
 * they are not live.
 *
 * While they are live, a tap on the avatar opens their stream (or Stage)
 * instead of whatever the avatar normally does: the click is caught on the
 * way down, so the profile button around or inside it never sees it.
 */
export function LiveRipple({ children, ids = [], live, size = 'md', className }: LiveRippleProps) {
  const target = useLiveTarget(...ids);
  const isLive = live ?? target !== null;
  const navigate = useNavigate();
  const path = isLive && target ? liveTargetPath(target) : null;
  const opensLive = !!path;

  const openLive = (event: MouseEvent) => {
    // Already watching it (the live page's own header): leave the tap alone.
    if (!path || window.location.pathname === path) return;
    event.preventDefault();
    event.stopPropagation();
    navigate(path, { state: { fromFeed: true } });
  };

  // align-top: an inline box sits on the text baseline, so around a photo
  // (which has no baseline) the line grew by a descender and pushed the
  // avatar's button taller than the avatar, dropping the name beside it.
  return (
    <span
      data-live-ripple={isLive ? size : undefined}
      onClickCapture={opensLive ? openLive : undefined}
      className={cn('inline-flex shrink-0 align-top', opensLive && 'cursor-pointer', className)}
    >
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
