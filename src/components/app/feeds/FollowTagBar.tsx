import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hash, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export const FOLLOWED_TAGS_QUERY_KEY = ['followed-tags'] as const;

/**
 * Shown above the home feed while it is narrowed to one hashtag — where a
 * tapped #tag lands. Follow brings the tag's posts into the Following feed
 * beside the people you follow (Mastodon's tag follows); the server does the
 * mixing, this only keeps the list.
 */
export function FollowTagBar({ tag, onClear, className }: { tag: string; onClear: () => void; className?: string }) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const name = tag.replace(/^#+/, '').toLowerCase();

  const { data: followed = [] } = useQuery({
    queryKey: FOLLOWED_TAGS_QUERY_KEY,
    queryFn: async () => (await import('@/lib/api/dehub/followed-tags')).getFollowedTags(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
  const following = followed.includes(name);

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      const api = await import('@/lib/api/dehub/followed-tags');
      if (next) await api.followTag(name);
      else await api.unfollowTag(name);
      return next;
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: FOLLOWED_TAGS_QUERY_KEY });
      const prev = queryClient.getQueryData<string[]>(FOLLOWED_TAGS_QUERY_KEY);
      queryClient.setQueryData<string[]>(FOLLOWED_TAGS_QUERY_KEY, (old = []) =>
        next ? Array.from(new Set([...old, name])) : old.filter((x) => x !== name),
      );
      return { prev };
    },
    onSuccess: (next) => {
      toast.success(t(next ? 'followedTags.followed' : 'followedTags.unfollowed', { tag: name }));
      // The Following feed changes with the list.
      queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
    },
    onError: (_err, _next, context) => {
      if (context?.prev) queryClient.setQueryData(FOLLOWED_TAGS_QUERY_KEY, context.prev);
      toast.error(t('followedTags.failed'));
    },
  });

  // One chip on the right holds both actions, so the ✕ lives inside it.
  // Bar is rounded-xl (12px) with a 6px inset around the chip, so the chip
  // takes 12 - 6 = 6px corners (rounded-md) and sits evenly on every side.
  const chipTone = following
    ? 'border border-white/20 text-white'
    : 'bg-white text-black';
  const chipHover = following ? 'hover:bg-white/10' : 'hover:bg-zinc-200';

  return (
    <div
      data-follow-tag-bar
      className={cn(
        'flex items-center gap-3 rounded-xl border border-white/10 bg-black/80 backdrop-blur-xl py-1.5 pl-3 pr-1.5',
        className,
      )}
    >
      <Hash className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{name}</span>
      <div
        className={cn(
          'flex h-7 shrink-0 items-stretch overflow-hidden rounded-md text-xs font-semibold',
          isAuthenticated ? chipTone : 'border border-white/20 text-zinc-300',
        )}
      >
        {isAuthenticated && (
          <button
            type="button"
            onClick={() => mutation.mutate(!following)}
            disabled={mutation.isPending}
            aria-pressed={following}
            aria-label={following ? t('followedTags.unfollow', { tag: name }) : t('followedTags.follow', { tag: name })}
            className={cn('flex items-center pl-3 pr-2 transition-colors disabled:opacity-60', chipHover)}
          >
            {following ? t('followedTags.following') : t('followedTags.follow', { tag: name })}
          </button>
        )}
        <button
          type="button"
          onClick={onClear}
          aria-label={t('followedTags.clear')}
          className={cn(
            'flex items-center justify-center transition-colors',
            isAuthenticated ? cn('pl-1.5 pr-2', chipHover) : 'px-2 hover:bg-white/10 hover:text-white',
          )}
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
