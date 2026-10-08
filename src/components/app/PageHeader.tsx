import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  className?: string;
  /** Optional className for the inner bar, e.g. to constrain width to match content below */
  innerClassName?: string;
  /** Optional right-side actions aligned to the end of the bar */
  rightActions?: ReactNode;
  /** Optional themed page identity icon shown before the title. */
  icon?: ReactNode;
  /** Fallback route when no history exists (e.g., direct URL access) */
  fallbackRoute?: string;
  /** Override the back action (e.g., to close a drawer with animation before navigating) */
  onBack?: () => void;
  /** Float the controls over the page without reserving a title row. */
  overlay?: boolean;
}

export function PageHeader({
  title,
  subtitle,
  showBack = true,
  className,
  innerClassName,
  rightActions,
  icon,
  fallbackRoute = '/app',
  onBack,
  overlay = false,
}: PageHeaderProps) {
  const navigate = useNavigate();
  const { isCollapsed } = useSidebarCollapse();
  const { theme } = useAppTheme();

  /**
   * Handle back navigation with fallback
   * - If onBack is provided, use it (e.g. to close a drawer with animation)
   * - If the router has a previous entry, use navigate(-1)
   * - Otherwise, navigate to fallback route (handles direct URL access)
   */
  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    // Replacing a direct wallet URL with its username creates a location key
    // without adding a previous page. Only a positive router index can go back.
    if (typeof window.history.state?.idx === 'number' && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate(fallbackRoute, { replace: true });
    }
  };

  if (overlay || theme === 'system') {
    return (
      <div className={cn(
        'z-40 flex items-center justify-between pointer-events-none',
        overlay ? 'absolute top-2 left-2 right-2' : 'sticky top-0 px-3 py-2',
        className,
      )}>
        {showBack ? (
          <button
            onClick={handleBack}
            data-on-media={overlay ? '' : undefined}
            className="pointer-events-auto h-9 w-9 rounded-xl bg-black/50 backdrop-blur-[24px] border border-white/10 hover:bg-black/60 transition-colors flex items-center justify-center"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
        ) : <span />}
        {(title || subtitle) && <span className="sr-only">{title} {subtitle}</span>}
        {rightActions && <div className="pointer-events-auto flex items-center gap-2">{rightActions}</div>}
      </div>
    );
  }

  return (
    <div className={cn(
      'sticky z-40 px-3 pt-0 pb-3 sm:px-0 sm:pt-3 sm:pb-3',
      isCollapsed ? 'top-0 lg:top-12' : 'top-0',
      className
    )}>
      <div className={cn(
        'flex items-center gap-3 rounded-2xl bg-black/60 backdrop-blur-[24px] saturate-[180%] px-3 py-2',
        innerClassName
      )}>
        {showBack && (
          <button
            onClick={handleBack}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
        )}
        {icon && (
          <span className="flex size-10 shrink-0 items-center justify-center">
            {icon}
          </span>
        )}
        {(title || subtitle) && (
          <div className="min-w-0 flex-1">
            {title && <h1 className="font-bold text-white truncate">{title}</h1>}
            {subtitle && (
              <p className="text-zinc-500 text-sm truncate">{subtitle}</p>
            )}
          </div>
        )}
        {rightActions && (
          <div className="flex items-center gap-2 shrink-0">
            {rightActions}
          </div>
        )}
      </div>
    </div>

  );
}
