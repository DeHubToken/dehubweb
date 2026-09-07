/**
 * Community Activity
 * ==================
 * One community's notifications, inside the Communities page.
 *
 * This is a *view* of the main notification system, not a second one. The rows
 * are the same rows the bell shows, fetched once by `useCommunityNotifications`
 * and handed down already filtered; the sentence, the glyph and the destination
 * all come from `lib/community-notifications`, so a row cannot read one way here
 * and another way in the bell. Marking read writes through the same table and
 * drops the bell's badge with it.
 *
 * It replaces `CommunityOwnerActivity`, which ran its own query, its own
 * (permanently silent) realtime channel and its own copy of the row markup over
 * the identical table — and matched `reference_id` against the community uuid
 * while the trigger writes its slug, so it had emptied out.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Search, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AppState } from '@/components/app/AppState';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { useMarkCommunityNotificationsRead } from '@/hooks/use-community-notifications';
import { useMarkCustomNotificationAsRead } from '@/hooks/use-custom-notifications';
import {
  communityNotificationIcon,
  communityNotificationPath,
  communityNotificationPreview,
  communityNotificationRef,
  communityNotificationSentence,
  type CommunityRef,
} from '@/lib/community-notifications';
import type { DeHubNotification } from '@/lib/api/dehub/notifications';

const PAGE_SIZE = 20;

function ActivityRow({ notification }: { notification: DeHubNotification }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const markRead = useMarkCustomNotificationAsRead();
  const { data: profile, isLoading: profileLoading } = useDeHubProfile({ userId: notification.actorAddress });

  const handle = profile?.handle;
  const avatarUrl = profile?.avatarUrl || notification.actorAvatar;
  const timeAgo = formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true });
  const TypeIcon = communityNotificationIcon(notification.type as string);

  // The raw wallet address is never the headline: it says nothing a reader can
  // act on. Prefer the resolved profile name, fall back to whatever the row
  // stored, and only show a skeleton while there is genuinely nothing to print.
  const actorName = profile?.name || notification.actorUsername;
  // The block above the row is already headed with the community's name.
  const sentence = actorName
    ? communityNotificationSentence(notification, actorName, t, { withCommunity: false })
    : null;
  const preview = communityNotificationPreview(notification);

  // A join is about the person, so it opens their profile — that is the one
  // thing an owner wants next. A mention or an @here is about the conversation,
  // so it opens the community, exactly as the same row does in the bell.
  // Either way the row is spent, so it is marked read on the way out, through
  // the bell's own mutation.
  const isJoin = (notification.type as string) === 'community_join';
  const openRow = () => {
    if (!notification.read) markRead.mutate(notification.id);
    if (isJoin) {
      if (handle) navigate(`/${handle.replace('@', '')}`);
      return;
    }
    navigate(communityNotificationPath(communityNotificationRef(notification)));
  };

  return (
    <button
      onClick={openRow}
      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors text-left"
    >
      <div className="w-9 h-9 rounded-lg bg-white/[0.08] flex items-center justify-center overflow-hidden flex-shrink-0 relative">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : profileLoading ? (
          <div className="w-full h-full animate-pulse bg-white/[0.08]" />
        ) : (
          <User className="w-4 h-4 text-zinc-500" />
        )}
        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-md bg-zinc-900 flex items-center justify-center border border-black/40">
          <TypeIcon className="w-2.5 h-2.5 text-white/70" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {sentence ? (
            <span className={`text-sm truncate ${notification.read ? 'text-zinc-400' : 'text-white'}`}>
              {sentence}
            </span>
          ) : (
            <span className="h-3.5 w-40 rounded bg-white/[0.08] animate-pulse" />
          )}
          {!notification.read && (
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
          )}
        </div>
        {preview && (
          <span className="block text-zinc-500 text-xs truncate italic">“{preview}”</span>
        )}
        <span className="text-zinc-500 text-xs">{timeAgo}</span>
      </div>
    </button>
  );
}

interface CommunityActivityProps {
  community: CommunityRef;
  /** Already narrowed to this community by the page, newest first. */
  notifications: DeHubNotification[];
}

export function CommunityActivity({ community, notifications }: CommunityActivityProps) {
  const { t } = useTranslation();
  const markRead = useMarkCommunityNotificationsRead();
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notifications;
    return notifications.filter((n) =>
      (n.actorUsername || '').toLowerCase().includes(q) ||
      (n.actorAddress || '').toLowerCase().includes(q) ||
      (n.content || '').toLowerCase().includes(q));
  }, [notifications, query]);

  const shown = filtered.slice(0, visible);

  return (
    <div className="space-y-2">
      {notifications.length > PAGE_SIZE && (
        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setVisible(PAGE_SIZE); }}
            placeholder={t('communities.activitySearch', 'Search activity...')}
            className="pl-9 h-9 bg-white/[0.04] border-white/10 text-sm rounded-lg"
          />
        </div>
      )}

      {unreadCount > 0 && (
        <div className="flex items-center justify-between px-1 mb-2">
          <span className="text-xs text-zinc-400">
            {t('communities.activityNew', { total: unreadCount, defaultValue: '{{total}} new' })}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => markRead.mutate(community)}
            disabled={markRead.isPending}
            className="h-7 px-2.5 text-xs text-zinc-400 hover:text-white"
          >
            <Check className="w-3 h-3 mr-1" />
            {t('notifications.markAllRead', 'Mark all read')}
          </Button>
        </div>
      )}

      {shown.map((notification) => (
        <ActivityRow key={notification.id} notification={notification} />
      ))}

      {filtered.length > visible && (
        <Button
          variant="ghost"
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
          className="w-full h-9 text-xs text-zinc-400 hover:text-white rounded-lg"
        >
          {t('communities.activityShowMore', { total: filtered.length - visible, defaultValue: 'Show more ({{total}})' })}
        </Button>
      )}

      {filtered.length === 0 && query && (
        <AppState
          icon="search"
          title={t('communities.activityNoMatches', { query, defaultValue: 'No matches for "{{query}}"' })}
          kind="search-empty"
          size="compact"
        />
      )}
    </div>
  );
}
