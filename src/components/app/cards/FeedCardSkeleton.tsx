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
        'rounded-2xl border border-white/[0.12] bg-white/[0.03] p-3 pb-6',
        className
      )}
      aria-hidden="true"
    >
      {/* Measured from the real card (412px phone): 44px header row with a
          36px avatar, media straight after it, then a 12px gap, a 23px
          caption line, the 16px time/views row and the 25px action row. */}
      <div className="home-skeleton-header flex items-start gap-3 h-11">
        <div className="home-skeleton-block w-9 h-9 rounded-md shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
          <div className="home-skeleton-block h-3.5 w-32 max-w-[70%] rounded" />
          <div className="home-skeleton-block h-3 w-20 max-w-[50%] rounded" />
        </div>
        <div className="home-skeleton-block w-1 h-4 mr-2 mt-1 rounded shrink-0" />
      </div>
      {variant !== 'text' && (
        <div data-media-full className={cn(
          'home-skeleton-block home-skeleton-media w-full rounded-2xl',
          variant === 'video' ? 'aspect-video' : 'aspect-[3/4]',
        )} />
      )}
      <div className={cn('home-skeleton-caption space-y-2', variant === 'text' ? 'pt-1' : 'pt-3')}>
        <div className="h-[23px] mt-1 flex items-center"><div className="home-skeleton-block h-3.5 w-[80%] rounded" /></div>
        {variant === 'text' && <div className="h-[23px] -mt-2 flex items-center"><div className="home-skeleton-block h-3.5 w-[60%] rounded" /></div>}
        <div className="h-4 flex items-center gap-3">
          <div className="home-skeleton-block h-3 w-8 rounded" />
          <div className="home-skeleton-block h-3 w-8 rounded" />
        </div>
        <div className="home-skeleton-actions h-[25px] flex items-center justify-between">
          {[0, 1, 2, 3].map(i => <div key={i} className="home-skeleton-block h-5 w-9 rounded-md" />)}
          <div className="flex gap-3"><div className="home-skeleton-block h-5 w-5 rounded-md" /><div className="home-skeleton-block h-5 w-5 rounded-md" /></div>
        </div>
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
