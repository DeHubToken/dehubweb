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

  // Show up to 3 names
  const displayed = mutuals.slice(0, 3);
  const remaining = mutuals.length - displayed.length;

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

  return (
    <div className="flex items-center gap-2 mt-2">
      {/* Stacked avatars */}
      <div className="flex -space-x-2">
        {displayed.map((item) => {
          const url = getAvatarUrl(item);
          return (
            <Avatar
              key={item.address}
              className="w-5 h-5 !rounded-[2px] border border-zinc-900 cursor-pointer"
              onClick={() => handleNavigate(item)}
            >
              {url && <AvatarImage src={url} alt={getDisplayName(item)} className="!rounded-[2px]" />}
              <AvatarFallback className="bg-zinc-700 text-white text-[8px] font-medium">
                {(item.username || item.displayName || item.address).charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          );
        })}
      </div>

      {/* Text */}
      <p className="text-zinc-500 text-xs leading-tight">
        {/* Shown without the words: the faces and names already say it. */}
        <span className="sr-only">{_copy("copy.d0f08798ff1a", { defaultValue: "Followed by " })}</span>
        {displayed.map((item, i) => (
          <span key={item.address}>
            <button
              onClick={() => handleNavigate(item)}
              className="text-zinc-300 font-medium hover:underline"
            >
              {getDisplayName(item)}
            </button>
            {i < displayed.length - 1 && (remaining > 0 || i < displayed.length - 2) && ', '}
            {i === displayed.length - 2 && remaining === 0 && _copy("copy.e3ee915a8e8c", { defaultValue: " and " })}
          </span>
        ))}
        {remaining > 0 && <span> +{remaining}</span>}
      </p>
    </div>
  );
}
