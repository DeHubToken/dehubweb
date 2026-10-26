/**
 * Planned
 * =======
 * Everything you have scheduled, in one list: posts, Lives and Stages, soonest
 * first and grouped by day. Each one can be moved with the When sheet, sent
 * now, or called off.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, isToday, isTomorrow } from 'date-fns';
import { FileText, Mic2, Radio } from 'lucide-react';
import { toast } from 'sonner';

import { SEOHead } from '@/components/SEOHead';
import { PageBody, PageEmpty, PageIsland, PageSection, PageTabs } from '@/components/app/page-kit/PageKit';
import { ScheduleSheet, type ScheduleKind } from '@/features/post/components/ScheduleSheet';
import { useAuth } from '@/contexts/AuthContext';
import { useScheduledSpaces, useStage } from '@/contexts/StageContext';
import { getMediaUrl } from '@/lib/api/dehub/core';
import { deletePost } from '@/lib/api/dehub/content';
import { getUserScheduledStreams } from '@/lib/api/dehub/livestream';
import { getMyScheduledPosts, moveScheduledLive, moveScheduledPost } from '@/lib/api/dehub/scheduled';
import { countdownParts, useMinuteTick } from '@/lib/schedule/countdown';

interface PlannedItem {
  key: string;
  kind: ScheduleKind;
  title: string;
  at: Date;
  image?: string;
  /** Post token id, or the Live's post token id. */
  tokenId?: number;
  streamId?: string;
  spaceId?: string;
}

type Filter = 'all' | ScheduleKind;

const KIND_ICON = { post: FileText, live: Radio, stage: Mic2 } as const;

export default function PlannedPage() {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const { startScheduledSpace, cancelScheduledSpace, rescheduleScheduledSpace } = useStage();
  const spaces = useScheduledSpaces();
  const now = useMinuteTick();
  const [filter, setFilter] = useState<Filter>('all');
  const [moving, setMoving] = useState<PlannedItem | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const posts = useQuery({
    queryKey: ['planned-posts', walletAddress],
    queryFn: getMyScheduledPosts,
    enabled: !!walletAddress,
    staleTime: 15_000,
  });
  const lives = useQuery({
    queryKey: ['composer-scheduled-streams', walletAddress],
    queryFn: () => getUserScheduledStreams(walletAddress!),
    enabled: !!walletAddress,
    staleTime: 15_000,
  });

  const items = useMemo<PlannedItem[]>(() => {
    const list: PlannedItem[] = [];
    for (const p of posts.data || []) {
      list.push({
        key: `post-${p.tokenId}`,
        kind: 'post',
        title: p.name || p.description || t('planned.untitledPost', { defaultValue: 'Post' }),
        at: new Date(p.scheduledAt),
        image: getMediaUrl(p.imageUrls?.[0] || p.imageUrl),
        tokenId: p.tokenId,
      });
    }
    for (const s of lives.data?.result || []) {
      if (String(s.status).toLowerCase() !== 'scheduled' || !s.scheduledAt) continue;
      list.push({
        key: `live-${s.streamId}`,
        kind: 'live',
        title: s.title || t('planned.untitledLive', { defaultValue: 'Live' }),
        at: new Date(s.scheduledAt),
        image: getMediaUrl(s.thumbnailUrl),
        tokenId: s.tokenId != null ? Number(s.tokenId) : undefined,
        streamId: s.streamId,
      });
    }
    const me = walletAddress?.toLowerCase();
    for (const s of spaces) {
      if (!me || s.host_wallet_address?.toLowerCase() !== me || !s.scheduled_at) continue;
      list.push({
        key: `stage-${s.id}`,
        kind: 'stage',
        title: s.title,
        at: new Date(s.scheduled_at),
        image: s.cover_image_url || undefined,
        spaceId: s.id,
      });
    }
    return list.filter(i => !Number.isNaN(i.at.getTime())).sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [posts.data, lives.data, spaces, walletAddress, t]);

  const shown = filter === 'all' ? items : items.filter(i => i.kind === filter);
  const days = useMemo(() => {
    const groups: { label: string; items: PlannedItem[] }[] = [];
    for (const item of shown) {
      const label = isToday(item.at)
        ? t('whenSheet.today', { defaultValue: 'Today' })
        : isTomorrow(item.at)
          ? t('whenSheet.tomorrow', { defaultValue: 'Tomorrow' })
          : format(item.at, 'EEEE d MMM');
      const last = groups[groups.length - 1];
      if (last?.label === label) last.items.push(item);
      else groups.push({ label, items: [item] });
    }
    return groups;
  }, [shown, t]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['planned-posts'] });
    void queryClient.invalidateQueries({ queryKey: ['composer-scheduled-streams'] });
  };

  const run = async (item: PlannedItem, job: () => Promise<unknown>, done?: string) => {
    if (busy) return;
    setBusy(item.key);
    try {
      await job();
      if (done) toast.success(done);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t('planned.moveFailed', { defaultValue: 'Could not move it. Try again.' }));
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  const move = (item: PlannedItem, at: Date) =>
    run(item, async () => {
      if (item.kind === 'post' && item.tokenId != null) await moveScheduledPost(item.tokenId, at);
      else if (item.kind === 'live' && item.streamId) await moveScheduledLive(item.streamId, at);
      else if (item.kind === 'stage' && item.spaceId) {
        if (!(await rescheduleScheduledSpace(item.spaceId, at))) throw new Error('');
      }
    }, t('planned.moved', { defaultValue: 'Moved to {{when}}', when: format(at, 'EEE d MMM, h:mm a') }));

  const sendNow = (item: PlannedItem) =>
    item.kind === 'stage' && item.spaceId
      ? run(item, () => startScheduledSpace(item.spaceId!))
      : run(item, () => moveScheduledPost(item.tokenId!, 'now'), t('planned.postingNow', { defaultValue: 'Posting in under a minute' }));

  const cancel = (item: PlannedItem) => {
    if (confirming !== item.key) {
      setConfirming(item.key);
      return;
    }
    if (item.kind === 'stage' && item.spaceId) void run(item, () => cancelScheduledSpace(item.spaceId!));
    else if (item.tokenId != null) void run(item, () => deletePost(item.tokenId!), t('planned.cancelled', { defaultValue: 'Cancelled' }));
  };

  const loading = !!walletAddress && (posts.isLoading || lives.isLoading);

  return (
    <div className="min-h-screen">
      <SEOHead
        title={t('planned.seoTitle', { defaultValue: 'Planned · DeHub' })}
        description={t('planned.seoDescription', { defaultValue: 'Your scheduled posts, Lives and Stages on DeHub, all in one place.' })}
        url="https://dehub.io/app/planned"
        noindex
      />

      <PageIsland
        className="max-w-2xl mx-auto"
        icon="events"
        back
        backFallback="/app"
        title={t('planned.title', { defaultValue: 'Planned' })}
        subtitle={t('planned.subtitle', { defaultValue: 'Posts, Lives and Stages you have scheduled' })}
        tabs={
          <PageTabs
            value={filter}
            onChange={setFilter}
            tabs={[
              { id: 'all', label: t('planned.all', { defaultValue: 'All' }) },
              { id: 'post', label: t('planned.posts', { defaultValue: 'Posts' }) },
              { id: 'live', label: t('planned.lives', { defaultValue: 'Lives' }) },
              { id: 'stage', label: t('planned.stages', { defaultValue: 'Stages' }) },
            ]}
          />
        }
      />

      <PageBody className="max-w-2xl mx-auto space-y-3">
        {!walletAddress ? (
          <PageEmpty icon="events" title={t('planned.signIn', { defaultValue: 'Sign in to see what you have planned' })} />
        ) : loading ? (
          <PageEmpty icon="events" title={t('planned.loading', { defaultValue: 'Loading…' })} />
        ) : !days.length ? (
          <PageEmpty
            icon="events"
            title={t('planned.emptyTitle', { defaultValue: 'Nothing planned yet' })}
            body={t('planned.emptyBody', { defaultValue: 'Pick "When?" while making a post, Live or Stage and it shows up here.' })}
          />
        ) : (
          days.map(day => (
            <PageSection key={day.label} eyebrow={day.label} flush>
              <ul className="pb-2">
                {day.items.map(item => {
                  const Icon = KIND_ICON[item.kind];
                  const countdown = countdownParts(item.at, now);
                  const kindLabel =
                    item.kind === 'post'
                      ? t('planned.post', { defaultValue: 'Post' })
                      : item.kind === 'live'
                        ? t('planned.live', { defaultValue: 'Live' })
                        : t('planned.stage', { defaultValue: 'Stage' });
                  const isBusy = busy === item.key;
                  return (
                    <li key={item.key} data-planned-row className="flex gap-3 px-4 py-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-white/[0.06]">
                        {item.image ? (
                          <img src={item.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <Icon className="h-5 w-5 text-white/60" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-white">{item.title}</p>
                        <p className="mt-0.5 truncate text-[12px] text-white/55">
                          {kindLabel} · {format(item.at, 'h:mm a')}
                          {countdown && ` · ${t('whenSheet.startsIn', { defaultValue: 'Starts in {{time}}', time: countdown })}`}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button type="button" data-kit-chip disabled={isBusy} onClick={() => setMoving(item)} className="!h-8 !px-3 !text-[12px]">
                            {t('planned.move', { defaultValue: 'Move' })}
                          </button>
                          {item.kind !== 'live' && (
                            <button type="button" data-kit-chip disabled={isBusy} onClick={() => void sendNow(item)} className="!h-8 !px-3 !text-[12px]">
                              {item.kind === 'stage'
                                ? t('planned.startNow', { defaultValue: 'Start now' })
                                : t('planned.postNow', { defaultValue: 'Post now' })}
                            </button>
                          )}
                          <button
                            type="button"
                            data-kit-chip
                            data-active={confirming === item.key ? 'true' : undefined}
                            disabled={isBusy}
                            onClick={() => cancel(item)}
                            onBlur={() => setConfirming(c => (c === item.key ? null : c))}
                            className="!h-8 !px-3 !text-[12px]"
                          >
                            {confirming === item.key
                              ? t('planned.confirmCancel', { defaultValue: 'Tap again to cancel' })
                              : t('planned.cancel', { defaultValue: 'Cancel' })}
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </PageSection>
          ))
        )}
      </PageBody>

      <ScheduleSheet
        isOpen={!!moving}
        onClose={() => setMoving(null)}
        scheduledDate={moving?.at ?? null}
        kind={moving?.kind ?? 'post'}
        minimumMinutes={moving?.kind === 'live' ? 30 : 0}
        moving
        onSchedule={date => {
          const item = moving;
          setMoving(null);
          if (item && date) void move(item, date);
        }}
      />
    </div>
  );
}
