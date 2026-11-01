/**
 * Full post stats on Post Info, creator only. Every number that can be told
 * apart is split into members (signed in) and visitors (signed out).
 */

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { getBestTimes, type PostWatchSummary } from '@/lib/api/dehub/post-stats';
import { buildAvatarUrl } from '@/lib/media-url';
import { usePostStats } from './PostStatsSheet';
import { BadgeBreakdown } from './BadgeBreakdown';
import { AreaChart, ChartLegend, SplitBar, StatTile, StatsSection, VsUsual, fmt, fmtDuration } from './stats-parts';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const DAY_DEFAULTS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The UTC week grid moved into the viewer's own time zone, in 3-hour blocks. */
function localBlocks(grid: number[][]): number[][] {
  const offsetH = -new Date().getTimezoneOffset() / 60;
  const out = Array.from({ length: 7 }, () => new Array(8).fill(0));
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const total = d * 24 + h + offsetH;
      const wrapped = ((Math.round(total) % 168) + 168) % 168;
      out[Math.floor(wrapped / 24)][Math.floor((wrapped % 24) / 3)] += grid[d]?.[h] ?? 0;
    }
  }
  return out;
}

function WatchRow({ label, s }: { label: string; s: PostWatchSummary | null }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 text-xs tabular-nums items-baseline">
      <span className="text-white/60 truncate">{label}</span>
      <span className="text-white">{s ? fmt(s.plays) : '0'} <span className="text-white/50">{t('postStats.playsLower', 'plays')}</span></span>
      <span className="text-white">{s ? fmtDuration(s.avgSeconds) : '–'}</span>
      <span className="text-white">{s ? `${s.finishedPct}%` : '–'}</span>
    </div>
  );
}

export function PostStatsPanel({ tokenId }: { tokenId: string }) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = usePostStats(tokenId);
  const best = useQuery({ queryKey: ['post-stats-best-times'], queryFn: getBestTimes, staleTime: 10 * 60_000, retry: false });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
      </div>
    );
  }
  if (isError || !data) return null;

  const { reach, engagement, watching, followers, money, usual, hourly } = data;
  const total = hourly.signedIn.map((v, i) => v + (hourly.signedOut[i] ?? 0));
  const peakIdx = total.indexOf(Math.max(...total));
  const peakAt = new Date(new Date(hourly.start).getTime() + peakIdx * 3_600_000);
  const watch = watching.all;
  const devicesTotal = data.devices.ios + data.devices.android + data.devices.web;
  const blocks = best.data && best.data.total > 0 ? localBlocks(best.data.grid) : null;
  const blockMax = blocks ? Math.max(1, ...blocks.flat()) : 1;
  let bestCell: [number, number] | null = null;
  if (blocks) {
    blocks.forEach((row, d) => row.forEach((v, b) => {
      if (!bestCell || v > blocks[bestCell[0]][bestCell[1]]) bestCell = [d, b];
    }));
  }
  const inOut = (v: { signedIn: number; signedOut: number }) =>
    t('postStats.inOut', { defaultValue: '{{in}} members · {{out}} signed out', in: fmt(v.signedIn), out: fmt(v.signedOut) });

  return (
    <div className="space-y-6" data-post-stats-panel>
      <StatsSection title={t('postStats.reach', 'Reach')}>
        <div className="grid grid-cols-3 gap-2">
          <StatTile label={t('postStats.people', 'People')} value={fmt(reach.people)} sub={<VsUsual value={reach.people} usual={usual?.people} />} />
          <StatTile label={t('postStats.members', 'Members')} value={fmt(reach.signedIn)} sub={t('postStats.signedIn', 'signed in')} />
          <StatTile label={t('postStats.visitors', 'Signed out')} value={fmt(reach.signedOut)} sub={t('postStats.noAccount', 'no account')} />
          <StatTile label={t('postStats.plays', 'Plays')} value={fmt(reach.plays)} sub={t('postStats.withRepeats', { defaultValue: '{{n}} repeats', n: fmt(reach.repeats) })} />
          <StatTile label={t('postStats.playsMembers', 'Plays by members')} value={fmt(reach.playsSignedIn)} />
          <StatTile label={t('postStats.playsVisitors', 'Plays signed out')} value={fmt(reach.playsSignedOut)} />
        </div>
      </StatsSection>

      <StatsSection title={t('postStats.whoSawIt', 'Who saw it')} aside={t('postStats.byBadge', 'by badge')}>
        <BadgeBreakdown badges={data.badges} signedOut={reach.signedOut} />
      </StatsSection>

      <StatsSection
        title={t('postStats.first48', 'First 48 hours')}
        aside={total[peakIdx] > 0 ? t('postStats.peak', { defaultValue: 'Peak {{time}} · {{n}}', time: peakAt.toLocaleString(undefined, { weekday: 'short', hour: 'numeric' }), n: fmt(total[peakIdx]) }) : undefined}
      >
        <AreaChart series={[hourly.signedIn, hourly.signedOut]} height={96} label={t('postStats.first48', 'First 48 hours')} />
        <div className="mt-2">
          <ChartLegend items={[{ label: t('postStats.members', 'Members') }, { label: t('postStats.visitors', 'Signed out'), faint: true }]} />
        </div>
      </StatsSection>

      {data.duration ? (
        <StatsSection title={t('postStats.watching', 'Watching')} aside={fmtDuration(data.duration)}>
          {watch ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2">
                <StatTile label={t('postStats.avgWatch', 'Avg watch')} value={fmtDuration(watch.avgSeconds)} />
                <StatTile label={t('postStats.finished', 'Finished')} value={`${watch.finishedPct}%`} />
                <StatTile
                  label={t('postStats.bigDrop', 'Big drop')}
                  value={watch.biggestDropAt != null ? fmtDuration((watch.biggestDropAt / 100) * data.duration) : '–'}
                  sub={watch.biggestDropPct ? t('postStats.leave', { defaultValue: '{{pct}}% leave', pct: watch.biggestDropPct }) : undefined}
                />
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-xs text-white/60 mb-2">{t('postStats.stillWatching', 'Still watching')}</div>
                <AreaChart series={[watch.retention]} height={80} marker={watch.biggestDropAt != null ? Math.round(watch.biggestDropAt / 5) : null} label={t('postStats.stillWatching', 'Still watching')} />
                <div className="flex justify-between text-[10px] text-white/50 mt-1 tabular-nums">
                  <span>0:00</span><span>{fmtDuration(data.duration / 2)}</span><span>{fmtDuration(data.duration)}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 text-[10px] uppercase tracking-wider text-white/40">
                  <span /><span>{t('postStats.playsLower', 'plays')}</span><span>{t('postStats.avg', 'avg')}</span><span>{t('postStats.finishedLower', 'finished')}</span>
                </div>
                <WatchRow label={t('postStats.members', 'Members')} s={watching.signedIn} />
                <WatchRow label={t('postStats.visitors', 'Signed out')} s={watching.signedOut} />
              </div>
            </div>
          ) : (
            <p className="text-xs text-white/50">{t('postStats.noWatchYet', 'Watch time shows here once people play it. It started counting on 31 Oct 2026.')}</p>
          )}
        </StatsSection>
      ) : null}

      <StatsSection title={t('postStats.engagement', 'Engagement')}>
        <div className="grid grid-cols-3 gap-2">
          <StatTile label={t('postInfo.likes')} value={fmt(engagement.likes)} sub={<VsUsual value={engagement.likes} usual={usual?.likes} />} />
          <StatTile label={t('postInfo.comments')} value={fmt(engagement.comments)} sub={<VsUsual value={engagement.comments} usual={usual?.comments} />} />
          <StatTile label={t('postStats.saves', 'Saves')} value={fmt(engagement.saves)} sub={<VsUsual value={engagement.saves} usual={usual?.saves} />} />
          <StatTile label={t('postStats.reposts', 'Reposts')} value={fmt(engagement.reposts)} sub={<VsUsual value={engagement.reposts} usual={usual?.reposts} />} />
          <StatTile label={t('postStats.quotes', 'Quotes')} value={fmt(engagement.quotes)} />
          <StatTile label={t('postInfo.dislikes')} value={fmt(engagement.dislikes)} />
          <StatTile className="col-span-3" label={t('postStats.shares', 'Shares')} value={fmt(engagement.shares.signedIn + engagement.shares.signedOut)} sub={inOut(engagement.shares)} />
          <StatTile className="col-span-3" label={t('postStats.linkClicks', 'Link clicks')} value={fmt(engagement.linkClicks.signedIn + engagement.linkClicks.signedOut)} sub={inOut(engagement.linkClicks)} />
          <StatTile className="col-span-3" label={t('postStats.profileTaps', 'Taps to your profile')} value={fmt(engagement.profileTaps.signedIn + engagement.profileTaps.signedOut)} sub={inOut(engagement.profileTaps)} />
        </div>
        {Object.keys(engagement.reactions || {}).length ? (
          <div className="flex flex-wrap gap-2 mt-3">
            {Object.entries(engagement.reactions).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <span key={k} className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-white tabular-nums">{k} {fmt(n)}</span>
            ))}
          </div>
        ) : null}
      </StatsSection>

      <StatsSection title={t('postStats.audience', 'Audience')}>
        <div className="flex flex-col gap-3">
          <StatTile label={t('postStats.newFollowers', 'New followers')} value={`+${fmt(followers.gained)}`} sub={t('postStats.afterWatching', 'followed after seeing it')} />
          {followers.viewersWhoFollow + followers.viewersNew > 0 ? (
            <SplitBar left={followers.viewersWhoFollow} percent right={followers.viewersNew} leftLabel={t('postStats.yourFollowers', 'your followers')} rightLabel={t('postStats.newToYou', 'new to you')} />
          ) : null}
          {devicesTotal > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-white/60">{t('postStats.devices', 'Device (members)')}</span>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden flex gap-0.5">
                <div className="h-full bg-white" style={{ width: `${(data.devices.ios / devicesTotal) * 100}%` }} />
                <div className="h-full bg-white/60" style={{ width: `${(data.devices.android / devicesTotal) * 100}%` }} />
                <div className="h-full bg-white/30" style={{ width: `${(data.devices.web / devicesTotal) * 100}%` }} />
              </div>
              <div className="flex justify-between text-xs text-white/60 tabular-nums">
                <span>iPhone <b className="text-white">{Math.round((data.devices.ios / devicesTotal) * 100)}%</b></span>
                <span>Android <b className="text-white">{Math.round((data.devices.android / devicesTotal) * 100)}%</b></span>
                <span>Web <b className="text-white">{Math.round((data.devices.web / devicesTotal) * 100)}%</b></span>
              </div>
            </div>
          ) : null}
        </div>
      </StatsSection>

      {money.topSupporters.length ? (
        <StatsSection title={t('postStats.topSupporters', 'Top supporters')} aside={`${fmt(money.tips)} DHB`}>
          <ul className="flex flex-col gap-2">
            {money.topSupporters.map((s) => {
              const name = s.displayName || s.username || `${s.address.slice(0, 6)}…`;
              const avatar = buildAvatarUrl(s.address, s.avatarImageUrl || undefined);
              return (
                <li key={s.address} className="flex items-center gap-2.5 text-sm">
                  {avatar ? <img src={avatar} alt="" className="w-7 h-7 rounded-lg object-cover" /> : <span className="w-7 h-7 rounded-lg bg-white/10" />}
                  <span className="flex-1 min-w-0 truncate text-white">{name}</span>
                  <span className="font-semibold text-white tabular-nums">{fmt(s.amount)}</span>
                </li>
              );
            })}
          </ul>
        </StatsSection>
      ) : null}

      {blocks ? (
        <StatsSection title={t('postStats.bestTime', 'When your people watch')} aside={t('postStats.last30', 'last 30 days')}>
          <div className="grid grid-cols-[28px_repeat(8,minmax(0,1fr))] gap-[3px] text-[9px] text-white/50 items-center">
            <span />
            {['00', '03', '06', '09', '12', '15', '18', '21'].map((h) => <span key={h} className="text-center">{h}</span>)}
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <div key={d} className="contents">
                <span>{t(`postStats.day.${DAY_KEYS[d]}`, DAY_DEFAULTS[d])}</span>
                {blocks[d].map((v, b) => (
                  <i
                    key={b}
                    className="block h-4 rounded-[4px] bg-white"
                    style={{ opacity: 0.08 + (v / blockMax) * 0.92, outline: bestCell && bestCell[0] === d && bestCell[1] === b ? '1.5px solid currentColor' : undefined, outlineOffset: 1 }}
                    title={String(v)}
                  />
                ))}
              </div>
            ))}
          </div>
          {bestCell ? (
            <p className="text-xs text-white/70 mt-3">
              {t('postStats.bestTip', {
                defaultValue: 'Most of your viewers show up {{day}} around {{hour}}:00. Posting just before then gives a post the best start.',
                day: t(`postStats.day.${DAY_KEYS[bestCell[0]]}`, DAY_DEFAULTS[bestCell[0]]),
                hour: String(bestCell[1] * 3).padStart(2, '0'),
              })}
            </p>
          ) : null}
        </StatsSection>
      ) : null}
    </div>
  );
}

export default PostStatsPanel;
