/**
 * Glass rails for long videos on wide screens (lib/wide-video-mode).
 *
 * Two panels side by side: the picture at its real shape, and this one glass
 * panel beside it. The post header above already shows who posted it and the
 * action bar below already has like, comment, tip and share, so the panel
 * holds only what is new: the title and description, a Follow button, then
 * the top comments and a comment box. Comments load only for a video
 * that has some; follow state loads only for a signed-in viewer.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getNFTCommentPage, postComment } from '@/lib/api/dehub/comments';
import { isFollowing as checkIsFollowing } from '@/lib/api/dehub';
import { useFollow } from '@/hooks/use-follow';
import type { VideoItem } from '@/types/feed.types';

function RailFollowButton({ video, walletAddress, onLogin }: { video: VideoItem; walletAddress?: string | null; onLogin: () => void }) {
  const { t } = useTranslation();
  const address = video.creatorId;
  const { isFollowing: override, toggleFollow, isPending } = useFollow(address);
  const [checked, setChecked] = useState<boolean | null>(null);
  useEffect(() => {
    if (!walletAddress || !address || override !== undefined) return;
    let cancelled = false;
    checkIsFollowing(address).then((res) => { if (!cancelled) setChecked(!!res); }).catch(() => {});
    return () => { cancelled = true; };
  }, [walletAddress, address, override]);
  const following = !!(override ?? checked);
  if (!address) return null;
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={(event) => {
        event.stopPropagation();
        if (!walletAddress) { onLogin(); return; }
        toggleFollow(following, { name: video.channel || video.creatorUsername || undefined });
      }}
      className={following
        ? 'h-10 w-full rounded-xl border border-white/[0.14] bg-white/[0.06] text-[13.5px] font-bold text-white/85 transition-colors hover:bg-white/[0.1]'
        : 'h-10 w-full rounded-xl bg-gradient-to-b from-white to-[#c9cbd0] text-[13.5px] font-bold text-zinc-900 shadow-[inset_0_1px_0_#fff,0_1px_2px_rgba(0,0,0,0.4)] transition-[filter] hover:brightness-105'}
    >
      {following ? t('wideVideo.following', 'Following') : t('wideVideo.follow', 'Follow')}
    </button>
  );
}


/**
 * The same comment box as the comments section, text only: it grows as you
 * type, Enter posts and Shift+Enter adds a line. Posting refreshes the
 * panel's comments and the full comments list.
 */
function RailCommentBox({ tokenId, walletAddress, onLogin, onPosted }: { tokenId: string; walletAddress?: string | null; onLogin: () => void; onPosted: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };
  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    if (!walletAddress) { onLogin(); return; }
    setSending(true);
    try {
      await postComment(tokenId, body);
      setText('');
      requestAnimationFrame(fit);
      onPosted();
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['wide-rail-comments', tokenId] }),
        queryClient.invalidateQueries({ queryKey: ['comments', tokenId] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t('toasts.failed_to_post_comment', 'Could not post your comment'));
    } finally {
      setSending(false);
    }
  };
  const ready = !!text.trim() && !sending;
  return (
    <div
      className="flex items-end gap-1.5 rounded-xl border border-white/[0.12] bg-white/[0.08] py-1.5 pl-3 pr-1.5 backdrop-blur-xl"
      onClick={(event) => event.stopPropagation()}
    >
      <textarea
        ref={ref}
        rows={1}
        value={text}
        disabled={sending}
        placeholder={t('comments.composerPlaceholder', 'Add a comment...')}
        onFocus={() => { if (!walletAddress) { ref.current?.blur(); onLogin(); } }}
        onChange={(event) => { setText(event.target.value); fit(); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void send();
          }
        }}
        className="max-h-[140px] min-h-[28px] w-full min-w-0 resize-none bg-transparent py-1 text-sm leading-5 text-white placeholder:text-zinc-500 focus:outline-none"
      />
      <button
        type="button"
        disabled={!ready}
        onClick={() => void send()}
        className="h-7 shrink-0 rounded-lg bg-white px-3 text-[12.5px] font-bold text-zinc-900 transition-opacity disabled:opacity-30"
      >
        {t('comments.post', 'Post')}
      </button>
    </div>
  );
}

export function WideVideoPanel({ video, onOpenComments, walletAddress, onLogin, isOwnPost, hideCaption }: {
  video: VideoItem;
  onOpenComments: () => void;
  walletAddress?: string | null;
  onLogin: () => void;
  isOwnPost?: boolean;
  /** Behind a content warning the caption stays closed, same as under the card. */
  hideCaption?: boolean;
}) {
  const { t } = useTranslation();
  const description = (video.description ?? '').trim();
  const tokenId = video.id;
  const [posted, setPosted] = useState(0);
  const count = (Number(video.commentCount ?? 0) || 0) + posted;
  const { data } = useQuery({
    queryKey: ['wide-rail-comments', tokenId],
    queryFn: () => getNFTCommentPage(tokenId, 0, 4),
    enabled: count > 0 && Number(tokenId) > 0,
    staleTime: 60_000,
  });
  const rows = (data?.items ?? []).filter((row) => !row.notFound && row.content && row.parentId == null).slice(0, 4);

  return (
    <aside
      data-wide-rail
      data-no-navigate
      className="flex min-w-[260px] flex-1 basis-0 flex-col overflow-hidden rounded-2xl border border-white/[0.12] bg-black/40 text-white backdrop-blur-[24px] backdrop-saturate-[160%] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]"
    >
      <div className="flex flex-col gap-3 p-4">
        {!hideCaption && video.title && <h3 className="line-clamp-3 break-words text-[17px] font-bold leading-snug">{video.title}</h3>}
        {!hideCaption && description && description !== video.title && (
          <p className="line-clamp-4 whitespace-pre-line break-words text-[13.5px] leading-relaxed text-white/80">{description}</p>
        )}
        {!isOwnPost && <RailFollowButton video={video} walletAddress={walletAddress} onLogin={onLogin} />}
      </div>

      <div className="mx-4 h-px bg-white/[0.08]" />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onOpenComments(); }}
          className="flex items-baseline justify-between gap-2 text-left text-white/60 transition-colors hover:text-white"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em]">{t('wideVideo.comments', 'Comments')}</span>
          {count > 0 && <span className="text-[12px] tabular-nums">{count}</span>}
        </button>
        {rows.map((row) => {
          const name = row.writor?.displayName || row.writor?.username || '';
          return (
            <div key={row.id} className="flex min-w-0 gap-2.5 text-[13.5px] leading-snug">
              <Avatar className="h-7 w-7 shrink-0 rounded-full">
                {row.writor?.avatarUrl && <AvatarImage src={row.writor.avatarUrl} className="rounded-full" />}
                <AvatarFallback className="rounded-full bg-zinc-700 text-[10px] text-white">{name[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <p className="line-clamp-3 min-w-0 break-words"><b className="mr-1 font-bold">{name}</b>{row.content}</p>
            </div>
          );
        })}
        {count === 0 && <p className="text-[13px] text-white/60">{t('wideVideo.noComments', 'No comments yet')}</p>}
      </div>

      <div className="p-4 pt-0">
        <RailCommentBox tokenId={tokenId} walletAddress={walletAddress} onLogin={onLogin} onPosted={() => setPosted((n) => n + 1)} />
      </div>
    </aside>
  );
}
