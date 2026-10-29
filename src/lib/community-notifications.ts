/**
 * Community notifications, in one place
 * =====================================
 * Joins, join requests, @mentions and @here all land in the same
 * `custom_notifications` table the notification bell reads. They used to be
 * read twice: once by the bell, and once by a parallel set of hooks behind the
 * Communities page which ran their own queries, their own realtime channel,
 * their own mark-read path and their own row markup over the identical rows.
 *
 * Two readers of one table drift. The trigger writes the community's *slug*
 * into `reference_id` (that is what `/app/communities/<key>` is keyed on) while
 * the Communities page matched it against the community's *uuid*, so its
 * Activity tab and its unread badges emptied out while the bell carried on
 * working — the same notification counted in one badge and not the other.
 *
 * So everything that decides what a community notification *is* lives here:
 * which types count, which community a row belongs to, what it says, and where
 * tapping it goes. The bell and the Communities page are both views of this.
 *
 * @module lib/community-notifications
 */

import Megaphone from "@/components/ui/cut-icons/advertising";
import MessageSquareText from "@/components/ui/cut-icons/messages";
import UsersRound from "@/components/ui/cut-icons/communities";

import type { DeHubNotification } from '@/lib/api/dehub/notifications';

/** Every type written against a community. Order is display order, not priority. */
export const COMMUNITY_NOTIFICATION_TYPES = [
  'community_join',
  'community_mention',
  'community_here',
  'community_chat',
] as const;

export type CommunityNotificationType = (typeof COMMUNITY_NOTIFICATION_TYPES)[number];

const TYPE_SET: ReadonlySet<string> = new Set(COMMUNITY_NOTIFICATION_TYPES);

export function isCommunityNotificationType(type: string | null | undefined): type is CommunityNotificationType {
  return !!type && TYPE_SET.has(type);
}

export function isCommunityNotification(notification: DeHubNotification): boolean {
  return isCommunityNotificationType(notification.type as string);
}

/** A community, as much of one as any of these helpers needs. */
export interface CommunityRef {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
}

type WithCustomFields = DeHubNotification & {
  _customReferenceId?: string;
  _customReferenceTitle?: string;
};

/**
 * The community this row points at.
 *
 * Supabase-backed rows carry their target in `_customReferenceId` rather than
 * in the API's `tokenId`, which means a post and is not one here.
 */
export function communityNotificationRef(notification: DeHubNotification): string | undefined {
  return (notification as WithCustomFields)._customReferenceId || chatMeta(notification)?.communitySlug;
}

/**
 * Grouped chat rows come from the DeHub API, not Supabase, so they carry the
 * community and the people talking in `metadata` (backend
 * community-chat-notification.service.ts).
 */
interface CommunityChatMeta {
  communitySlug?: string;
  communityName?: string;
  senders?: { a: string; n: string }[];
  senderCount?: number;
}

function chatMeta(notification: DeHubNotification): CommunityChatMeta | undefined {
  if ((notification.type as string) !== 'community_chat') return undefined;
  return (notification as DeHubNotification & { metadata?: CommunityChatMeta }).metadata;
}

/** The community's display name, when the row stored one. */
export function communityNotificationTitle(notification: DeHubNotification): string | undefined {
  return (notification as WithCustomFields)._customReferenceTitle || chatMeta(notification)?.communityName || notification.tokenTitle || undefined;
}

/**
 * Match a row's reference against a community, by slug *or* id.
 *
 * `notify_community_join()` has been rewritten in both directions inside a
 * single day — uuid, then slug, then uuid again as two migrations landed out of
 * order — so the table holds both forms and always will for the rows already
 * written. Accepting either is what stops one more trigger edit silently
 * emptying this surface again.
 */
export function communityNotificationMatches(
  referenceId: string | null | undefined,
  community: CommunityRef | null | undefined,
): boolean {
  if (!referenceId || !community) return false;
  const key = referenceId.toLowerCase();
  return key === community.slug?.toLowerCase() || key === community.id?.toLowerCase();
}

/** The keys a community's rows can be filed under, for an `in (…)` filter. */
export function communityNotificationRefs(community: CommunityRef | null | undefined): string[] {
  if (!community) return [];
  return [community.slug, community.id]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((value) => value.toLowerCase());
}

/**
 * Where tapping the row goes. `useCommunity` resolves a uuid as readily as a
 * slug, so either reference form opens the right page.
 */
export function communityNotificationPath(referenceId: string | null | undefined, type?: string): string {
  if (!referenceId) return '/app/communities';
  // Chat rows open straight on the chat tab, where the conversation is.
  return `/app/communities/${referenceId}${type === 'community_chat' ? '?tab=chat' : ''}`;
}

/** The glyph on the row, shared so the bell and the Activity tab cannot disagree. */
export function communityNotificationIcon(type: string) {
  if (type === 'community_here') return Megaphone;
  if (type === 'community_mention' || type === 'community_chat') return MessageSquareText;
  return UsersRound;
}

/**
 * The trigger stores the predicate rather than a flag, so this is how a request
 * is told apart from a completed join. Approving a request fires the trigger a
 * second time and writes the "joined" row, so both exist for the same member.
 */
const JOIN_REQUEST_CONTENT = 'requested to join your community';

export function isCommunityJoinRequest(notification: DeHubNotification): boolean {
  return (
    (notification.type as string) === 'community_join' &&
    (notification.content || '').trim().toLowerCase() === JOIN_REQUEST_CONTENT
  );
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * One translated line, with its English written down beside it.
 *
 * The bell hands `getNotificationContent` an optional translator that falls back
 * to returning the key, and i18next itself returns the key for a locale that has
 * not got the string yet. Either way the row would render
 * "notifications.community.joinedNamed" at a reader, so an untranslated key
 * falls through to the English and gets interpolated here.
 */
function line(t: Translate, key: string, fallback: string, values: Record<string, string | undefined>): string {
  const translated = t(key, { ...values, defaultValue: fallback });
  const text = translated && translated !== key ? translated : fallback;
  return text.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => values[name] ?? '');
}

/**
 * The sentence the row renders.
 *
 * `@mention` and `@here` rows store the message text in `content`, so before
 * this they fell through the bell's `default` branch and rendered the bare
 * message with no subject — "check this out everyone" on its own line, which
 * reads as a broken row rather than as a mention. The message survives as the
 * preview underneath; see `communityNotificationPreview`.
 */
export function communityNotificationSentence(
  notification: DeHubNotification,
  actorName: string,
  t: Translate,
  /**
   * Drop the community's name from the sentence. The Communities page already
   * heads each block with it, so repeating it turns every row into "alice
   * joined “DeHub Whales”" under a heading that reads "DeHub Whales".
   */
  options?: { withCommunity?: boolean },
): string {
  const community = options?.withCommunity === false ? undefined : communityNotificationTitle(notification);
  const named = !!community;
  const values = { name: actorName, community };

  switch (notification.type as string) {
    case 'community_chat':
      return communityChatSentence(notification, actorName, t, community);
    case 'community_join':
      if (isCommunityJoinRequest(notification)) {
        return named
          ? line(t, 'notifications.community.requestedNamed', '{{name}} asked to join “{{community}}”', values)
          : line(t, 'notifications.community.requested', '{{name}} asked to join your community', values);
      }
      return named
        ? line(t, 'notifications.community.joinedNamed', '{{name}} joined “{{community}}”', values)
        : line(t, 'notifications.community.joined', '{{name}} joined your community', values);
    case 'community_here':
      return named
        ? line(t, 'notifications.community.hereNamed', '{{name}} messaged everyone in “{{community}}”', values)
        : line(t, 'notifications.community.here', '{{name}} messaged everyone in the community', values);
    default:
      return named
        ? line(t, 'notifications.community.mentionedNamed', '{{name}} mentioned you in “{{community}}”', values)
        : line(t, 'notifications.community.mentioned', '{{name}} mentioned you in a community', values);
  }
}

/**
 * "James sent a message in X", "James and Charlie sent messages in X",
 * "James + 2 others sent messages in X". Whoever spoke first leads.
 */
function communityChatSentence(
  notification: DeHubNotification,
  actorName: string,
  t: Translate,
  community: string | undefined,
): string {
  const meta = chatMeta(notification);
  const senders = meta?.senders || [];
  const count = Math.max(meta?.senderCount || 0, senders.length, notification.aggregatedCount || 0, 1);
  const values = {
    name: senders[0]?.n || actorName,
    second: senders[1]?.n || '',
    others: String(count - 1),
    community,
  };
  if (count === 1) {
    return community
      ? line(t, 'notifications.community.chatOneNamed', '{{name}} sent a message in {{community}}', values)
      : line(t, 'notifications.community.chatOne', '{{name}} sent a message', values);
  }
  if (count === 2) {
    return community
      ? line(t, 'notifications.community.chatTwoNamed', '{{name}} and {{second}} sent messages in {{community}}', values)
      : line(t, 'notifications.community.chatTwo', '{{name}} and {{second}} sent messages', values);
  }
  return community
    ? line(t, 'notifications.community.chatManyNamed', '{{name}} + {{others}} others sent messages in {{community}}', values)
    : line(t, 'notifications.community.chatMany', '{{name}} + {{others}} others sent messages', values);
}

/**
 * The chat message that caused a mention or an @here, for the secondary line.
 * Join rows have no message — their `content` is the predicate the sentence
 * above already spent, so repeating it under the sentence would just stutter.
 */
export function communityNotificationPreview(notification: DeHubNotification): string | undefined {
  const type = notification.type as string;
  if (type !== 'community_mention' && type !== 'community_here') return undefined;
  const preview = (notification.content || '').trim();
  return preview.length > 0 ? preview : undefined;
}
