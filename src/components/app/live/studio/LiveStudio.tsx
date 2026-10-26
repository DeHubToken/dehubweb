/**
 * Live Studio: where a creator builds the overlay every viewer sees over their
 * streams.
 *
 * Edits are a local draft until Save; a save goes to the stream API, which
 * tells any stream the creator is live on to redraw. Test alerts go through the
 * API too, into the creator's private control room, so a test proves the whole
 * path and still never reaches a viewer.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageSection } from '@/components/app/page-kit/PageKit';
import { cn } from '@/lib/utils';
import { getMyOverlay, saveMyOverlay, sendOverlayTest, type OverlayTestKind } from '@/lib/api/dehub/live-overlay';
import { MAX_WIDGETS, OVERLAY_KINDS, isKnownKind, newWidget, type OverlayKind } from '@/lib/live-overlay/registry';
import type { CreatorOverlay, OverlayRect, OverlayRenderIn, OverlayWidget } from '@/lib/live-overlay/types';
import { ObsPanel } from './ObsPanel';
import { createOverlayEventBus, OverlayEventContext } from '../overlay/overlay-events';
import { createRuleBus, RuleAudio, RuleBusContext } from '../overlay/rule-bus';
import { RulesPanel } from './RulesPanel';
import { ModerationPanel } from './ModerationPanel';
import { PollPanel } from './PollPanel';
import { RecapPanel } from './RecapPanel';
import { HighlightsPanel } from './HighlightsPanel';
import { QuickControls } from './QuickControls';
import { SubathonPanel } from './SubathonPanel';
import { PointsPanel } from './PointsPanel';
import { OverlayCreatorContext, SubathonContext } from '../overlay/subathon';
import { HypeContext } from '../overlay/hype-train';
import { BadgesPanel } from './BadgesPanel';
import { DestinationsPanel } from './DestinationsPanel';
import type { HypeTrain } from '@/lib/api/dehub/live-hype';
import { getMySubathon, type MySubathon } from '@/lib/api/dehub/live-subathon';
import { PollContext } from '../overlay/poll';
import { getMyPoll } from '@/lib/api/dehub/live-polls';
import { samplePoll, type LivePoll } from '@/lib/live-overlay/polls';
import { StudioStage } from './StudioStage';
import { WidgetSettings } from './WidgetSettings';
import { VerticalCropPanel } from './VerticalCropPanel';
import type { VerticalCrop } from '@/lib/live-overlay/vertical-crop';

export const myOverlayKey = ['my-overlay'] as const;

const TESTS: OverlayTestKind[] = ['tip', 'follow', 'subscribe', 'share', 'join'];
const PREVIEW_STATS = { totalTips: 0, followers: 0 };

export function LiveStudio() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();
  // Go Live sends a creator here with ?recap=<streamId> when they end a stream.
  const [params] = useSearchParams();
  const justEnded = params.get('recap');
  const { data, isLoading, isError } = useQuery<CreatorOverlay>({
    queryKey: myOverlayKey,
    queryFn: getMyOverlay,
    staleTime: 15_000,
    // Keeps "OBS connected" honest while the page is open: an OBS page checks
    // in every minute and the server forgets it after ninety seconds.
    refetchInterval: 30_000,
  });

  const [widgets, setWidgets] = useState<OverlayWidget[]>([]);
  const [renderIn, setRenderIn] = useState<OverlayRenderIn>('app');
  const [verticalCrop, setVerticalCrop] = useState<VerticalCrop | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [portrait, setPortrait] = useState(false);
  const loadedVersion = useRef<number | null>(null);

  // Take the saved overlay as the draft — once, and again whenever a newer
  // version arrives while there is nothing unsaved to lose.
  useEffect(() => {
    if (!data) return;
    if (loadedVersion.current === data.version) return;
    if (dirty && loadedVersion.current !== null) return;
    loadedVersion.current = data.version;
    setWidgets(data.widgets);
    setRenderIn(data.renderIn);
    setVerticalCrop(data.verticalCrop ?? null);
  }, [data, dirty]);

  const chooseVerticalCrop = (next: VerticalCrop) => {
    setVerticalCrop(next);
    setDirty(true);
  };

  const chooseRenderIn = (next: OverlayRenderIn) => {
    setRenderIn(next);
    setDirty(true);
  };

  const edit = (next: OverlayWidget[]) => {
    setWidgets(next);
    setDirty(true);
  };
  const update = (id: string, change: Partial<OverlayWidget>) =>
    edit(widgets.map((w) => (w.id === id ? { ...w, ...change } : w)));

  const selected = widgets.find((w) => w.id === selectedId) ?? null;

  const add = (kind: OverlayKind) => {
    if (widgets.length >= MAX_WIDGETS) {
      toast.error(t('liveStudio.limit'));
      return;
    }
    const widget = newWidget(kind, widgets);
    edit([...widgets, widget]);
    setSelectedId(widget.id);
  };

  const remove = (id: string) => {
    edit(widgets.filter((w) => w.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const move = (id: string, rect: OverlayRect) => update(id, portrait ? { portrait: rect } : { landscape: rect });

  const save = useMutation({
    mutationFn: () => saveMyOverlay({ renderIn, widgets, verticalCrop }),
    onSuccess: (saved) => {
      loadedVersion.current = saved.version;
      queryClient.setQueryData(myOverlayKey, saved);
      setDirty(false);
      toast.success(t('liveStudio.saved'));
    },
    onError: () => toast.error(t('liveStudio.saveFailed')),
  });

  // The creator's live poll, kept current by the control room below. The
  // preview shows it, or a stand-in so the poll widget can be placed offline.
  const [poll, setPoll] = useState<LivePoll | null>(null);
  const pollRef = useRef<LivePoll | null>(null);
  pollRef.current = poll;
  useEffect(() => {
    let cancelled = false;
    getMyPoll()
      .then((p) => !cancelled && setPoll(p))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  // The creator's subathon, kept current by the control room below. The
  // preview runs a stand-in countdown so the timer can be placed offline.
  const [subathon, setSubathon] = useState<MySubathon | null>(null);
  useEffect(() => {
    let cancelled = false;
    getMySubathon()
      .then((s) => !cancelled && setSubathon(s))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const previewSubathon = useMemo(
    () =>
      subathon?.running && subathon.endsAt
        ? { running: true, endsAt: subathon.endsAt, lastAdd: null }
        : { running: true, endsAt: new Date(Date.now() + 3_600_000).toISOString(), lastAdd: null },
    [subathon],
  );

  // A train two-thirds into level 2, so the widget has something to show while it is placed.
  const previewHype = useMemo<HypeTrain>(
    () => ({
      streamId: 'preview', active: true, points: 2300, level: 2, completed: 1, into: 1300, need: 2000,
      startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 4 * 60_000).toISOString(),
      contributors: 6, top: [],
    }),
    [],
  );

  const previewPoll = useMemo(
    () =>
      poll ??
      samplePoll(t('liveStudio.polls.questionPlaceholder'), [
        t('liveStudio.polls.sample.a'),
        t('liveStudio.polls.sample.b'),
        t('liveStudio.polls.sample.c'),
      ]),
    [poll, t],
  );

  // Test alerts come back through the control room and play on the preview.
  const bus = useMemo(() => createOverlayEventBus(), []);
  const ruleBus = useMemo(() => createRuleBus(), []);
  const token = data?.token;
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let sub: { leave: () => void } | null = null;
    import('@/lib/api/dehub/overlay-control')
      .then(({ watchOverlayControl }) => {
        if (cancelled) return;
        sub = watchOverlayControl(token, 'studio', {
          onTest: (events) => events.forEach((event) => bus.publish(event)),
          onRule: (fired) => ruleBus.publish(fired),
          // The socket is shared with any live card still mounted, so a poll
          // from someone else's stream can arrive here too: only ours counts.
          onSubathon: (update) => setSubathon((prev) => (prev ? { ...prev, running: update.running, endsAt: update.endsAt } : prev)),
          onPoll: (incoming) =>
            pollRef.current?.id === incoming.id
              ? setPoll(incoming)
              : void getMyPoll()
                  .then(setPoll)
                  .catch(() => undefined),
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      sub?.leave();
    };
  }, [token, bus, ruleBus]);

  const test = useMutation({
    mutationFn: (kind: OverlayTestKind) =>
      sendOverlayTest(kind, kind === 'tip' ? { amount: 250_000, message: t('liveStudio.testMessage') } : {}),
    onError: () => toast.error(t('liveStudio.testFailed')),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }
  if (isError || !data) {
    return <p className="py-10 text-sm text-zinc-400">{t('liveStudio.loadFailed')}</p>;
  }

  return (
    <div className="space-y-4 pb-24">
      <p className="text-sm text-zinc-400">{t('liveStudio.intro')}</p>

      {justEnded && <RecapPanel address={walletAddress} streamId={justEnded} />}

      <QuickControls overlay={data} queryKey={myOverlayKey} />

      <DestinationsPanel address={walletAddress} />

      <HighlightsPanel address={walletAddress} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <PageSection
            title={t('liveStudio.preview')}
            action={
              <div role="tablist" aria-label={t('liveStudio.preview')} className="flex rounded-lg border border-zinc-700 p-0.5">
                {[false, true].map((p) => (
                  <button
                    key={String(p)}
                    role="tab"
                    aria-selected={portrait === p}
                    onClick={() => setPortrait(p)}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs font-medium',
                      portrait === p ? 'bg-white text-zinc-900' : 'text-zinc-400 hover:text-white',
                    )}
                  >
                    {p ? t('liveStudio.portrait') : t('liveStudio.landscape')}
                  </button>
                ))}
              </div>
            }
          >
            <OverlayEventContext.Provider value={bus}>
              <RuleBusContext.Provider value={ruleBus}>
                <RuleAudio playLive={false} />
                <PollContext.Provider value={{ poll: previewPoll, myVote: null, interactive: false }}>
                <SubathonContext.Provider value={previewSubathon}>
                <HypeContext.Provider value={previewHype}>
                <OverlayCreatorContext.Provider value={walletAddress ?? ''}>
                  <StudioStage
                    widgets={widgets}
                    portrait={portrait}
                    selectedId={selectedId}
                    stats={PREVIEW_STATS}
                    onSelect={setSelectedId}
                    onMove={move}
                  />
                </OverlayCreatorContext.Provider>
                </HypeContext.Provider>
                </SubathonContext.Provider>
                </PollContext.Provider>
              </RuleBusContext.Provider>
            </OverlayEventContext.Provider>
            <p className="mt-3 text-xs text-zinc-500">{t('liveStudio.layoutHint')}</p>
          </PageSection>

          <VerticalCropPanel crop={verticalCrop} onChange={chooseVerticalCrop} />

          <PageSection title={t('liveStudio.test')}>
            <p className="mb-3 text-xs text-zinc-500">{t('liveStudio.testHint')}</p>
            <div className="flex flex-wrap gap-2">
              {TESTS.map((kind) => (
                <Button
                  key={kind}
                  variant="outline"
                  size="sm"
                  disabled={test.isPending}
                  onClick={() => test.mutate(kind)}
                >
                  {t(`liveStudio.tests.${kind}`)}
                </Button>
              ))}
            </div>
          </PageSection>
        </div>

        <div className="space-y-4">
          <ObsPanel
            token={data.token}
            renderIn={renderIn}
            obsConnected={data.obsConnected}
            selectedWidgetId={selectedId}
            onRenderIn={chooseRenderIn}
          />

          <PageSection
            title={t('liveStudio.widgets')}
            action={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Plus className="mr-1 h-4 w-4" />
                    {t('liveStudio.addWidget')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {OVERLAY_KINDS.map((kind) => (
                    <DropdownMenuItem key={kind} onSelect={() => add(kind)} className="flex-col items-start gap-0.5">
                      <span className="text-sm font-medium">{t(`liveStudio.kinds.${kind}`)}</span>
                      <span className="text-xs text-zinc-500">{t(`liveStudio.hints.${kind}`)}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            }
          >
            {widgets.length === 0 ? (
              <p className="text-sm text-zinc-500">{t('liveStudio.empty')}</p>
            ) : (
              <ul className="space-y-1.5">
                {widgets.map((w) => (
                  <li
                    key={w.id}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-2 py-1.5',
                      w.id === selectedId ? 'bg-zinc-800' : 'hover:bg-zinc-800/60',
                    )}
                  >
                    <button onClick={() => setSelectedId(w.id)} className="min-w-0 flex-1 truncate text-left text-sm text-white">
                      {isKnownKind(w.kind) ? t(`liveStudio.kinds.${w.kind}`) : w.kind}
                    </button>
                    <Switch
                      checked={w.enabled}
                      onCheckedChange={(v) => update(w.id, { enabled: v })}
                      aria-label={t('liveStudio.visible')}
                    />
                    <button
                      onClick={() => remove(w.id)}
                      aria-label={t('liveStudio.remove')}
                      className="rounded-md p-1 text-zinc-500 hover:bg-zinc-700 hover:text-white"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </PageSection>

          <PageSection title={selected ? t(`liveStudio.kinds.${selected.kind}`) : t('liveStudio.settings')}>
            {selected ? (
              <WidgetSettings widget={selected} onChange={(settings) => update(selected.id, { settings })} />
            ) : (
              <p className="text-sm text-zinc-500">{t('liveStudio.selectHint')}</p>
            )}
          </PageSection>
        </div>
      </div>

      <PollPanel poll={poll} onPoll={setPoll} />

      <SubathonPanel subathon={subathon} onChange={setSubathon} />

      <PointsPanel address={walletAddress} />

      <BadgesPanel />

      {!justEnded && <RecapPanel address={walletAddress} />}

      <RulesPanel hasAlertWidget={widgets.some((w) => w.kind === 'rule_alert' && w.enabled)} />

      <ModerationPanel />

      <div className="sticky bottom-4 z-10 flex justify-end">
        <div className="flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900/95 px-3 py-2 shadow-lg backdrop-blur">
          {dirty && <span className="text-xs text-zinc-400">{t('liveStudio.unsaved')}</span>}
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? t('liveStudio.saving') : t('liveStudio.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
