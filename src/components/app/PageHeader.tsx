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
    // 'default' key means this is the first entry (no history to go back to)
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      // Direct URL access - go to fallback route instead
      navigate(fallbackRoute, { replace: true });
    }
  };

  return (
    <div className={cn(
      'sticky top-0 bg-black/80 backdrop-blur-sm z-10 p-3 sm:p-4',
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
