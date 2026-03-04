import { Home, Search, Plus, MessageSquare, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileBottomBarProps {
  active?: 'home' | 'explore' | 'create' | 'messages' | 'ai';
}

export function MobileBottomBar({ active = 'home' }: MobileBottomBarProps) {
  const items = [
    { id: 'home' as const, icon: Home },
    { id: 'messages' as const, icon: MessageSquare },
    { id: 'create' as const, icon: Plus },
    { id: 'explore' as const, icon: Search },
    { id: 'ai' as const, icon: Sparkles },
  ];

  return (
    <div className="sticky bottom-0 left-0 right-0 z-40 px-4 pb-8 pt-2">
      <div className="flex items-center justify-around h-12 rounded-2xl bg-zinc-900/80 backdrop-blur-2xl border border-white/10">
        {items.map((item) => {
          const isCreate = item.id === 'create';
          return (
            <div
              key={item.id}
              className={cn(
                'flex items-center justify-center w-10 h-10',
                isCreate && 'bg-white/[0.08] rounded-xl border border-white/[0.15]'
              )}
            >
              <item.icon
                className={cn(
                  'w-5 h-5 text-white transition-all',
                  active === item.id && !isCreate && 'drop-shadow-[0_0_12px_rgba(255,255,255,0.9)]',
                  item.id === 'explore' && '-scale-x-100'
                )}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
