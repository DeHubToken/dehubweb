import { cn } from '@/lib/utils';
import '@/styles/home-skeleton.css';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';

interface FeedCardSkeletonProps {
  variant?: 'video' | 'image' | 'text';
  first?: boolean;
  className?: string;
}

/** The same header, media, caption and action order as Home's feed cards. */
export function FeedCardSkeleton({ variant = 'video', first = false, className }: FeedCardSkeletonProps) {
  return (
    <div
      data-feed-item
      data-home-skeleton-card={variant}
      data-skeleton-first={first || undefined}
      className={cn(
        'rounded-2xl border border-white/[0.12] bg-white/[0.03] p-3',
        className
      )}
      aria-hidden="true"
    >
      <div className="home-skeleton-header flex items-start gap-2 mb-3">
        <div className="home-skeleton-block w-9 h-9 rounded-md shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
          <div className="home-skeleton-block h-3.5 w-32 max-w-[70%] rounded" />
          <div className="home-skeleton-block h-3 w-20 max-w-[50%] rounded" />
        </div>
        <div className="home-skeleton-block w-5 h-5 rounded shrink-0" />
      </div>
      {variant !== 'text' && (
        <div data-media-full className={cn(
          'home-skeleton-block home-skeleton-media w-full rounded-xl mb-3',
          variant === 'video' ? 'aspect-video' : 'aspect-[4/3]',
        )} />
      )}
      <div className="home-skeleton-caption space-y-2 mb-3">
        <div className="home-skeleton-block h-3.5 w-[85%] rounded" />
        <div className="home-skeleton-block h-3 w-[60%] rounded" />
        {variant === 'text' && <div className="home-skeleton-block h-3 w-[72%] rounded" />}
        <div className="home-skeleton-block h-2.5 w-24 rounded" />
      </div>
      <div className="home-skeleton-actions flex items-center gap-3">
        <div className="home-skeleton-block h-8 w-8 rounded-xl" />
        <div className="home-skeleton-block h-8 w-8 rounded-xl" />
        <div className="home-skeleton-block h-8 w-12 rounded-xl" />
        <div className="home-skeleton-block ml-auto h-8 w-16 rounded-xl" />
      </div>
    </div>
  );
}

export function FeedCardSkeletonList({ count = 6, columns }: { count?: number; columns?: number }) {
  const { isCollapsed } = useSidebarCollapse();
  const cols = columns ?? (isCollapsed ? 3 : 1);
  const pattern = ['video', 'image', 'text'] as const;
  return (
    <div data-home-skeleton-list aria-hidden="true" style={{ columnCount: cols, columnGap: '0.75rem' }}>
      {Array.from({ length: count }, (_, i) => (
        <FeedCardSkeleton key={i} first={i === 0} variant={pattern[i % pattern.length]} className="mb-3 break-inside-avoid" />
      ))}
    </div>
  );
}
