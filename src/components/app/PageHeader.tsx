import { ArrowLeft } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

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

  /**
   * Handle back navigation with fallback
   * - If history exists (location.key !== 'default'), use navigate(-1)
   * - Otherwise, navigate to fallback route (handles direct URL access)
   */
  const handleBack = () => {
    // location.key will be 'default' only when there's no history
    // This is more reliable than window.history.length which can include entries
    // from before the app was loaded
    if (location.key && location.key !== 'default') {
      navigate(-1);
    } else {
      navigate(fallbackRoute, { replace: true });
    }
  };

  return (
    <div className={cn(
      'sticky top-0 bg-black z-50 p-3 sm:p-4',
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
