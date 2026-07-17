import { cn } from '@/lib/utils';

interface MockAvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const COLORS = [
  'bg-zinc-700', 'bg-zinc-600', 'bg-zinc-500',
  'bg-zinc-800', 'bg-zinc-650',
];

export function MockAvatar({ name, size = 'md', className }: MockAvatarProps) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-lg',
    xl: 'w-20 h-20 text-2xl',
  };

  const colorIndex = name.charCodeAt(0) % COLORS.length;

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center text-white font-bold flex-shrink-0',
        COLORS[colorIndex],
        sizeClasses[size],
        className
      )}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
