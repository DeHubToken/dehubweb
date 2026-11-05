/**
 * Glass rails for long videos on wide screens (lib/wide-video-mode).
 *
 * Two panels side by side: the picture at its real shape, and this one glass
 * panel beside it. The panel reads top to bottom like the post itself: who
 * posted it, what it is, then the top comments and a way in to comment. No
 * fill behind either panel. Comments load only for a video that has some.
 */
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getNFTCommentPage } from '@/lib/api/dehub/comments';
import type { VideoItem } from '@/types/feed.types';

export function WideVideoPanel({ video, onOpenComments }: { video: VideoItem; onOpenComments: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const handle = video.creatorUsername?.replace(/^@/, '');
  const openProfile = () => {
    if (handle) navigate(`/${handle}`);
    else if (video.creatorId) navigate(`/app/profile?id=${video.creatorId}`);
  };
  const stats = [video.views, video.uploadedAgo, video.duration].filter(Boolean).join(' · ');
  const tokenId = video.id;
  const count = Number(video.commentCount ?? 0) || 0;
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
        <button type="button" onClick={openProfile} className="flex min-w-0 items-center gap-3 text-left">
          <Avatar className="h-10 w-10 shrink-0 rounded-full">
            {video.channelAvatar && <AvatarImage src={video.channelAvatar} className="rounded-full" />}
            <AvatarFallback className="rounded-full bg-zinc-700 text-xs font-medium text-white">{video.channel?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-bold">{video.channel}</span>
            {handle && <span className="block truncate text-[12.5px] text-white/60">@{handle}</span>}
          </span>
        </button>
        {video.title && <h3 className="line-clamp-3 break-words text-[17px] font-bold leading-snug">{video.title}</h3>}
        {stats && <p className="text-[12.5px] text-white/60">{stats}</p>}
      </div>

      <div className="mx-4 h-px bg-white/[0.08]" />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/60">{t('wideVideo.comments', 'Comments')}</span>
          {count > 0 && <span className="text-[12px] tabular-nums text-white/60">{count}</span>}
        </div>
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
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onOpenComments(); }}
          className="w-full rounded-xl border border-white/[0.1] bg-white/[0.06] px-3 py-2.5 text-left text-[13px] text-white/70 transition-colors hover:bg-white/[0.1] hover:text-white"
        >
          {t('wideVideo.addComment', 'Add a comment')}
        </button>
      </div>
    </aside>
  );
}
