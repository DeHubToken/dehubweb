import { useTranslation as _useCopy } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  name: string;
  handle: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
};

export function UserAvatar({ name, avatarUrl, size = 'md', className }: UserAvatarProps) {
  const { t: _copy } = _useCopy();
  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={_copy("copy.f66ca816cb1e", { defaultValue: "{{value1}}'s avatar", value1: name })} />}
      <AvatarFallback className="bg-zinc-700 text-white font-medium">
        {name.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
