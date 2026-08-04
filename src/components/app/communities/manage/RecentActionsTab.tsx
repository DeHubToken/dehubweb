/**
 * Recent Actions
 * ==============
 * The community's moderation history, mirroring Telegram's "Recent Actions".
 * Every privileged RPC writes a row to `community_admin_log`; this surface reads
 * that log back as a timeline of sentences ("<actor> banned <target>") with the
 * action's payload unpacked underneath.
 *
 * Only readable by someone who could take those actions themselves — the query
 * is gated on `restrict_members`, matching what the server will hand over.
 */

import { memo, useMemo, useState } from 'react';
import {
  Activity,
  Link2,
  MessageSquare,
  Settings,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import {
  ADMIN_LOG_COPY,
  useCommunityAbilities,
  useCommunityAdminLog,
  type CommunityAdminLogEntry,
} from '@/hooks/use-community-admin';
import type { Community, CommunityMember } from '@/hooks/use-communities';

// ─── Buckets ─────────────────────────────────────────────────────────────────

type LogBucket = 'members' | 'messages' | 'settings' | 'invites' | 'other';
type LogFilter = 'all' | 'members' | 'messages' | 'settings' | 'invites';

const ACTION_BUCKET: Record<string, LogBucket> = {
  promote_admin: 'members',
  demote_admin: 'members',
  transfer_ownership: 'members',
  ban_member: 'members',
  unban_member: 'members',
  kick_member: 'members',
  mute_member: 'members',
  unmute_member: 'members',
  approve_member: 'members',
  reject_member: 'members',
  delete_message: 'messages',
  purge_messages: 'messages',
  pin_message: 'messages',
  unpin_message: 'messages',
  update_settings: 'settings',
  create_invite: 'invites',
  revoke_invite: 'invites',
  invite_used: 'invites',
};

const BUCKET_ICON: Record<LogBucket, LucideIcon> = {
  members: Users,
  messages: MessageSquare,
  settings: Settings,
  invites: Link2,
  other: Activity,
};

function bucketOf(action: string): LogBucket {
  return ACTION_BUCKET[action] ?? 'other';
}

const FILTERS: { key: LogFilter; i18nKey: string; fallback: string }[] = [
  { key: 'all',      i18nKey: 'all',      fallback: 'All' },
  { key: 'members',  i18nKey: 'members',  fallback: 'Members' },
  { key: 'messages', i18nKey: 'messages', fallback: 'Messages' },
  { key: 'settings', i18nKey: 'settings', fallback: 'Settings' },
  { key: 'invites',  i18nKey: 'invites',  fallback: 'Invites' },
];

/** Patch keys as they land in `detail`, mapped to something a human reads. */
const SETTING_LABELS: Record<string, string> = {
  name: 'name',
  description: 'description',
  avatar_url: 'avatar',
  banner_url: 'banner',
  is_private: 'privacy',
  rules: 'rules',
  slow_mode_seconds: 'slow mode',
  default_permissions: 'permissions',
  ticker_symbol: 'ticker',
  ticker_contract_address: 'ticker',
  ticker_chain_id: 'ticker',
  ticker_pair_address: 'ticker',
};

// ─── Formatting helpers ──────────────────────────────────────────────────────

/** A translatable phrase: a key suffix, an interpolated number, and an English default. */
interface Phrase {
  key: string;
  value: number;
  defaultValue: string;
}

/** Modelled on the helper at the top of CommunityHeader, but minute-resolution. */
function formatRelativeTime(dateString: string): Phrase {
  const then = new Date(dateString).getTime();
  if (!Number.isFinite(then)) return { key: 'justNow', value: 0, defaultValue: 'just now' };

  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return { key: 'justNow', value: 0, defaultValue: 'just now' };
  if (minutes < 60) return { key: 'minutesAgo', value: minutes, defaultValue: '{{value}}m ago' };

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: 'hoursAgo', value: hours, defaultValue: '{{value}}h ago' };

  const days = Math.floor(hours / 24);
  if (days === 1) return { key: 'yesterday', value: 1, defaultValue: 'yesterday' };
  if (days < 7) return { key: 'daysAgo', value: days, defaultValue: '{{value}}d ago' };
  if (days < 30) return { key: 'weeksAgo', value: Math.floor(days / 7), defaultValue: '{{value}}w ago' };
  if (days < 365) return { key: 'monthsAgo', value: Math.floor(days / 30), defaultValue: '{{value}}mo ago' };
  return { key: 'yearsAgo', value: Math.floor(days / 365), defaultValue: '{{value}}y ago' };
}

/** How long a ban/mute was set for, derived from when it was taken. */
function formatDuration(fromIso: string, untilIso: string): Phrase | null {
  const from = new Date(fromIso).getTime();
  const until = new Date(untilIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(until)) return null;

  const seconds = Math.round((until - from) / 1000);
  if (seconds <= 0) return null;
  if (seconds < 3600) {
    return { key: 'forMinutes', value: Math.max(1, Math.round(seconds / 60)), defaultValue: 'for {{value}} min' };
  }

  const hours = Math.round(seconds / 3600);
  if (hours < 24) return { key: 'forHours', value: hours, defaultValue: 'for {{value}}h' };

  const days = Math.round(hours / 24);
  if (days < 7) return { key: 'forDays', value: days, defaultValue: 'for {{value}}d' };
  return { key: 'forWeeks', value: Math.round(days / 7), defaultValue: 'for {{value}}w' };
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** The settings RPC logs the patch it applied — either bare or under `patch`. */
function changedSettingKeys(detail: Record<string, unknown>): string[] {
  const patch = Object.keys(asRecord(detail.patch)).length > 0 ? asRecord(detail.patch) : detail;
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const key of Object.keys(patch)) {
    const label = SETTING_LABELS[key] ?? key.replace(/_/g, ' ');
    if (seen.has(label)) continue;
    seen.add(label);
    keys.push(key);
  }
  return keys;
}

// ─── Profile bits (memoised so a row re-render does not re-resolve them) ──────

const ProfileAvatar = memo(function ProfileAvatar({ address }: { address: string }) {
  const { data: profile } = useDeHubProfile({ userId: address });
  const avatarUrl = profile?.avatarUrl;

  return (
    <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center overflow-hidden flex-shrink-0">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
      ) : (
        <User className="w-4 h-4 text-zinc-500" />
      )}
    </div>
  );
});

const ProfileName = memo(function ProfileName({ address }: { address: string }) {
  const { data: profile } = useDeHubProfile({ userId: address });
  return <span className="text-white font-medium">{profile?.name || shortAddress(address)}</span>;
});

// ─── Row ─────────────────────────────────────────────────────────────────────

const ActionRow = memo(function ActionRow({ entry }: { entry: CommunityAdminLogEntry }) {
  const { t } = useTranslation();
  const detail = useMemo(() => asRecord(entry.detail), [entry.detail]);
  const relative = useMemo(() => formatRelativeTime(entry.created_at), [entry.created_at]);

  const BucketIcon = BUCKET_ICON[bucketOf(entry.action)];
  const verb = t(`communities.manage.recentActions.action.${entry.action}`, {
    defaultValue: ADMIN_LOG_COPY[entry.action] ?? entry.action.replace(/_/g, ' '),
  });

  // Settings — the changed keys, as chips.
  const settingKeys = entry.action === 'update_settings' ? changedSettingKeys(detail) : [];

  // Messages — the deleted body, quoted.
  const content = entry.action === 'delete_message' ? asString(detail.content) : null;
  const quoted = content && content.length > 140 ? `${content.slice(0, 140)}…` : content;

  // Restrictions — how long, and why.
  const isRestriction = entry.action === 'ban_member' || entry.action === 'mute_member';
  const until = isRestriction ? asString(detail.until) : null;
  const duration = until ? formatDuration(entry.created_at, until) : null;
  const durationLabel = !isRestriction
    ? null
    : until
      ? duration && t(`communities.manage.recentActions.${duration.key}`, {
          defaultValue: duration.defaultValue,
          value: duration.value,
        })
      : t('communities.manage.recentActions.permanently', { defaultValue: 'permanently' });
  const reason = isRestriction ? asString(detail.reason) : null;

  return (
    <div className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors">
      <div className="relative flex-shrink-0">
        <ProfileAvatar address={entry.actor_wallet_address} />
        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-md bg-white/[0.12] flex items-center justify-center border border-black/40">
          <BucketIcon className="w-2.5 h-2.5 text-zinc-300" aria-hidden="true" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-zinc-400 text-sm leading-snug">
          <ProfileName address={entry.actor_wallet_address} />
          {' '}
          {verb}
          {entry.target_wallet_address && (
            <>
              {' '}
              <ProfileName address={entry.target_wallet_address} />
            </>
          )}
          {durationLabel && (
            <>
              {' '}
              <span className="text-zinc-500">{durationLabel}</span>
            </>
          )}
        </p>

        {reason && (
          <p className="text-zinc-500 text-xs mt-1 break-words">
            {t('communities.manage.recentActions.reason', {
              defaultValue: 'Reason: {{reason}}',
              reason,
            })}
          </p>
        )}

        {settingKeys.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {settingKeys.map(key => (
              <span
                key={key}
                className="px-2 py-0.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-zinc-400 text-[11px]"
              >
                {t(`communities.manage.recentActions.setting.${key}`, {
                  defaultValue: SETTING_LABELS[key] ?? key.replace(/_/g, ' '),
                })}
              </span>
            ))}
          </div>
        )}

        {quoted && (
          <blockquote className="mt-1.5 pl-2.5 border-l-2 border-white/10 text-zinc-500 text-xs italic break-words">
            {quoted}
          </blockquote>
        )}

        <span className="text-zinc-600 text-xs mt-1 block">
          {t(`communities.manage.recentActions.${relative.key}`, {
            defaultValue: relative.defaultValue,
            value: relative.value,
          })}
        </span>
      </div>
    </div>
  );
});

// ─── Tab ─────────────────────────────────────────────────────────────────────

const INITIAL_VISIBLE = 100;
const PAGE_STEP = 50;

interface RecentActionsTabProps {
  community: Community;
  membership: CommunityMember | null | undefined;
}

export function RecentActionsTab({ community, membership }: RecentActionsTabProps) {
  const { t } = useTranslation();
  const abilities = useCommunityAbilities(community, membership);
  const canRead = abilities.can('restrict_members');

  const { data: entries = [], isLoading } = useCommunityAdminLog(community.id, canRead);
  const [filter, setFilter] = useState<LogFilter>('all');
  const [visible, setVisible] = useState(INITIAL_VISIBLE);

  // The log arrives newest first; keep that order and only narrow it.
  const filtered = useMemo(
    () => (filter === 'all' ? entries : entries.filter(entry => bucketOf(entry.action) === filter)),
    [entries, filter],
  );
  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible]);

  if (!canRead) {
    return (
      <p className="text-center text-zinc-500 text-sm py-12">
        {t('communities.manage.recentActions.noAccess', {
          defaultValue: 'You do not have permission to see recent actions.',
        })}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('communities.manage.recentActions.filterLabel', { defaultValue: 'Filter actions' })}>
        {FILTERS.map(option => {
          const active = filter === option.key;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={active}
              onClick={() => { setFilter(option.key); setVisible(INITIAL_VISIBLE); }}
              className={`h-8 px-3 rounded-xl text-xs border transition-colors ${
                active
                  ? 'bg-white/[0.12] border-white/20 text-white'
                  : 'bg-white/[0.04] border-white/10 text-zinc-400 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              {t(`communities.manage.recentActions.filter.${option.i18nKey}`, { defaultValue: option.fallback })}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 p-2.5">
                <div className="w-9 h-9 rounded-full bg-white/[0.06] animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3.5 w-48 rounded bg-white/[0.06] animate-pulse" />
                  <div className="h-3 w-20 rounded bg-white/[0.04] animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="text-center text-zinc-500 text-sm py-10">
            {filter === 'all'
              ? t('communities.manage.recentActions.empty', {
                  defaultValue: 'Nothing here yet. Moderation actions will show up as they happen.',
                })
              : t('communities.manage.recentActions.emptyFilter', {
                  defaultValue: 'No actions of this kind yet.',
                })}
          </p>
        ) : (
          <div className="space-y-0.5">
            {shown.map(entry => (
              <ActionRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>

      {filtered.length > shown.length && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setVisible(v => v + PAGE_STEP)}
          className="w-full rounded-xl h-9 px-3 text-xs text-zinc-400 hover:text-white hover:bg-white/[0.06] border border-white/[0.08]"
        >
          {t('communities.manage.recentActions.showMore', {
            defaultValue: 'Show more ({{value}})',
            value: filtered.length - shown.length,
          })}
        </Button>
      )}
    </div>
  );
}
