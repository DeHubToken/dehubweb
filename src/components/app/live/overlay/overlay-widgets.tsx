/**
 * The widgets a creator can place on their stream.
 *
 * Each one is drawn the same way wherever an overlay is drawn — over a viewer's
 * player here, and by the OBS page and Live Studio later — so none of them
 * knows where it is. They get their box size through CSS variables, their
 * settings as stored, and the stream's events through useOverlayEvent.
 *
 * Nothing a creator typed is ever rendered as markup. Text settings are
 * interpolated by React, and media is limited to avatars from our own CDN.
 */
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Clock, Eye, Heart } from 'lucide-react';
import { DhbCoin } from '@/components/app/DhbAmount';
import { GiftAnimationOverlay } from '@/components/app/live/GiftAnimationOverlay';
import { useGiftAnimations } from '@/hooks/use-gift-animations';
import { useLiveAudience } from '@/hooks/use-live-audience';
import type { LiveAudience } from '@/lib/api/dehub/livestream';
import { tierFromGift } from '@/lib/live/gift-tiers';
import { buildAvatarUrl } from '@/lib/media-url';
import { setting, type OverlayKind } from '@/lib/live-overlay/registry';
import { WHEEL_SPIN_MS } from '@/lib/live-overlay/rules';
import type { OverlayStats } from '@/lib/live-overlay/types';
import type { LiveRoomEvent, StreamJoinUser } from '@/lib/api/dehub/stream-presence';
import { useOverlayEvent } from './overlay-events';
import { useAlertQueue } from './use-alert-queue';
import { useRuleFired } from './rule-bus';
import { PollWidget } from './poll';
import { PointsBoard, SubathonTimer } from './subathon';
import { StreamerLevel, TipJar } from './level-and-jar';

export interface WidgetProps {
  settings: Record<string, unknown>;
  streamId: string;
  stats: OverlayStats;
  initialViewers: number;
}

const HEX = /^#[0-9a-f]{6}$/i;
/** A creator's accent colour, or white. Only a plain hex reaches a style. */
function accent(settings: Record<string, unknown>): string {
  const c = setting(settings, 'accent', '#ffffff');
  return HEX.test(c) ? c : '#ffffff';
}

function useName(user: StreamJoinUser | undefined): string {
  const { t } = useTranslation();
  return user?.displayName || user?.username || t('liveOverlay.someone');
}

const Avatar = memo(({ user }: { user: StreamJoinUser | undefined }) => {
  const src = user?.address ? buildAvatarUrl(user.address, user.avatarImageUrl) : undefined;
  return src ? <img data-ow-avatar src={src} alt="" loading="lazy" decoding="async" /> : <span data-ow-avatar />;
});
Avatar.displayName = 'OverlayAvatar';

// ─── Tip alert ────────────────────────────────────────────────────────────────

interface TipItem {
  amount: number;
  selectedTier?: string;
  user: StreamJoinUser;
  message?: string;
}

/**
 * How long an unconfirmed tip is held when the creator only wants paid ones on
 * screen. Past this the chain never confirmed it, and it is quietly dropped.
 */
const CONFIRM_WAIT_MS = 120_000;

function TipAlert({ settings }: WidgetProps) {
  const style = setting(settings, 'style', 'celebration');
  const minAmount = setting(settings, 'minAmount', 0);
  const showMessage = setting(settings, 'showMessage', true);
  const confirmedOnly = setting(settings, 'confirmedOnly', false);

  const { items: celebrations, enqueue } = useGiftAnimations();
  const banner = useAlertQueue<TipItem>((item) => tierFromGift(item).durationMs);
  const held = useRef(new Map<string, { item: TipItem; at: number }>());

  const play = (item: TipItem) => {
    if (item.amount < minAmount) return;
    const shown = showMessage ? item : { ...item, message: undefined };
    if (style === 'banner') banner.push(shown);
    else enqueue({ amount: shown.amount, selectedTier: shown.selectedTier, username: shown.user.displayName || shown.user.username, message: shown.message });
  };

  useOverlayEvent((event: LiveRoomEvent) => {
    if (event.type === 'tip') {
      const item = { amount: event.amount, selectedTier: event.selectedTier, user: event.user, message: event.message };
      if (!confirmedOnly) return play(item);
      if (!event.transactionHash) return;
      const now = Date.now();
      for (const [hash, entry] of held.current) if (now - entry.at > CONFIRM_WAIT_MS) held.current.delete(hash);
      held.current.set(event.transactionHash, { item, at: now });
    } else if (event.type === 'tipConfirmed' && confirmedOnly) {
      const entry = held.current.get(event.transactionHash);
      if (!entry) return;
      held.current.delete(event.transactionHash);
      // The paid amount, not the claim, and the tier that amount actually buys.
      play({ ...entry.item, amount: event.paidAmount, selectedTier: undefined });
    }
  });

  if (style !== 'banner') {
    return <GiftAnimationOverlay items={celebrations} className="inset-0 h-full w-full" />;
  }
  return banner.current ? <TipBanner key={banner.current.id} item={banner.current.item} leaving={banner.current.leaving} /> : null;
}

function TipBanner({ item, leaving }: { item: TipItem; leaving: boolean }) {
  const { t } = useTranslation();
  const tier = tierFromGift(item);
  const name = useName(item.user);
  return (
    <div data-ow-alert data-leaving={leaving || undefined}>
      <div data-ow-card>
        <span data-ow-emoji aria-hidden>{tier.emoji}</span>
        <div data-ow-lines>
          <div data-ow-title>{name}</div>
          <div data-ow-sub>
            {t(tier.labelKey, tier.name)} · {item.amount.toLocaleString()} <DhbCoin />
          </div>
          {item.message && <div data-ow-message>{item.message}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Follow, subscribe, share, join ───────────────────────────────────────────

interface PersonItem {
  user: StreamJoinUser;
  planName?: string;
}

const PERSON_EVENT: Partial<Record<OverlayKind, LiveRoomEvent['type']>> = {
  follow_alert: 'follow',
  subscribe_alert: 'subscribe',
  share_alert: 'share',
  join_alert: 'join',
};

function PersonAlert({ settings, kind }: WidgetProps & { kind: OverlayKind }) {
  const durationMs = setting(settings, 'durationMs', 5000);
  const queue = useAlertQueue<PersonItem>(() => durationMs);
  // The gateway re-sends a viewer's join on every reconnect. Each person
  // arrives once.
  const seen = useRef(new Set<string>());
  const wanted = PERSON_EVENT[kind];

  useOverlayEvent((event: LiveRoomEvent) => {
    if (event.type !== wanted || !('user' in event) || !event.user) return;
    if (event.type === 'join') {
      const key = event.user.address;
      if (!key || seen.current.has(key)) return;
      seen.current.add(key);
    }
    queue.push({ user: event.user, planName: event.type === 'subscribe' ? event.planName : undefined });
  });

  if (!queue.current) return null;
  return <PersonBanner key={queue.current.id} kind={kind} item={queue.current.item} leaving={queue.current.leaving} />;
}

function PersonBanner({ kind, item, leaving }: { kind: OverlayKind; item: PersonItem; leaving: boolean }) {
  const { t } = useTranslation();
  const name = useName(item.user);
  const line =
    kind === 'follow_alert'
      ? t('liveOverlay.newFollower', { name })
      : kind === 'subscribe_alert'
        ? item.planName
          ? t('liveOverlay.subscribedTo', { name, plan: item.planName })
          : t('liveOverlay.newSubscriber', { name })
        : kind === 'share_alert'
          ? t('liveOverlay.shared', { name })
          : t('liveOverlay.joined', { name });
  return (
    <div data-ow-alert data-leaving={leaving || undefined}>
      <div data-ow-card>
        <Avatar user={item.user} />
        <div data-ow-lines>
          <div data-ow-title>{line}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Goal bar ─────────────────────────────────────────────────────────────────

function GoalBar({ settings, stats }: WidgetProps) {
  const { t } = useTranslation();
  const metric = setting(settings, 'metric', 'tips') === 'followers' ? 'followers' : 'tips';
  const target = Math.max(1, setting(settings, 'target', metric === 'tips' ? 1_000_000 : 1000));
  const title = setting(settings, 'title', '');
  const base = metric === 'tips' ? stats.totalTips : stats.followers;

  // Counted on top of the server's figure until the server's figure moves; a
  // fresh `stats` already includes everything counted here.
  const [delta, setDelta] = useState(0);
  useEffect(() => setDelta(0), [base]);

  useOverlayEvent((event: LiveRoomEvent) => {
    if (metric === 'tips' && event.type === 'tipConfirmed') setDelta((d) => d + event.paidAmount);
    if (metric === 'followers' && event.type === 'follow') setDelta((d) => d + 1);
  });

  const value = base + delta;
  const reached = value >= target;
  const progress = Math.min(1, value / target);

  return (
    <div data-ow-goal data-reached={reached || undefined} style={{ '--ow-accent': accent(settings) } as CSSProperties}>
      <div data-ow-goal-head>
        <span>{reached ? t('liveOverlay.goalReached') : title}</span>
        <span>
          {Math.floor(value).toLocaleString()} / {target.toLocaleString()}{' '}
          {metric === 'tips' ? <DhbCoin /> : t('liveOverlay.followersUnit')}
        </span>
      </div>
      <div data-ow-goal-track>
        <div data-ow-goal-fill style={{ transform: `scaleX(${progress})` }} />
      </div>
    </div>
  );
}

// ─── Top supporters ───────────────────────────────────────────────────────────

const PREVIEW_SUPPORTERS: LiveAudience['topTippers'] = [
  500_000, 250_000, 100_000, 50_000, 25_000, 10_000, 5_000, 2_500, 1_000, 500,
].map((total, i) => ({ address: `preview-${i}`, displayName: '—', total, count: 1 }));

function TopSupporters({ settings, streamId }: WidgetProps) {
  const { t } = useTranslation();
  const count = Math.min(10, Math.max(1, setting(settings, 'count', 3)));
  const title = setting(settings, 'title', '') || t('liveOverlay.topSupporters');
  const queryClient = useQueryClient();
  const { data } = useLiveAudience(streamId);

  // Confirmed tips only: the board counts what the chain paid, as the
  // audience endpoint does. Debounced so a burst of gifts is one refetch.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);
  useOverlayEvent((event: LiveRoomEvent) => {
    if (event.type !== 'tipConfirmed' || pending.current) return;
    pending.current = setTimeout(() => {
      pending.current = null;
      void queryClient.invalidateQueries({ queryKey: ['live-audience', streamId] });
    }, 1500);
  });

  // With no stream behind it (Live Studio's preview) the board shows the shape
  // it will have, so a creator can size it before anyone has tipped.
  const rows = (streamId ? data?.topTippers ?? [] : PREVIEW_SUPPORTERS).slice(0, count);
  return (
    <div data-ow-list style={{ '--ow-row': `calc(var(--ow-h) / ${count + 1})` } as CSSProperties}>
      <div data-ow-list-title>{title}</div>
      {rows.map((row, i) => (
        <div data-ow-list-row key={row.address}>
          <span data-ow-rank>{i + 1}</span>
          <span data-ow-name>{row.displayName || row.username || t('liveOverlay.someone')}</span>
          <span data-ow-amount>
            {Math.floor(row.total).toLocaleString()} <DhbCoin />
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Viewer count ─────────────────────────────────────────────────────────────

function ViewerCount({ initialViewers }: WidgetProps) {
  const [count, setCount] = useState(initialViewers);
  useOverlayEvent((event: LiveRoomEvent) => {
    if (event.type === 'viewers') setCount(event.count);
  });
  return (
    <div data-ow-counter>
      <Eye aria-hidden />
      {count.toLocaleString()}
    </div>
  );
}

// ─── Text and lower third ─────────────────────────────────────────────────────

function TextWidget({ settings }: WidgetProps) {
  const style = setting(settings, 'style', 'plain') === 'lower_third' ? 'lower_third' : 'plain';
  const text = setting(settings, 'text', '');
  const subtext = setting(settings, 'subtext', '');
  if (!text && !subtext) return null;
  return (
    <div data-ow-text data-style={style} style={{ '--ow-accent': accent(settings) } as CSSProperties}>
      {text && <div>{text}</div>}
      {subtext && <div data-ow-sub>{subtext}</div>}
    </div>
  );
}

// ─── Frame ────────────────────────────────────────────────────────────────────

function Frame({ settings }: WidgetProps) {
  const style = setting(settings, 'style', 'solid') === 'glow' ? 'glow' : 'solid';
  // Thickness and rounding are thousandths of the widget's height, so a frame
  // reads the same at every size the stream is watched at.
  const thickness = Math.min(80, Math.max(1, setting(settings, 'thickness', 6)));
  const radius = Math.min(300, Math.max(0, setting(settings, 'radius', 0)));
  const vars = useMemo(
    () =>
      ({
        '--ow-accent': accent(settings),
        '--ow-frame-w': `calc(var(--ow-h) * ${thickness / 1000})`,
        '--ow-frame-r': `calc(var(--ow-h) * ${radius / 1000})`,
      }) as CSSProperties,
    [settings, thickness, radius],
  );
  return <div data-ow-frame data-style={style} style={vars} />;
}

// ─── Stream timer ─────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function StreamTimer({ settings, stats }: WidgetProps) {
  const label = setting(settings, 'label', '');
  // The stream's own start, so a refresh does not restart the clock. A
  // preview has none and counts from when it was drawn.
  const [drawnAt] = useState(() => Date.now());
  const startedAt = stats.startedAt ? Date.parse(stats.startedAt) : NaN;
  const from = Number.isFinite(startedAt) ? startedAt : drawnAt;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div data-ow-counter style={{ '--ow-accent': accent(settings) } as CSSProperties}>
      <Clock aria-hidden />
      {label && <span data-ow-counter-label>{label}</span>}
      <span data-ow-tabular>{formatElapsed(now - from)}</span>
    </div>
  );
}

// ─── Reaction counter ─────────────────────────────────────────────────────────

function ReactionCounter({ settings, stats }: WidgetProps) {
  const base = Number(stats.reactions) || 0;
  // Counted on top of the server's figure until a fresh one replaces it.
  const [delta, setDelta] = useState(0);
  useEffect(() => setDelta(0), [base]);
  useOverlayEvent((event: LiveRoomEvent) => {
    if (event.type === 'reaction') setDelta((d) => d + 1);
  });
  return (
    <div data-ow-counter style={{ '--ow-accent': accent(settings) } as CSSProperties}>
      <Heart aria-hidden />
      <span data-ow-tabular>{(base + delta).toLocaleString()}</span>
    </div>
  );
}

// ─── Event feed ───────────────────────────────────────────────────────────────

interface FeedItem {
  id: number;
  kind: 'tip' | 'follow' | 'subscribe' | 'share';
  user: StreamJoinUser;
  amount?: number;
  planName?: string;
}

function EventFeed({ settings }: WidgetProps) {
  const count = Math.min(8, Math.max(1, setting(settings, 'count', 4)));
  const title = setting(settings, 'title', '');
  const [items, setItems] = useState<FeedItem[]>([]);
  const seq = useRef(0);
  // Tips are listed once PAID. The paid event names its sender on a current
  // API; the claim that came first is the fallback for the name.
  const tippers = useRef(new Map<string, StreamJoinUser>());

  useOverlayEvent((event: LiveRoomEvent) => {
    let item: Omit<FeedItem, 'id'> | null = null;
    if (event.type === 'tip' && event.transactionHash) {
      tippers.current.set(event.transactionHash, event.user);
      if (tippers.current.size > 50) tippers.current.delete(tippers.current.keys().next().value as string);
    } else if (event.type === 'tipConfirmed') {
      const user = event.user ?? tippers.current.get(event.transactionHash) ?? { address: event.address };
      item = { kind: 'tip', user, amount: event.paidAmount };
    } else if (event.type === 'follow' || event.type === 'share') {
      item = { kind: event.type, user: event.user };
    } else if (event.type === 'subscribe') {
      item = { kind: 'subscribe', user: event.user, planName: event.planName };
    }
    if (!item) return;
    seq.current += 1;
    const next = { ...item, id: seq.current };
    setItems((prev) => [next, ...prev].slice(0, count));
  });

  return (
    <div data-ow-list style={{ '--ow-row': `calc(var(--ow-h) / ${count + (title ? 1 : 0)})` } as CSSProperties}>
      {title && <div data-ow-list-title>{title}</div>}
      {items.map((item) => (
        <FeedRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  const { t } = useTranslation();
  const name = useName(item.user);
  const line =
    item.kind === 'tip'
      ? t('liveOverlay.tipped', { name })
      : item.kind === 'follow'
        ? t('liveOverlay.newFollower', { name })
        : item.kind === 'subscribe'
          ? item.planName
            ? t('liveOverlay.subscribedTo', { name, plan: item.planName })
            : t('liveOverlay.newSubscriber', { name })
          : t('liveOverlay.shared', { name });
  return (
    <div data-ow-list-row data-ow-enter>
      <span data-ow-name>{line}</span>
      {item.kind === 'tip' && (
        <span data-ow-amount>
          {Math.floor(item.amount ?? 0).toLocaleString()} <DhbCoin />
        </span>
      )}
    </div>
  );
}

// ─── Chat box ─────────────────────────────────────────────────────────────────

interface ChatItem {
  id: string;
  text: string;
  user: StreamJoinUser;
}

function ChatBox({ settings, streamId }: WidgetProps) {
  const { t } = useTranslation();
  const count = Math.min(12, Math.max(1, setting(settings, 'count', 6)));
  const showAvatars = setting(settings, 'showAvatars', true);
  const [lines, setLines] = useState<ChatItem[]>([]);

  useOverlayEvent((event: LiveRoomEvent) => {
    if (event.type === 'chat') {
      setLines((prev) => (prev.some((l) => l.id === event.id) ? prev : [...prev, event].slice(-count)));
    } else if (event.type === 'chatDeleted') {
      setLines((prev) => prev.filter((l) => l.id !== event.id));
    }
  });

  return (
    <div data-ow-chat style={{ '--ow-row': `calc(var(--ow-h) / ${count})` } as CSSProperties}>
      {lines.length === 0 && !streamId && <div data-ow-chat-line data-preview>{t('liveOverlay.chatPreview')}</div>}
      {lines.map((line) => (
        <ChatLine key={line.id} line={line} showAvatar={showAvatars} />
      ))}
    </div>
  );
}

function ChatLine({ line, showAvatar }: { line: ChatItem; showAvatar: boolean }) {
  const name = useName(line.user);
  return (
    <div data-ow-chat-line data-ow-enter>
      {showAvatar && <Avatar user={line.user} />}
      <span data-ow-chat-name>{name}</span>
      <span data-ow-chat-text>{line.text}</span>
    </div>
  );
}

// ─── Ticker ───────────────────────────────────────────────────────────────────

const TICKER_SECONDS: Record<string, number> = { slow: 30, normal: 18, fast: 10 };

function Ticker({ settings }: WidgetProps) {
  const text = setting(settings, 'text', '');
  const seconds = TICKER_SECONDS[setting(settings, 'speed', 'normal')] ?? TICKER_SECONDS.normal;
  if (!text) return null;
  // Two copies side by side, moved by half the track: the second copy is
  // exactly where the first began when the loop restarts, so it never jumps.
  return (
    <div data-ow-ticker style={{ '--ow-accent': accent(settings), '--ow-ticker-s': `${seconds}s` } as CSSProperties}>
      <div data-ow-ticker-track>
        <span>{text}</span>
        <span aria-hidden>{text}</span>
      </div>
    </div>
  );
}

// ─── Rule alerts ──────────────────────────────────────────────────────────────

interface RuleAlertItem {
  text: string;
  user: StreamJoinUser;
  durationMs: number;
}

/** Where a fired stream rule's alert text appears. Sounds and read-aloud need no place. */
function RuleAlert(_: WidgetProps) {
  const queue = useAlertQueue<RuleAlertItem>((item) => item.durationMs);
  useRuleFired((fired) => {
    const show = () => {
      for (const alert of fired.alerts) queue.push({ text: alert.text, user: fired.user, durationMs: alert.durationMs });
    };
    // An alert that names where a wheel stopped waits until it has stopped.
    if (fired.wheels.length) window.setTimeout(show, WHEEL_SPIN_MS);
    else show();
  });
  if (!queue.current) return null;
  const { item, leaving, id } = queue.current;
  return (
    <div key={id} data-ow-alert data-leaving={leaving || undefined}>
      <div data-ow-card>
        <Avatar user={item.user} />
        <div data-ow-lines>
          <div data-ow-title>{item.text}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Spin wheel ───────────────────────────────────────────────────────────────

const WHEEL_COLORS = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#14b8a6', '#ec4899', '#eab308', '#6366f1', '#10b981', '#ef4444', '#0ea5e9'];
/** How long the result stays up after the wheel lands. */
const WHEEL_HOLD_MS = 4000;

interface SpinItem {
  segments: string[];
  result: number;
  user: StreamJoinUser;
}

/**
 * A stream rule's wheel. The server already chose where it stops; this only
 * turns it there, so every viewer and the OBS picture land on the same answer.
 */
function SpinWheel(_: WidgetProps) {
  const queue = useAlertQueue<SpinItem>(() => WHEEL_SPIN_MS + WHEEL_HOLD_MS);
  useRuleFired((fired) => {
    for (const wheel of fired.wheels) queue.push({ ...wheel, user: fired.user });
  });
  if (!queue.current) return null;
  const { item, leaving, id } = queue.current;
  return <WheelFace key={id} item={item} leaving={leaving} />;
}

function WheelFace({ item, leaving }: { item: SpinItem; leaving: boolean }) {
  const { t } = useTranslation();
  const name = useName(item.user);
  const n = item.segments.length;
  const slice = 360 / n;
  // Five full turns, then the chosen slice's middle under the pointer at the top.
  const target = 360 * 5 + (360 - (item.result + 0.5) * slice);
  const [angle, setAngle] = useState(0);
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setAngle(target));
    const done = window.setTimeout(() => setLanded(true), WHEEL_SPIN_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(done);
    };
  }, [target]);
  const gradient = item.segments
    .map((_, i) => `${WHEEL_COLORS[i % WHEEL_COLORS.length]} ${i * slice}deg ${(i + 1) * slice}deg`)
    .join(', ');

  return (
    <div data-ow-wheel data-leaving={leaving || undefined}>
      <div data-ow-wheel-stage>
        <span data-ow-wheel-pointer aria-hidden />
        <div
          data-ow-wheel-disc
          style={{ background: `conic-gradient(${gradient})`, transform: `rotate(${angle}deg)`, '--ow-wheel-ms': `${WHEEL_SPIN_MS}ms` } as CSSProperties}
        >
          {item.segments.map((segment, i) => (
            <span key={i} data-ow-wheel-label style={{ transform: `rotate(${(i + 0.5) * slice}deg)` }}>
              <span>{segment}</span>
            </span>
          ))}
        </div>
      </div>
      <div data-ow-wheel-result data-shown={landed || undefined}>
        {t('liveOverlay.wheelLanded', { name, result: item.segments[item.result] })}
      </div>
    </div>
  );
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export function OverlayWidgetView({ kind, ...props }: WidgetProps & { kind: OverlayKind }) {
  switch (kind) {
    case 'tip_alert':
      return <TipAlert {...props} />;
    case 'follow_alert':
    case 'subscribe_alert':
    case 'share_alert':
    case 'join_alert':
      return <PersonAlert {...props} kind={kind} />;
    case 'goal_bar':
      return <GoalBar {...props} />;
    case 'top_supporters':
      return <TopSupporters {...props} />;
    case 'viewer_count':
      return <ViewerCount {...props} />;
    case 'text':
      return <TextWidget {...props} />;
    case 'frame':
      return <Frame {...props} />;
    case 'stream_timer':
      return <StreamTimer {...props} />;
    case 'reaction_counter':
      return <ReactionCounter {...props} />;
    case 'event_feed':
      return <EventFeed {...props} />;
    case 'chat_box':
      return <ChatBox {...props} />;
    case 'ticker':
      return <Ticker {...props} />;
    case 'rule_alert':
      return <RuleAlert {...props} />;
    case 'poll':
      return <PollWidget settings={props.settings} />;
    case 'spin_wheel':
      return <SpinWheel {...props} />;
    case 'subathon_timer':
      return <SubathonTimer settings={props.settings} />;
    case 'points_board':
      return <PointsBoard settings={props.settings} />;
    case 'streamer_level':
      return <StreamerLevel settings={props.settings} />;
    case 'tip_jar':
      return <TipJar settings={props.settings} stats={props.stats} />;
    default:
      return null;
  }
}
