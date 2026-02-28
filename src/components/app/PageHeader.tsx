import { ArrowLeft } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';

interface PageHeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  className?: string;
  /** Fallback route when no history exists (e.g., direct URL access) */
  fallbackRoute?: string;
}

export function PageHeader({ 
  title, 
  subtitle, 
  showBack = true, 
  className,
  fallbackRoute = '/app'
}: PageHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isCollapsed } = useSidebarCollapse();

  /**
   * Handle back navigation with fallback
   * - If history exists (location.key !== 'default'), use navigate(-1)
   * - Otherwise, navigate to fallback route (handles direct URL access)
   */
  const handleBack = () => {
    if (location.key && location.key !== 'default') {
      navigate(-1);
    } else {
      navigate(fallbackRoute, { replace: true });
    }
  };

  return (
    <div className={cn(
      'sticky bg-black z-40 px-3 pt-0 pb-3 sm:p-4',
      isCollapsed ? 'top-0 lg:top-12' : 'top-0',
      className
    )}>
      <div className="flex items-center gap-3">
        {showBack && (
          <button
            onClick={handleBack}
            className="p-2 rounded-xl hover:bg-zinc-800 transition-colors"
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
