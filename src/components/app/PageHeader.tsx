import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  className?: string;
}

export function PageHeader({ title, subtitle, showBack = true, className }: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className={cn(
      'sticky top-0 bg-black/80 backdrop-blur-sm z-10 p-3 sm:p-4',
      className
    )}>
      <div className="flex items-center gap-3">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
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
