import { ArrowLeft } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';

interface PageHeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  className?: string;
  /** Optional className for the inner bar, e.g. to constrain width to match content below */
  innerClassName?: string;
  /** Optional right-side actions aligned to the end of the bar */
  rightActions?: React.ReactNode;
  /** Fallback route when no history exists (e.g., direct URL access) */
  fallbackRoute?: string;
  /** Override the back action (e.g., to close a drawer with animation before navigating) */
  onBack?: () => void;
}

export function PageHeader({
  title,
  subtitle,
  showBack = true,
  className,
  fallbackRoute = '/app',
  onBack,
}: PageHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isCollapsed } = useSidebarCollapse();

  /**
   * Handle back navigation with fallback
   * - If onBack is provided, use it (e.g. to close a drawer with animation)
   * - If history exists (location.key !== 'default'), use navigate(-1)
   * - Otherwise, navigate to fallback route (handles direct URL access)
   */
  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (location.key && location.key !== 'default') {
      navigate(-1);
    } else {
      navigate(fallbackRoute, { replace: true });
    }
  };

  return (
    <div className={cn(
      'sticky z-40 px-3 pt-0 pb-3 sm:px-0 sm:pt-3 sm:pb-3',
      isCollapsed ? 'top-0 lg:top-12' : 'top-0',
      className
    )}>
      <div className="flex items-center gap-3 rounded-2xl bg-black/60 backdrop-blur-[24px] saturate-[180%] border border-white/10 px-3 py-2">
        {showBack && (
          <button
            onClick={handleBack}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
        )}
        {(title || subtitle) && (
          <div className="min-w-0">
            {title && <h1 className="font-bold text-white truncate">{title}</h1>}
            {subtitle && (
              <p className="text-zinc-500 text-sm truncate">{subtitle}</p>
            )}
          </div>
        )}
      </div>
    </div>

  );
}
