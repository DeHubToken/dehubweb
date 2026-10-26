/**
 * The subathon timer and the points board — two widgets that read state the
 * stream API keeps, rather than counting room events themselves.
 *
 * The timer counts down to an end time the server holds and moves; every
 * screen counts to the same moment, so a refresh is not a reset. The points
 * board shows a creator's most loyal viewers (watch time and paid gifts).
 */
import { createContext, useContext, useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getPointsBoard } from '@/lib/api/dehub/live-subathon';
import type { SubathonUpdate } from '@/lib/api/dehub/overlay-control';
import { setting } from '@/lib/live-overlay/registry';
import type { OverlaySubathon } from '@/lib/live-overlay/types';


export interface SubathonState {
  running: boolean;
  endsAt: string | null;
  /** The last time added, for the "+1:30" flash. */
  lastAdd: { seconds: number; at: number } | null;
}

export const SubathonContext = createContext<SubathonState>({ running: false, endsAt: null, lastAdd: null });

/** Whose overlay this is, for widgets that read the creator's own data. */
export const OverlayCreatorContext = createContext<string>('');

/** The stream's subathon, starting from what the overlay said and kept current from its room. */
export function useStreamSubathon(streamId: string | null | undefined, initial: OverlaySubathon | null | undefined): SubathonState {
  const [state, setState] = useState<SubathonState>(() => ({ running: !!initial, endsAt: initial?.endsAt ?? null, lastAdd: null }));
  const initialEnd = initial?.endsAt ?? null;
  useEffect(() => {
    setState((prev) => (prev.endsAt === initialEnd ? prev : { running: !!initialEnd, endsAt: initialEnd, lastAdd: null }));
  }, [initialEnd]);
  useEffect(() => {
    if (!streamId) return;
    let cancelled = false;
    let sub: { leave: () => void } | null = null;
    import('@/lib/api/dehub/overlay-control')
      .then(({ watchStreamSubathon }) => {
        if (!cancelled) sub = watchStreamSubathon(streamId, (u) => setState(apply(u)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      sub?.leave();
    };
  }, [streamId]);
  return state;
}

/** How an update changes the state; shared with Live Studio's control-room copy. */
export function apply(update: SubathonUpdate) {
  return (prev: SubathonState): SubathonState => ({
    running: update.running,
    endsAt: update.endsAt,
    lastAdd: update.addedSec && update.addedSec > 0 ? { seconds: update.addedSec, at: Date.now() } : prev.lastAdd,
  });
}

export function clockOf(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const HEX = /^#[0-9a-f]{6}$/i;
const FLASH_MS = 2500;

export function SubathonTimer({ settings }: { settings: Record<string, unknown> }) {
  const { t } = useTranslation();
  const { running, endsAt, lastAdd } = useContext(SubathonContext);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  if (!running || !endsAt) return null;

  const left = Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 1000));
  const label = setting(settings, 'label', '') || t('liveOverlay.subathon');
  const tint = setting(settings, 'accent', '#ffffff');
  const flash = lastAdd && now - lastAdd.at < FLASH_MS ? lastAdd.seconds : 0;
  return (
    <div data-ow-subathon data-done={left === 0 || undefined} style={{ '--ow-accent': HEX.test(tint) ? tint : '#ffffff' } as CSSProperties}>
      <span data-ow-subathon-label>{label}</span>
      <span data-ow-subathon-clock>{left === 0 ? t('liveOverlay.subathonOver') : clockOf(left)}</span>
      {flash > 0 && (
        <span key={lastAdd!.at} data-ow-subathon-add>
          {`+${clockOf(flash).replace(/^0:/, '')}`}
        </span>
      )}
    </div>
  );
}

// ─── Points board ─────────────────────────────────────────────────────────────

export function PointsBoard({ settings }: { settings: Record<string, unknown> }) {
  const { t } = useTranslation();
  const creator = useContext(OverlayCreatorContext);
  const count = Math.min(10, Math.max(1, setting(settings, 'count', 5)));
  const title = setting(settings, 'title', '') || t('liveOverlay.pointsTitle');
  const { data } = useQuery({
    queryKey: ['points-board', creator, count],
    queryFn: () => getPointsBoard(creator, count),
    enabled: !!creator,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const rows = data ?? [];
  if (!rows.length) return null;
  return (
    <div data-ow-list style={{ '--ow-row': `calc(var(--ow-h) / ${count + 1})` } as CSSProperties}>
      <div data-ow-list-title>{title}</div>
      {rows.map((r, i) => (
        <div key={r.address} data-ow-list-row>
          <span data-ow-rank data-place={i + 1}>{i + 1}</span>
          <span data-ow-name>{r.displayName || r.username || `${r.address.slice(0, 6)}…`}</span>
          <span data-ow-amount>{t('liveOverlay.points', { count: r.points, formatted: r.points.toLocaleString() })}</span>
        </div>
      ))}
    </div>
  );
}
