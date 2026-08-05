/**
 * Reaction Info Drawer
 * ====================
 * Who reacted to a post, and with what — grouped by reaction. Opened from the
 * ⓘ at the end of the reaction tray (hover on desktop, hold on touch).
 *
 * AUTHOR-ONLY, ON BOTH SIDES
 * The ⓘ is only rendered on your own posts, but the gate that matters is the
 * server's: /api/post-likers returns an empty list with `canViewLikers: false`
 * to anyone who doesn't own the post. So an empty `data` is ambiguous on its
 * own — always read `canViewLikers` before rendering "no reactions yet".
 *
 * WHY A DRAWER CLIPPED TO THE MIDDLE COLUMN
 * Same trick as LoginModal: `--app-main-left` / `--app-main-width` pin the
 * sheet to the feed column on desktop so it reads as part of the post rather
 * than a page-wide modal, while the backdrop still covers the full viewport.
 * Below 768px it falls back to the normal full-width bottom sheet.
 */

import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getPostLikers, type PostLiker } from '@/lib/api/dehub';
import { REACTION_LIST, type PostReaction } from '@/lib/reactions';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

interface ReactionInfoDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId: string | number;
}

export function ReactionInfoDrawer({ open, onOpenChange, tokenId }: ReactionInfoDrawerProps) {
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
    queryKey: ['post-reaction-info', String(tokenId)],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await getPostLikers(tokenId, pageParam, PAGE_SIZE);
      return { ...response, page: pageParam };
    },
    getNextPageParam: (lastPage) => (lastPage.pagination?.hasMore ? lastPage.page + 1 : undefined),
    initialPageParam: 0,
    // Only fetch once the sheet is actually open — the ⓘ sits in a tray that
    // opens on hover, and prefetching on every hover would hammer the endpoint.
    enabled: open,
    staleTime: 1000 * 30,
  });

  const firstPage = data?.pages?.[0];
  const canView = firstPage?.canViewLikers !== false;
  const rows = useMemo(() => data?.pages.flatMap((page) => page.data ?? []) ?? [], [data]);
  const totalCount = firstPage?.pagination?.totalCount ?? 0;

  /**
   * Group into taxonomy order. The server already sorts rows this way, so the
   * groups only ever gain members as later pages arrive — nothing reshuffles
   * under a reader who is mid-scroll.
   */
  const groups = useMemo(() => {
    const byReaction = new Map<PostReaction, PostLiker[]>();
    rows.forEach((row) => {
      const key = (row.reaction ?? 'like') as PostReaction;
      const bucket = byReaction.get(key);
      if (bucket) bucket.push(row);
      else byReaction.set(key, [row]);
    });
    return REACTION_LIST.map((meta) => ({
      meta,
      // The tally covers the whole post; `people` is only what has loaded.
      total: firstPage?.reactionCounts?.[meta.key] ?? byReaction.get(meta.key)?.length ?? 0,
      people: byReaction.get(meta.key) ?? [],
    })).filter((group) => group.total > 0 || group.people.length > 0);
  }, [rows, firstPage]);

  const goToProfile = (person: PostLiker) => {
    onOpenChange(false);
    if (person.username) navigate(`/${person.username.replace('@', '')}`);
    else if (person.address) navigate(`/app/profile?id=${person.address}`);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        data-reaction-info-drawer
        className={cn(
          'bg-black/60 backdrop-blur-2xl saturate-[180%] border border-white/10 border-b-0 p-0 gap-0 rounded-t-2xl overflow-hidden z-[200] flex flex-col max-h-[80dvh]',
          !isMobile && 'left-[var(--app-main-left,0px)] right-auto w-[var(--app-main-width,100vw)]',
        )}
      >
        <DrawerHeader className="px-5 pt-4 pb-3 shrink-0">
          <DrawerTitle className="text-base font-medium text-white text-center">
            Reactions
            {totalCount > 0 && <span className="text-white/40 font-normal"> · {totalCount}</span>}
          </DrawerTitle>
        </DrawerHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
            </div>
          ) : !canView ? (
            <p className="text-zinc-500 text-sm text-center py-10">
              Only the author can see who reacted to a post.
            </p>
          ) : groups.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-10">No reactions yet.</p>
          ) : (
            <div className="space-y-5">
              {groups.map(({ meta, total, people }) => (
                <section key={meta.key}>
                  <h3 className="flex items-center gap-2 px-1 pb-2 text-sm text-white/70">
                    <span aria-hidden="true" className="text-base leading-none">{meta.emoji}</span>
                    <span className="font-medium text-white">{meta.label}</span>
                    <span className="text-white/40">{total}</span>
                  </h3>
                  <div className="space-y-2">
                    {people.map((person) => {
                      const displayName =
                        person.displayName || person.username || person.address?.slice(0, 8) || 'Unknown';
                      const avatarUrl = buildAvatarUrl(person.address, extractAvatarPath(person));
                      return (
                        <button
                          key={`${meta.key}-${person.address}`}
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
                  </div>
                </section>
              ))}

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

export default ReactionInfoDrawer;
