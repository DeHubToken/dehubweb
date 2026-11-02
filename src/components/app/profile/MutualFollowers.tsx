import { useTranslation as _useCopy } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutualFollowers } from '@/hooks/use-mutual-followers';
import { buildAvatarUrl } from '@/lib/media-url';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface MutualFollowersProps {
  profileAddress: string | undefined;
}

export function MutualFollowers({ profileAddress }: MutualFollowersProps) {
  const { t: _copy } = _useCopy();
  const navigate = useNavigate();
  const { mutuals, isLoading } = useMutualFollowers({ profileAddress });

  if (isLoading || mutuals.length === 0) return null;

  // Faces only: the count tag already says how many.
  const displayed = mutuals.slice(0, 5);

  const getDisplayName = (item: typeof mutuals[0]) =>
    item.username ? `@${item.username}` : item.displayName || `${item.address.slice(0, 6)}...`;

  const getAvatarUrl = (item: typeof mutuals[0]) =>
    buildAvatarUrl(item.address, item.avatarImageUrl || item.avatarUrl);

  const handleNavigate = (item: typeof mutuals[0]) => {
    if (item.username) {
      navigate(`/${item.username}`);
    } else {
      navigate(`/app/profile?id=${item.address}`);
    }
  };

  const count = mutuals.length;
  const countLabel = count === 1
    ? _copy('profile.mutualsOne', { defaultValue: '{{count}} Mutual:', count })
    : _copy('profile.mutualsMany', { defaultValue: '{{count}} Mutuals:', count });

  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-zinc-500 text-xs leading-tight whitespace-nowrap shrink-0">{countLabel}</span>
      {/* Stacked avatars */}
      <div className="flex -space-x-2" aria-label={displayed.map(getDisplayName).join(', ')}>
        {displayed.map((item) => {
          const url = getAvatarUrl(item);
          // The 1px ring leaves a 1px inner corner, so the picture and the
          // letter tile use that, not the primitive's rounded-lg, or the
          // tile's fill/hairline bulges rounder than the ring around it.
          return (
            <Avatar
              key={item.address}
              title={getDisplayName(item)}
              className="w-5 h-5 !rounded-[2px] border border-zinc-900 cursor-pointer"
              onClick={() => handleNavigate(item)}
            >
              {url && <AvatarImage src={url} alt={getDisplayName(item)} className="!rounded-[1px]" />}
              <AvatarFallback className="!rounded-[1px] bg-zinc-700 text-white text-[8px] font-medium">
                {(item.username || item.displayName || item.address).charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          );
        })}
      </div>
    </div>
  );
}
