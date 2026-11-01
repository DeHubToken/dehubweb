/**
 * Quick Peek
 * ==========
 * The creator taps the view count under their own post and this sheet rises:
 * four numbers against their usual post, the first 48 hours split into members
 * and visitors, the badges that saw it, and a way into the full stats on Post
 * Info. Creator only — /api/post-stats refuses anyone else.
 */

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import Eye from '@/components/ui/cut-icons/visibility';
import Clock from '@/components/ui/cut-icons/clock';
import Save from '@/components/ui/cut-icons/save';
import NewMembers from '@/components/ui/cut-icons/new-members';
import Like from '@/components/ui/cut-icons/like';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { getPostStats } from '@/lib/api/dehub/post-stats';
import { AppState } from '@/components/app/AppState';
import { AreaChart, ChartLegend, SplitBar, StatTile, VsUsual, fmt, fmtDuration } from './stats-parts';
import { BadgeBreakdown } from './BadgeBreakdown';

interface PostStatsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId: string | number;
}

export function usePostStats(tokenId: string | number | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['post-stats', String(tokenId)],
    queryFn: () => getPostStats(tokenId!),
    enabled: enabled && tokenId != null && /^\d+$/.test(String(tokenId)),
    staleTime: 60_000,
    retry: false,
  });
}

export function PostStatsSheet({ open, onOpenChange, tokenId }: PostStatsSheetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, isError } = usePostStats(tokenId, open);

  const hourly = data?.hourly;
  const total = hourly ? hourly.signedIn.map((v, i) => v + (hourly.signedOut[i] ?? 0)) : [];
  const peakIdx = total.length ? total.indexOf(Math.max(...total)) : -1;
  const peakAt = hourly && peakIdx >= 0 ? new Date(new Date(hourly.start).getTime() + peakIdx * 3_600_000) : null;
  const watch = data?.watching.all;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        data-post-stats-sheet
        column
        className="bg-black/60 backdrop-blur-2xl backdrop-saturate-[180%] border border-white/10 border-b-0 p-0 gap-0 rounded-t-2xl overflow-hidden z-[200] flex flex-col max-h-[88dvh]"
      >
        <DrawerHeader className="px-5 pt-4 pb-2 shrink-0">
          <DrawerTitle className="text-base font-semibold text-white flex items-baseline justify-between">
            {t('postStats.howItsDoing', "How it's doing")}
            {data?.usual ? <span className="text-xs font-normal text-white/50">{t('postStats.vsUsual', 'vs your usual post')}</span> : null}
          </DrawerTitle>
        </DrawerHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 flex flex-col gap-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
            </div>
          ) : isError || !data ? (
            <AppState icon="lock" title={t('postStats.unavailableTitle', 'Stats unavailable')} description={t('postStats.unavailableBody', 'Only the creator can see stats for this post.')} size="drawer" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <StatTile
                  icon={<Eye className="w-3.5 h-3.5" />}
                  label={t('postStats.peopleReached', 'People reached')}
                  value={fmt(data.reach.people)}
                  sub={<VsUsual value={data.reach.people} usual={data.usual?.people} />}
                />
                {watch ? (
                  <StatTile
                    icon={<Clock className="w-3.5 h-3.5" />}
                    label={t('postStats.avgWatch', 'Avg watch')}
                    value={<>{fmtDuration(watch.avgSeconds)}{data.duration ? <span className="text-xs font-semibold text-white/50"> / {fmtDuration(data.duration)}</span> : null}</>}
                    sub={t('postStats.finishedPct', { defaultValue: '{{pct}}% watched to the end', pct: watch.finishedPct })}
                  />
                ) : (
                  <StatTile
                    icon={<Like className="w-3.5 h-3.5" />}
                    label={t('postInfo.likes')}
                    value={fmt(data.engagement.likes)}
                    sub={<VsUsual value={data.engagement.likes} usual={data.usual?.likes} />}
                  />
                )}
                <StatTile
                  icon={<Save className="w-3.5 h-3.5" />}
                  label={t('postStats.saved', 'Saved')}
                  value={fmt(data.engagement.saves)}
                  sub={<VsUsual value={data.engagement.saves} usual={data.usual?.saves} />}
                />
                <StatTile
                  icon={<NewMembers className="w-3.5 h-3.5" />}
                  label={t('postStats.newFollowers', 'New followers')}
                  value={`+${fmt(data.followers.gained)}`}
                  sub={t('postStats.afterWatching', 'followed after seeing it')}
                />
              </div>

              <div className="bg-white/5 rounded-lg p-3 flex flex-col gap-2">
                <div className="flex justify-between items-baseline text-xs text-white/60 gap-2">
                  <span>{t('postStats.first48', 'First 48 hours')}</span>
                  {peakAt && total[peakIdx] > 0 ? (
                    <b className="text-white font-semibold">
                      {t('postStats.peak', { defaultValue: 'Peak {{time}} · {{n}}', time: peakAt.toLocaleString(undefined, { weekday: 'short', hour: 'numeric' }), n: fmt(total[peakIdx]) })}
                    </b>
                  ) : null}
                </div>
                <AreaChart series={[hourly!.signedIn, hourly!.signedOut]} height={56} label={t('postStats.first48', 'First 48 hours')} />
                <ChartLegend items={[{ label: t('postStats.members', 'Members') }, { label: t('postStats.visitors', 'Signed out'), faint: true }]} />
              </div>

              <div className="bg-white/5 rounded-lg p-3 flex flex-col gap-2.5">
                <div className="flex justify-between text-xs text-white/60">
                  <span>{t('postStats.whoSawIt', 'Who saw it')}</span>
                </div>
                <SplitBar
                  left={data.reach.signedIn}
                  right={data.reach.signedOut}
                  leftLabel={t('postStats.membersLower', 'members')}
                  rightLabel={t('postStats.signedOutLower', 'signed out')}
                />
                <BadgeBreakdown badges={data.badges} signedOut={0} limit={3} />
              </div>

              {data.followers.viewersWhoFollow + data.followers.viewersNew > 0 ? (
                <div className="bg-white/5 rounded-lg p-3">
                  <SplitBar
                    left={data.followers.viewersWhoFollow} percent
                    right={data.followers.viewersNew}
                    leftLabel={t('postStats.yourFollowers', 'your followers')}
                    rightLabel={t('postStats.newToYou', 'new to you')}
                  />
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  navigate(`/app/post/${tokenId}/info`);
                }}
                className="h-11 rounded-xl bg-white text-black font-semibold text-sm"
              >
                {t('postStats.seeAll', 'See all stats')}
              </button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default PostStatsSheet;
