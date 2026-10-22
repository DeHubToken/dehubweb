/**
 * The OBS browser source: /overlay/<token>.
 *
 * A creator pastes this URL into OBS, Streamlabs or vMix once, and it draws
 * their overlay — the same widgets Live Studio places and viewers' apps draw —
 * burned into whatever they broadcast. It follows the creator from stream to
 * stream on its own: idle while they are offline, it joins each new broadcast's
 * room the moment one is on air.
 *
 * It renders outside the app entirely (an outer route in App.tsx), with no
 * wallet stack, theme canvas or chrome, and index.html makes the page
 * transparent before any script runs — see `data-obs-overlay` there.
 *
 *   ?w=<widgetId>   one widget, filling the whole source (one source per widget)
 *   ?diag=1         connection state on screen, for when something is not showing
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import '@/styles/live-overlay.css';
import { SEOHead } from '@/components/SEOHead';
import { getOverlayByToken, OverlayNotFoundError, type TokenOverlay } from '@/lib/api/dehub/live-overlay';
import { drawOrder, placeWidget, rectFor } from '@/lib/live-overlay/layout';
import { isKnownKind, type OverlayKind } from '@/lib/live-overlay/registry';
import { createOverlayEventBus, OverlayEventContext } from '@/components/app/live/overlay/overlay-events';
import { OverlayWidgetView } from '@/components/app/live/overlay/overlay-widgets';

/** How often to look for the creator going live, and for a stream ending. */
const IDLE_POLL_MS = 10_000;
const LIVE_POLL_MS = 20_000;

function useWindowSize() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

export default function ObsOverlayPage() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const onlyWidget = params.get('w');
  const diag = params.get('diag') === '1';
  const size = useWindowSize();
  const bus = useMemo(() => createOverlayEventBus(), []);
  const [joined, setJoined] = useState<boolean | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  // The diagnostic panel counts up "seconds since the last event" on its own.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!diag) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [diag]);

  const { data, error, refetch } = useQuery<TokenOverlay>({
    queryKey: ['obs-overlay', token],
    queryFn: () => getOverlayByToken(token),
    enabled: !!token && !revoked,
    // A dead token stops here; anything else keeps trying, because an OBS
    // source is left open for hours and has to ride out network blips.
    retry: (count, err) => !(err instanceof OverlayNotFoundError) && count < 5,
    refetchInterval: (query) =>
      query.state.error instanceof OverlayNotFoundError ? false : query.state.data?.live ? LIVE_POLL_MS : IDLE_POLL_MS,
    refetchOnWindowFocus: false,
  });
  const notFound = error instanceof OverlayNotFoundError || revoked;

  // The creator's control room: test alerts, saves and a rotated token.
  useEffect(() => {
    if (!token || notFound) return;
    let cancelled = false;
    let sub: { leave: () => void } | null = null;
    import('@/lib/api/dehub/stream-presence')
      .then(({ watchOverlayControl }) => {
        if (cancelled) return;
        sub = watchOverlayControl(token, 'obs', {
          onTest: (events) => {
            events.forEach((event) => bus.publish(event));
            setLastEventAt(Date.now());
          },
          onUpdated: () => void refetch(),
          onRevoked: () => setRevoked(true),
          onJoined: setJoined,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      sub?.leave();
    };
  }, [token, notFound, bus, refetch]);

  // The stream the creator is on air with right now, when there is one.
  const streamId = data?.live?.streamId ?? null;
  useEffect(() => {
    if (!streamId) return;
    let cancelled = false;
    let sub: { leave: () => void } | null = null;
    import('@/lib/api/dehub/stream-presence')
      .then(({ watchLiveRoomEvents }) => {
        if (cancelled) return;
        sub = watchLiveRoomEvents(streamId, (event) => {
          if (event.type === 'overlayUpdated') {
            void refetch();
            return;
          }
          bus.publish(event);
          setLastEventAt(Date.now());
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      sub?.leave();
    };
  }, [streamId, bus, refetch]);

  const picture = { left: 0, top: 0, width: size.w, height: size.h };
  const portrait = size.h > size.w;
  const widgets =
    data && !notFound
      ? drawOrder(
          data.widgets.filter((w) => w.enabled && isKnownKind(w.kind) && (!onlyWidget || w.id === onlyWidget)),
        )
      : [];

  return (
    <OverlayEventContext.Provider value={bus}>
      <SEOHead title={t('liveStudio.obs.pageTitle')} noindex noCanonical />
      <div data-live-overlay data-obs-page style={{ position: 'fixed' }} aria-hidden>
        {widgets.map((widget) => {
          // One widget per source: it takes the whole source and OBS places it.
          const box = onlyWidget ? picture : placeWidget(rectFor(widget, portrait), picture);
          const style = {
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            '--ow-h': `${box.height}px`,
            '--ow-w': `${box.width}px`,
          } as CSSProperties;
          return (
            <div key={widget.id} data-overlay-widget={widget.kind} style={style}>
              <OverlayWidgetView
                kind={widget.kind as OverlayKind}
                settings={widget.settings || {}}
                streamId={streamId ?? ''}
                stats={data!.stats}
                initialViewers={0}
              />
            </div>
          );
        })}
      </div>

      {diag && (
        <pre
          style={{
            position: 'fixed',
            left: 8,
            bottom: 8,
            margin: 0,
            padding: '6px 8px',
            font: '12px/1.4 ui-monospace, Menlo, monospace',
            color: '#fff',
            background: 'rgb(0 0 0 / 0.75)',
            borderRadius: 6,
            zIndex: 50,
          }}
        >
          {[
            `${t('liveStudio.obs.diagLink')}: ${notFound ? t('liveStudio.obs.diagDead') : data ? t('liveStudio.obs.diagOk') : '…'}`,
            `${t('liveStudio.obs.diagControl')}: ${joined === null ? '…' : joined ? t('liveStudio.obs.diagOk') : t('liveStudio.obs.diagDead')}`,
            `${t('liveStudio.obs.diagStream')}: ${streamId ?? t('liveStudio.obs.diagOffline')}`,
            `${t('liveStudio.obs.diagWidgets')}: ${widgets.length}`,
            `${t('liveStudio.obs.diagLastEvent')}: ${lastEventAt ? `${Math.round((Date.now() - lastEventAt) / 1000)}s` : '—'}`,
          ].join('\n')}
        </pre>
      )}
    </OverlayEventContext.Provider>
  );
}
