import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  className?: string;
}

export function PageHeader({ title, subtitle, showBack = true, className }: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className={cn(
      'sticky top-[49px] md:top-[52px] lg:top-0 bg-black z-10 p-3 sm:p-4',
      className
    )}>
      <div className="bg-zinc-900 rounded-2xl px-4 py-3 flex items-center gap-4">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-zinc-800 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="font-bold text-white truncate">{title}</h1>
          {subtitle && (
            <p className="text-zinc-500 text-sm truncate">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}
