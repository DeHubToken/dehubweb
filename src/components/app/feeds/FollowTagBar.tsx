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
export function FollowTagBar({ tag, onClear }: { tag: string; onClear: () => void }) {
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

  return (
    <div
      data-follow-tag-bar
      className="mb-3 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
    >
      <Hash className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{name}</span>
      {isAuthenticated && (
        <button
          type="button"
          onClick={() => mutation.mutate(!following)}
          disabled={mutation.isPending}
          aria-pressed={following}
          aria-label={following ? t('followedTags.unfollow', { tag: name }) : t('followedTags.follow', { tag: name })}
          className={cn(
            'shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-60',
            following ? 'border border-white/20 text-white hover:bg-white/10' : 'bg-white text-black hover:bg-zinc-200',
          )}
        >
          {following ? t('followedTags.following') : t('followedTags.follow', { tag: name })}
        </button>
      )}
      <button
        type="button"
        onClick={onClear}
        aria-label={t('followedTags.clear')}
        className="shrink-0 rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
