/**
 * Comment Likers Drawer
 * =====================
 * Who liked a comment or reply. Opened by the comment's author tapping the
 * like button on their own comment — you can't like your own, so that button
 * is the door to this list instead.
 *
 * AUTHOR-ONLY, ON BOTH SIDES
 * The client only routes the author here, but the gate that matters is the
 * server's: /api/comment-likers returns an empty list with
 * `canViewLikers: false` to anyone who didn't write the comment. So an empty
 * `data` is ambiguous on its own — always read `canViewLikers` before
 * rendering "no likes yet".
 *
 * Same middle-column clipping trick as ReactionInfoDrawer: on desktop the
 * sheet pins to the feed column via `--app-main-left` / `--app-main-width` so
 * it reads as part of the post, and falls back to a full-width bottom sheet
 * below 768px.
 */

import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Loader2, ThumbsUp } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getCommentLikers, type CommentLiker } from '@/lib/api/dehub';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

interface CommentLikersDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null while no comment is selected — the query stays disabled. */
  commentId: string | null;
}

export function CommentLikersDrawer({ open, onOpenChange, commentId }: CommentLikersDrawerProps) {
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['comment-likers', commentId],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await getCommentLikers(commentId!, pageParam, PAGE_SIZE);
      return { ...response, page: pageParam };
    },
    getNextPageParam: (lastPage) => (lastPage.pagination?.hasMore ? lastPage.page + 1 : undefined),
    initialPageParam: 0,
    enabled: open && !!commentId,
    staleTime: 1000 * 30,
  });

  const firstPage = data?.pages?.[0];
  const canView = firstPage?.canViewLikers !== false;
  const rows = useMemo(() => data?.pages.flatMap((page) => page.data ?? []) ?? [], [data]);
  const totalCount = firstPage?.pagination?.totalCount ?? 0;

  const goToProfile = (person: CommentLiker) => {
    onOpenChange(false);
    if (person.username) navigate(`/${person.username.replace('@', '')}`);
    else if (person.address) navigate(`/app/profile?id=${person.address}`);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        data-comment-likers-drawer
        className={cn(
          'bg-black/60 backdrop-blur-2xl saturate-[180%] border border-white/10 border-b-0 p-0 gap-0 rounded-t-2xl overflow-hidden z-[200] flex flex-col max-h-[80dvh]',
          !isMobile && 'left-[var(--app-main-left,0px)] right-auto w-[var(--app-main-width,100vw)]',
        )}
      >
        <DrawerHeader className="px-5 pt-4 pb-3 shrink-0">
          <DrawerTitle className="text-base font-medium text-white text-center flex items-center justify-center gap-2">
            <ThumbsUp aria-hidden="true" className="w-4 h-4" />
            Likes
            <span className="text-white/40 font-normal">· {totalCount}</span>
          </DrawerTitle>
        </DrawerHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
            </div>
          ) : !canView ? (
            <p className="text-zinc-500 text-sm text-center py-10">
              Only the author can see who liked a comment.
            </p>
          ) : rows.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-10">No likes yet.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((person) => {
                const displayName =
                  person.displayName || person.username || person.address?.slice(0, 8) || 'Unknown';
                const avatarUrl = buildAvatarUrl(person.address, extractAvatarPath(person));
                return (
                  <button
                    key={person.address}
                    onClick={() => goToProfile(person)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
                  >
                    <Avatar className="w-10 h-10 rounded-lg">
                      {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                      <AvatarFallback className="bg-zinc-800 text-white rounded-lg text-sm">
                        {displayName[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-white text-sm truncate block">
                        {displayName}
                      </span>
                      {person.username && (
                        <span className="text-zinc-500 text-xs truncate block">
                          @{person.username.replace('@', '')}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}

              {hasNextPage && (
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
                >
                  {isFetchingNextPage ? 'Loading…' : 'Load more'}
                </button>
              )}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default CommentLikersDrawer;
