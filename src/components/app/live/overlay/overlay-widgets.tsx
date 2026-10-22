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
import { Eye } from 'lucide-react';
import { DhbCoin } from '@/components/app/DhbAmount';
import { GiftAnimationOverlay } from '@/components/app/live/GiftAnimationOverlay';
import { useGiftAnimations } from '@/hooks/use-gift-animations';
import { useLiveAudience } from '@/hooks/use-live-audience';
import { tierFromGift } from '@/lib/live/gift-tiers';
import { buildAvatarUrl } from '@/lib/media-url';
import { setting, type OverlayKind } from '@/lib/live-overlay/registry';
import type { OverlayStats } from '@/lib/live-overlay/types';
import type { LiveRoomEvent, StreamJoinUser } from '@/lib/api/dehub/stream-presence';
import { useOverlayEvent } from './overlay-events';
import { useAlertQueue } from './use-alert-queue';

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
    if (event.type !== wanted || !('user' in event)) return;
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
      ? t('liveOverlay.followed', { name })
      : kind === 'subscribe_alert'
        ? item.planName
          ? t('liveOverlay.subscribedTo', { name, plan: item.planName })
          : t('liveOverlay.subscribed', { name })
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

  const rows = (data?.topTippers ?? []).slice(0, count);
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
    default:
      return null;
  }
}
