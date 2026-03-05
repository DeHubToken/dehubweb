import { Menu, Bell } from 'lucide-react';
import { MockAvatar } from './MockAvatar';

interface MobileTopBarProps {
  title?: string;
  showAvatar?: boolean;
  showNotification?: boolean;
}

export function MobileTopBar({ title = 'DeHub', showAvatar = true, showNotification = true }: MobileTopBarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-black/80 backdrop-blur-xl sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <Menu className="w-5 h-5 text-white" />
        {showAvatar && <MockAvatar name="You" size="sm" />}
      </div>
      <span className="text-white text-base font-bold">{title}</span>
      <div className="flex items-center gap-3">
        {showNotification && (
          <div className="relative">
            <Bell className="w-5 h-5 text-white" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500" />
          </div>
        )}
      </div>
    </div>
  );
}
