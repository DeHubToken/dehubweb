/**
 * Glass rails for long videos on wide screens (lib/wide-video-mode).
 *
 * Two pills beside a tall or square picture: who posted it and what it is on
 * the left, the top comments on the right. No fill behind them: the pills and
 * the curved picture between them are the whole look. Comments load only once
 * the rails are on screen for a video that has some.
 */
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getNFTCommentPage } from '@/lib/api/dehub/comments';
import type { VideoItem } from '@/types/feed.types';

const PILL = 'flex min-w-0 flex-1 basis-0 flex-col gap-3 overflow-hidden rounded-2xl border border-white/[0.12] bg-black/40 p-4 text-white backdrop-blur-[24px] backdrop-saturate-[160%] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]';

export function WideVideoInfoRail({ video }: { video: VideoItem }) {
  const navigate = useNavigate();
  const handle = video.creatorUsername?.replace(/^@/, '');
  const openProfile = () => {
    if (handle) navigate(`/${handle}`);
    else if (video.creatorId) navigate(`/app/profile?id=${video.creatorId}`);
  };
  const stats = [video.views, video.uploadedAgo].filter(Boolean).join(' · ');
  return (
    <aside data-wide-rail="info" data-no-navigate className={PILL}>
      <button type="button" onClick={openProfile} className="flex min-w-0 items-center gap-2.5 text-left">
        <Avatar className="h-9 w-9 shrink-0 rounded-full">
          {video.channelAvatar && <AvatarImage src={video.channelAvatar} className="rounded-full" />}
          <AvatarFallback className="rounded-full bg-zinc-700 text-xs font-medium text-white">{video.channel?.[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-bold">{video.channel}</span>
          {handle && <span className="block truncate text-[12px] text-white/60">@{handle}</span>}
        </span>
      </button>
      {video.title && <h3 className="line-clamp-4 break-words text-[16px] font-bold leading-snug">{video.title}</h3>}
      {stats && <p className="text-[12px] text-white/60">{stats}{video.duration ? ` · ${video.duration}` : ''}</p>}
      {video.description && video.description !== video.title && (
        <p className="line-clamp-6 break-words text-[13px] leading-relaxed text-white/80">{video.description}</p>
      )}
    </aside>
  );
}

export function WideVideoCommentsRail({ video, onOpenComments }: { video: VideoItem; onOpenComments: () => void }) {
  const { t } = useTranslation();
  const tokenId = video.id;
  const count = Number(video.commentCount ?? 0) || 0;
  const { data } = useQuery({
    queryKey: ['wide-rail-comments', tokenId],
    queryFn: () => getNFTCommentPage(tokenId, 0, 3),
    enabled: count > 0 && Number(tokenId) > 0,
    staleTime: 60_000,
  });
  const rows = (data?.items ?? []).filter((row) => !row.notFound && row.content && row.parentId == null).slice(0, 3);
  return (
    <aside data-wide-rail="comments" data-no-navigate className={PILL}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/60">{t('wideVideo.comments', 'Comments')}</span>
        {count > 0 && <span className="text-[12px] text-white/60">{count}</span>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        {rows.map((row) => {
          const name = row.writor?.displayName || row.writor?.username || '';
          return (
            <div key={row.id} className="flex min-w-0 gap-2 text-[13px] leading-snug">
              <Avatar className="h-6 w-6 shrink-0 rounded-full">
                {row.writor?.avatarUrl && <AvatarImage src={row.writor.avatarUrl} className="rounded-full" />}
                <AvatarFallback className="rounded-full bg-zinc-700 text-[10px] text-white">{name[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <p className="line-clamp-3 min-w-0 break-words"><b className="mr-1 font-bold">{name}</b>{row.content}</p>
            </div>
          );
        })}
        {count === 0 && <p className="text-[13px] text-white/60">{t('wideVideo.noComments', 'No comments yet')}</p>}
      </div>
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); onOpenComments(); }}
        className="rounded-xl border border-white/[0.1] bg-black/20 px-3 py-2.5 text-left text-[13px] text-white/70 transition-colors hover:bg-black/30 hover:text-white"
      >
        {t('wideVideo.addComment', 'Add a comment')}
      </button>
    </aside>
  );
}
