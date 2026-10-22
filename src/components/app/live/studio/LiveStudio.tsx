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
import type { CreatorOverlay, OverlayRect, OverlayWidget } from '@/lib/live-overlay/types';
import { createOverlayEventBus, OverlayEventContext } from '../overlay/overlay-events';
import { StudioStage } from './StudioStage';
import { WidgetSettings } from './WidgetSettings';

export const myOverlayKey = ['my-overlay'] as const;

const TESTS: OverlayTestKind[] = ['tip', 'follow', 'subscribe', 'share', 'join'];
const PREVIEW_STATS = { totalTips: 0, followers: 0 };

export function LiveStudio() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery<CreatorOverlay>({
    queryKey: myOverlayKey,
    queryFn: getMyOverlay,
    staleTime: 60_000,
  });

  const [widgets, setWidgets] = useState<OverlayWidget[]>([]);
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
  }, [data, dirty]);

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
    mutationFn: () => saveMyOverlay({ renderIn: data?.renderIn ?? 'app', widgets }),
    onSuccess: (saved) => {
      loadedVersion.current = saved.version;
      queryClient.setQueryData(myOverlayKey, saved);
      setDirty(false);
      toast.success(t('liveStudio.saved'));
    },
    onError: () => toast.error(t('liveStudio.saveFailed')),
  });

  // Test alerts come back through the control room and play on the preview.
  const bus = useMemo(() => createOverlayEventBus(), []);
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
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      sub?.leave();
    };
  }, [token, bus]);

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
              <StudioStage
                widgets={widgets}
                portrait={portrait}
                selectedId={selectedId}
                stats={PREVIEW_STATS}
                onSelect={setSelectedId}
                onMove={move}
              />
            </OverlayEventContext.Provider>
            <p className="mt-3 text-xs text-zinc-500">{t('liveStudio.layoutHint')}</p>
          </PageSection>

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
