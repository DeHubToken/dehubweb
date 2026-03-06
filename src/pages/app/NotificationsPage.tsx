import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';
import { useTranslation } from 'react-i18next';
import { Settings, ThumbsUp, MessageSquareText, DollarSign, Users, Bell, Check, Loader2, UserPlus, Trophy, AlertTriangle, Video, Zap, Trash2, MailOpen, Mail, Repeat2, Star } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/app/AuthGate';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { 
  useNotifications, 
  useUnreadNotificationCount, 
  useMarkAllNotificationsAsRead, 
  useMarkNotificationAsRead,
  type DeHubNotification,
  type NotificationCategory,
} from '@/hooks/use-notifications';
import { useCustomNotifications, useCustomUnreadCount, useMarkCustomNotificationAsRead, useMarkAllCustomNotificationsAsRead } from '@/hooks/use-custom-notifications';
import { formatDistanceToNow } from 'date-fns';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { Link, useNavigate } from 'react-router-dom';
import notificationsIcon from '@/assets/icons/notifications-icon.png';

import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { DEHUB_CDN_BASE } from '@/lib/api/dehub';

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';

// Batch avatar enrichment cache for fresh profile pictures
interface EnrichedAvatar {
  avatarUrl: string | null;
  username: string | null;
  displayName: string | null;
}

// Bundled notification: wraps one or more raw notifications into a display group
interface BundledNotification {
  /** The primary notification (most recent in the bundle) */
  primary: DeHubNotification;
  /** All notification IDs in this bundle */
  allIds: string[];
  /** For same-actor bundles: how many posts they interacted with */
  postCount: number;
  /** For multi-actor bundles: list of actor names */
  actorNames: string[];
  /** For multi-actor bundles: total actor count */
  actorCount: number;
  /** Bundle type */
  bundleType: 'single' | 'same-actor' | 'multi-actor';
}

// No time window limit for same-actor bundling — all interactions from the same
// actor of the same type are collapsed into a single bundle regardless of when
// they occurred (e.g. "trustwallet1 liked 5 of your posts").

/**
 * Bundle notifications client-side:
 * 1. Same actor + same type within 24h → "Frank liked 5 of your posts"
 * 2. Same type (follows) from different actors within 24h → "okanbey and 2 others started following you"
 */
function bundleNotifications(notifications: DeHubNotification[], enrichedAvatars: Map<string, EnrichedAvatar>): BundledNotification[] {
  if (!notifications.length) return [];

  const bundles: BundledNotification[] = [];
  const consumed = new Set<string>();

  for (let i = 0; i < notifications.length; i++) {
    const n = notifications[i];
    if (consumed.has(n.id)) continue;

    const nTime = new Date(n.createdAt).getTime();

    // No client-side multi-actor bundling for follows — each follow stays individual.
    // Backend-aggregated follows (with aggregatedCount > 1) are handled in getNotificationContent.

    // Try same-actor bundling for likes/comments on different posts
    if (['like', 'comment', 'repost', 'quote'].includes(n.type) && n.actorAddress) {
      const group: DeHubNotification[] = [n];
      for (let j = i + 1; j < notifications.length; j++) {
        const m = notifications[j];
        if (consumed.has(m.id)) continue;
        if (m.type !== n.type) continue;
        if (m.actorAddress?.toLowerCase() !== n.actorAddress?.toLowerCase()) continue;
        // No time window — bundle all same-actor same-type notifications together
        group.push(m);
      }
      if (group.length > 1) {
        group.forEach(g => consumed.add(g.id));
        bundles.push({
          primary: group[0],
          allIds: group.map(g => g.id),
          postCount: group.length,
          actorNames: [],
          actorCount: 1,
          bundleType: 'same-actor',
        });
        continue;
      }
    }

    // Single notification (no bundling)
    consumed.add(n.id);
    bundles.push({
      primary: n,
      allIds: [n.id],
      postCount: 1,
      actorNames: [],
      actorCount: 1,
      bundleType: 'single',
    });
  }

  return bundles;
}

// Notification type tabs
type NotificationTypeFilter = 'all' | 'likes' | 'follows' | 'comments' | 'reposts' | 'subscriptions' | 'tips' | 'livestreams';

const tabs: { labelKey: string; value: NotificationTypeFilter; icon: React.ElementType }[] = [
  { labelKey: 'notifications.all', value: 'all', icon: Bell },
  { labelKey: 'notifications.likes', value: 'likes', icon: ThumbsUp },
  { labelKey: 'notifications.follows', value: 'follows', icon: UserPlus },
  { labelKey: 'notifications.comments', value: 'comments', icon: MessageSquareText },
  { labelKey: 'notifications.reposts', value: 'reposts', icon: Repeat2 },
  { labelKey: 'notifications.subs', value: 'subscriptions', icon: Users },
  { labelKey: 'notifications.tips', value: 'tips', icon: DollarSign },
  { labelKey: 'notifications.live', value: 'livestreams', icon: Zap },
];

// Map tab filter to notification types
const filterTypeMap: Record<NotificationTypeFilter, string[] | null> = {
  all: null,
  likes: ['like', 'comment_like', 'feature_request_like', 'governance_vote'],
  follows: ['following'],
  comments: ['comment', 'comment_reply', 'mention', 'feature_request_comment', 'governance_comment'],
  reposts: ['repost', 'quote'],
  subscriptions: ['subscription', 'ppv_purchase'],
  tips: ['tip'],
  livestreams: ['livestream_start'],
};

function getNotificationIcon(type: string) {
  switch (type) {
    case 'like':
    case 'comment_like':
    case 'feature_request_like':
      return <ThumbsUp className="w-4 h-4 text-white/70" />;
    case 'comment':
    case 'comment_reply':
    case 'mention':
    case 'feature_request_comment':
    case 'governance_comment':
      return <MessageSquareText className="w-4 h-4 text-white/70" />;
    case 'tip':
      return <DollarSign className="w-4 h-4 text-white/70" />;
    case 'subscription':
    case 'ppv_purchase':
      return <Users className="w-4 h-4 text-white/70" />;
    case 'following':
      return <UserPlus className="w-4 h-4 text-white/70" />;
    case 'video_milestone':
      return <Trophy className="w-4 h-4 text-white/70" />;
    case 'livestream_start':
      return <Zap className="w-4 h-4 text-white/70" />;
    case 'video_removal':
      return <AlertTriangle className="w-4 h-4 text-white/70" />;
    case 'governance_vote':
      return <Star className="w-4 h-4 text-white/70" />;
    default:
      return <Bell className="w-4 h-4 text-white/70" />;
  }
}

function getNotificationContent(notification: DeHubNotification, bundle?: BundledNotification, t?: (key: string, opts?: any) => string): React.ReactNode {
  const tr = t || ((key: string) => key);
  const actorName = notification.actorUsername || 'Someone';
  
  // Handle custom notification types outside the typed switch
  if ((notification.type as string) === 'feature_request_like') {
    const title = (notification as any)._customReferenceTitle || notification.tokenTitle;
    return title ? `${actorName} liked your feature request "${title}"` : `${actorName} liked your feature request`;
  }
  if ((notification.type as string) === 'feature_request_comment') {
    const title = (notification as any)._customReferenceTitle || notification.tokenTitle;
    return title ? `${actorName} commented on your feature request "${title}"` : `${actorName} commented on your feature request`;
  }
  if ((notification.type as string) === 'governance_vote') {
    const title = (notification as any)._customReferenceTitle || notification.tokenTitle;
    return title ? `${actorName} voted on your proposal "${title}"` : `${actorName} voted on your proposal`;
  }
  if ((notification.type as string) === 'governance_comment') {
    const title = (notification as any)._customReferenceTitle || notification.tokenTitle;
    return title ? `${actorName} commented on your proposal "${title}"` : `${actorName} commented on your proposal`;
  }

  // Backend-aggregated follow
  if (notification.type === 'following' && (notification as any).aggregatedCount > 1) {
    const othersCount = (notification as any).aggregatedCount - 1;
    const othersText = othersCount === 1 ? tr('notifications.oneOther') : tr('notifications.nOthers', { count: othersCount });
    return tr('notifications.andOthersFollowing', { name: actorName, others: othersText });
  }
  
  // Same-actor bundle
  if (bundle?.bundleType === 'same-actor' && bundle.postCount > 1) {
    const count = bundle.postCount;
    switch (notification.type) {
      case 'like':
        return tr('notifications.likedPosts', { name: actorName, count });
      case 'comment':
        return tr('notifications.commentedPosts', { name: actorName, count });
      case 'comment_reply':
        return tr('notifications.repliedComments', { name: actorName, count });
      default:
        return tr('notifications.interactedPosts', { name: actorName, count });
    }
  }
  
  switch (notification.type) {
    case 'like':
      return tr('notifications.likedPost', { name: actorName });
    case 'comment':
      return tr('notifications.commentedPost', { name: actorName });
    case 'comment_reply':
      return tr('notifications.repliedComment', { name: actorName });
    case 'mention':
      return `${actorName} mentioned you in a comment`;
    case 'tip':
      const tipAmount = notification.amount ? ` ${notification.amount} ${notification.currency || 'DHB'}` : '';
      return tr('notifications.tippedYou', { name: actorName }) + tipAmount;
    case 'subscription':
      return tr('notifications.subscribedPlan', { name: actorName });
    case 'ppv_purchase':
      return tr('notifications.purchasedContent', { name: actorName });
    case 'following':
      return tr('notifications.startedFollowing', { name: actorName });
    case 'video_milestone':
      return tr('notifications.postMilestone');
    case 'livestream_start':
      return tr('notifications.startedStreaming', { name: actorName });
    case 'comment_like': {
      const commentPreview = (notification as any).commentPreview;
      const count = (notification as any).aggregatedCount || 1;
      const names = (notification as any).latestActorNames as string[] | undefined;
      if (count > 1 && names && names.length > 0) {
        const first = names[0];
        const rest = count - 1;
        const othersText = rest === 1 ? tr('notifications.oneOther') : tr('notifications.nOthers', { count: rest });
        return commentPreview
          ? tr('notifications.andOthersLikedCommentPreview', { first, others: othersText, preview: commentPreview })
          : tr('notifications.andOthersLikedComment', { first, others: othersText });
      }
      return commentPreview
        ? tr('notifications.likedCommentPreview', { name: actorName, preview: commentPreview })
        : tr('notifications.likedComment', { name: actorName });
    }
    case 'video_removal':
      return tr('notifications.postRemoved');
    default:
      return (notification as any).content || tr('notifications.newNotification');
  }
}

function getNavigationLink(notification: DeHubNotification): string | null {
  // Handle custom notification types
  if ((notification.type as string) === 'feature_request_like' || (notification.type as string) === 'feature_request_comment') {
    return '/features';
  }
  if ((notification.type as string) === 'governance_vote' || (notification.type as string) === 'governance_comment') {
    const refId = (notification as any)._customReferenceId;
    return refId ? `/app/governance/${refId}` : '/governance';
  }

  switch (notification.type) {
    case 'like':
    case 'comment':
    case 'comment_reply':
    case 'comment_like':
    case 'mention':
    case 'tip':
    case 'video_milestone':
      return notification.tokenId ? `/app/post/${notification.tokenId}` : null;
    case 'following':
      return notification.actorAddress 
        ? `/${notification.actorAddress}` 
        : notification.actorUsername 
          ? `/${notification.actorUsername}` 
          : null;
    case 'subscription':
    case 'ppv_purchase':
      return notification.actorAddress 
        ? `/${notification.actorAddress}` 
        : notification.actorUsername 
          ? `/${notification.actorUsername}` 
          : '/app/command-centre';
    case 'livestream_start':
      return notification.tokenId ? `/app/post/${notification.tokenId}` : null;
    case 'video_removal':
      return '/app/settings';
    default:
      return null;
  }
}

function NotificationItem({ 
  notification, 
  bundle,
  onMarkAsRead,
  isMarkingAsRead,
  enrichedAvatars,
}: { 
  notification: DeHubNotification;
  bundle: BundledNotification;
  onMarkAsRead: (id: string) => void;
  isMarkingAsRead: boolean;
  enrichedAvatars: Map<string, EnrichedAvatar>;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isClosing, setIsClosing] = useState(false);

  // Prefer fresh enriched avatar over stale API snapshot
  const enriched = notification.actorAddress ? enrichedAvatars.get(notification.actorAddress.toLowerCase()) : undefined;
  const freshAvatarPath = enriched?.avatarUrl;
  const staleAvatarPath = extractAvatarPath(notification) || notification.actorAvatar;
  
  // Use fresh if available, otherwise fall back to stale (don't discard stale just because enrichment ran with null)
  const effectiveAvatarPath = freshAvatarPath || staleAvatarPath;
  
  // If enriched avatar is already a full URL, use it directly with cache-busting
  const cacheBust = Math.floor(Date.now() / 300000);
  const avatarUrl = effectiveAvatarPath?.startsWith('http')
    ? `${effectiveAvatarPath}${effectiveAvatarPath.includes('?') ? '&' : '?'}v=${cacheBust}`
    : notification.actorAddress && effectiveAvatarPath
      ? buildAvatarUrl(notification.actorAddress, effectiveAvatarPath)
      : undefined;
  
   // No dicebear fallback — let AvatarFallback show the greyed-out letter
  const fallbackLetter = (enriched?.displayName || enriched?.username || notification.actorUsername || 'U').charAt(0).toUpperCase();
    
  const postThumbnail = notification.tokenThumbnail 
    ? (notification.tokenThumbnail.startsWith('http') ? notification.tokenThumbnail : `${DEHUB_CDN_BASE}${notification.tokenThumbnail}`)
    : null;
  
  const profileLink = notification.actorAddress 
    ? `/${notification.actorAddress}` 
    : notification.actorUsername 
      ? `/${notification.actorUsername}` 
      : null;

  const hasUnread = bundle.bundleType !== 'single' 
    ? bundle.allIds.some(id => {
        // Check if any notification in the bundle is unread - we only have the primary easily
        return !notification.read;
      })
    : !notification.read;

  const handleClick = () => {
    // Mark all notifications in bundle as read
    if (hasUnread) {
      bundle.allIds.forEach(id => onMarkAsRead(id));
    }
    
    // Navigate to appropriate destination
    const navLink = getNavigationLink(notification);
    if (navLink) {
      navigate(navLink);
    }
  };

  

  return (
    <div 
      onClick={handleClick}
      className={`flex items-start gap-3 p-4 transition-colors duration-300 cursor-pointer ${
        (notification.read || isClosing) ? 'bg-zinc-900/50' : 'bg-zinc-800/80 hover:bg-zinc-800'
      }`}
    >
      {/* Avatar with type icon overlay */}
      <div className="relative flex-shrink-0">
        {profileLink ? (
          <Link to={profileLink} onClick={(e) => e.stopPropagation()}>
            <Avatar className="w-12 h-12">
              <AvatarImage src={avatarUrl} />
              <AvatarFallback className="bg-zinc-700 text-white font-medium">
                {fallbackLetter}
              </AvatarFallback>
            </Avatar>
          </Link>
        ) : (
          <Avatar className="w-12 h-12">
            <AvatarImage src={avatarUrl} />
            <AvatarFallback className="bg-zinc-700 text-white font-medium">
              {fallbackLetter}
            </AvatarFallback>
          </Avatar>
        )}
        <div className="absolute -bottom-1 -right-1 p-1 rounded-lg bg-zinc-900 border border-zinc-800">
          {getNotificationIcon(notification.type)}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${(notification.read || isClosing) ? 'text-zinc-400' : 'text-white'}`}>
          {getNotificationContent(notification, bundle, t)}
        </p>
        
        {/* Post preview snippet — show title/text for context */}
        {notification.tokenTitle && bundle.bundleType !== 'same-actor' && (
          <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1 italic">
            "{notification.tokenTitle}"
          </p>
        )}
        
        {/* Show individual actor names below backend-aggregated follows */}
        {notification.type === 'following' && (notification as any).latestActorNames?.length > 1 && (
          <p className="text-xs text-zinc-500 mt-0.5">
            {(notification as any).latestActorNames.join(', ')}
          </p>
        )}
        
        <p className="text-xs text-zinc-500 mt-1">
          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
        </p>
      </div>

      {/* Post thumbnail if applicable (only for single or same-actor with 1 post) */}
      {postThumbnail && bundle.bundleType !== 'same-actor' && (
        <Link 
          to={`/app/post/${notification.tokenId}`}
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0"
        >
          <img 
            src={postThumbnail} 
            alt={notification.tokenTitle || 'Post'} 
            className="w-12 h-12 rounded-lg object-cover"
          />
        </Link>
      )}

      {/* Mark as read button - only show for unread notifications */}
      <AnimatePresence mode="wait">
        {hasUnread && (
          <motion.button
            key="mark-read"
            onClick={(e) => {
              e.stopPropagation();
              setIsClosing(true);
              bundle.allIds.forEach(id => onMarkAsRead(id));
              
            }}
            disabled={isClosing}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50 flex-shrink-0"
            title="Mark as read"
            initial={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] } }}
          >
            <motion.div
              animate={isClosing ? { rotateX: 180 } : { rotateX: 0 }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              style={{ transformStyle: 'preserve-3d' }}
              className="text-zinc-400"
            >
              {isClosing ? (
                <Mail className="w-4 h-4" />
              ) : (
                <MailOpen className="w-4 h-4" />
              )}
            </motion.div>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<NotificationTypeFilter>('all');
  const { layerRef: notifTabLayerRef, setRef: setNotifTabRef, rect: notifTabRect, onScroll: onNotifTabScroll } = useTabIndicator(activeTab);
  const { isAuthenticated } = useAuth();
  
  // Notification preference toggles (local state for now)
  const [notificationPrefs, setNotificationPrefs] = useState({
    likes: true,
    comments: true,
    follows: true,
    tips: true,
    subscriptions: true,
    livestreams: true,
  });
  
  // Fetch all notifications and filter client-side by type
  const { notifications: dehubNotifications, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useNotifications();
  const { data: unreadCount } = useUnreadNotificationCount();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const markAsRead = useMarkNotificationAsRead();
  
  // Fetch custom notifications (feature request likes, etc.)
  const { customNotifications, isLoading: customLoading } = useCustomNotifications();
  const { data: customUnreadCount } = useCustomUnreadCount();
  const markCustomAsRead = useMarkCustomNotificationAsRead();
  const markAllCustomAsRead = useMarkAllCustomNotificationsAsRead();
  
  // Merge DeHub + custom notifications, sorted by date
  const allNotifications = [...dehubNotifications, ...customNotifications]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  // Batch-avatar enrichment for fresh profile pictures
  const [enrichedAvatars, setEnrichedAvatars] = useState<Map<string, EnrichedAvatar>>(new Map());
  const enrichedRef = useRef<Set<string>>(new Set());

  // Clear enrichment cache on mount so fresh avatars are always fetched
  useEffect(() => {
    enrichedRef.current.clear();
  }, []);

  useEffect(() => {
    if (!allNotifications.length) return;
    
    const newAddresses = allNotifications
      .map(n => n.actorAddress?.toLowerCase())
      .filter((addr): addr is string => Boolean(addr) && !enrichedRef.current.has(addr));
    
    const uniqueNew = [...new Set(newAddresses)];
    if (uniqueNew.length === 0) return;
    
    // Mark as in-flight immediately to prevent duplicate calls
    uniqueNew.forEach(addr => enrichedRef.current.add(addr));
    
    Promise.allSettled(
      uniqueNew.map(async (addr) => {
        try {
          const { getAccountInfo } = await import('@/lib/api/dehub');
          const { extractAvatarPath, buildAvatarUrl } = await import('@/lib/media-url');
          const user = await getAccountInfo(addr);
          const rawPath = extractAvatarPath(user);
          const avatarUrl = buildAvatarUrl(user.address || addr, rawPath);
          return { addr, info: { address: addr, avatarUrl, username: user.username || null, displayName: user.displayName || null } };
        } catch {
          return { addr, info: { address: addr, avatarUrl: null, username: null, displayName: null } };
        }
      })
    ).then((results) => {
      setEnrichedAvatars(prev => {
        const next = new Map(prev);
        for (const r of results) {
          if (r.status === 'fulfilled') {
            next.set(r.value.addr, r.value.info as EnrichedAvatar);
          }
        }
        return next;
      });
    });
  }, [allNotifications]);

  const [markingNotificationId, setMarkingNotificationId] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <AuthGate description={t('notifications.loginDescription')} />
    );
  }

  const handleMarkAllAsRead = () => {
    markAllAsRead.mutate(undefined);
    markAllCustomAsRead.mutate();
  };

  const handleMarkAsRead = (notificationId: string) => {
    setMarkingNotificationId(notificationId);
    if (notificationId.startsWith('custom_')) {
      markCustomAsRead.mutate(notificationId, {
        onSettled: () => setMarkingNotificationId(null),
      });
    } else {
      markAsRead.mutate(notificationId, {
        onSettled: () => setMarkingNotificationId(null),
      });
    }
  };

  // Filter notifications by selected tab type
  const notifications = activeTab === 'all' 
    ? allNotifications 
    : allNotifications.filter(n => {
        const allowedTypes = filterTypeMap[activeTab];
        return allowedTypes ? allowedTypes.includes(n.type) : true;
      });

  // Get total unread count (DeHub + custom)
  const totalUnread = (unreadCount?.total ?? 0) + (customUnreadCount ?? 0);
  
  // Get count per tab (count matching notification types in current data)
  const getTabCount = (tabValue: NotificationTypeFilter): number => {
    if (tabValue === 'all') return totalUnread;
    const allowedTypes = filterTypeMap[tabValue];
    if (!allowedTypes) return 0;
    return allNotifications.filter(n => !n.read && allowedTypes.includes(n.type)).length;
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-11 lg:top-0 bg-black z-50 px-2 pt-1 pb-0 sm:px-3 sm:pt-1 sm:pb-0 lg:pt-2">
        <div className="bg-zinc-900 rounded-2xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={notificationsIcon} alt="Notifications" className="w-9 h-9 object-contain" />
              <h1 className="font-bold text-white text-lg">{t('notifications.title')}</h1>
              {totalUnread > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium bg-red-500 text-white rounded-lg">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {totalUnread > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMarkAllAsRead}
                  disabled={markAllAsRead.isPending}
                  className="text-zinc-400 hover:text-white"
                >
                  {markAllAsRead.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                    <span className="ml-1 hidden sm:inline">{t('notifications.markAllRead')}</span>
                </Button>
              )}
              <Sheet>
                <SheetTrigger asChild>
                  <button className="p-2 rounded-xl hover:bg-zinc-800 transition-colors">
                    <Settings className="w-5 h-5 text-zinc-400" />
                  </button>
                </SheetTrigger>
                <SheetContent 
                  side="bottom" 
                  className="bg-black/60 backdrop-blur-[24px] saturate-[180%] border-t border-white/10 rounded-t-3xl max-h-[85vh] overflow-y-auto"
                >
                  <SheetHeader className="pb-4">
                    <SheetTitle className="text-white text-lg font-bold flex items-center gap-2">
                      <Settings className="w-5 h-5 text-white" />
                      {t('notifications.settings')}
                    </SheetTitle>
                  </SheetHeader>
                  
                  {/* Actions Section */}
                  <div className="space-y-3 mb-6">
                    <p className="text-xs text-white/50 uppercase tracking-wider font-medium">{t('notifications.actions')}</p>
                    <button
                      onClick={handleMarkAllAsRead}
                      disabled={markAllAsRead.isPending || totalUnread === 0}
                      className="w-full flex items-center gap-3 p-4 rounded-xl bg-white/10 hover:bg-white/15 transition-colors disabled:opacity-50"
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-white font-medium">{t('notifications.markAllAsRead')}</p>
                        <p className="text-white/50 text-sm">{t('notifications.clearAllIndicators')}</p>
                      </div>
                    </button>
                    
                    <button
                      onClick={() => {
                        console.log('Clear all notifications');
                      }}
                      className="w-full flex items-center gap-3 p-4 rounded-xl bg-white/10 hover:bg-white/15 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                        <Trash2 className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-white font-medium">{t('notifications.clearAll')}</p>
                        <p className="text-white/50 text-sm">{t('notifications.removeHistory')}</p>
                      </div>
                    </button>
                  </div>
                  
                  {/* Notification Types Section */}
                  <div className="space-y-3">
                    <p className="text-xs text-white/50 uppercase tracking-wider font-medium">{t('notifications.notificationTypes')}</p>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-4 rounded-xl bg-white/10">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                            <ThumbsUp className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <p className="text-white font-medium">{t('notifications.likes')}</p>
                            <p className="text-white/50 text-sm">{t('notifications.likesDesc')}</p>
                          </div>
                        </div>
                        <Switch 
                          checked={notificationPrefs.likes}
                          onCheckedChange={(checked) => setNotificationPrefs(p => ({ ...p, likes: checked }))}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between p-4 rounded-xl bg-white/10">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                            <MessageSquareText className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <p className="text-white font-medium">{t('notifications.comments')}</p>
                            <p className="text-white/50 text-sm">{t('notifications.commentsDesc')}</p>
                          </div>
                        </div>
                        <Switch 
                          checked={notificationPrefs.comments}
                          onCheckedChange={(checked) => setNotificationPrefs(p => ({ ...p, comments: checked }))}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between p-4 rounded-xl bg-white/10">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                            <UserPlus className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <p className="text-white font-medium">{t('notifications.follows')}</p>
                            <p className="text-white/50 text-sm">{t('notifications.followsDesc')}</p>
                          </div>
                        </div>
                        <Switch 
                          checked={notificationPrefs.follows}
                          onCheckedChange={(checked) => setNotificationPrefs(p => ({ ...p, follows: checked }))}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between p-4 rounded-xl bg-white/10">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                            <DollarSign className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <p className="text-white font-medium">{t('notifications.tips')}</p>
                            <p className="text-white/50 text-sm">{t('notifications.tipsDesc')}</p>
                          </div>
                        </div>
                        <Switch 
                          checked={notificationPrefs.tips}
                          onCheckedChange={(checked) => setNotificationPrefs(p => ({ ...p, tips: checked }))}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between p-4 rounded-xl bg-white/10">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                            <Users className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <p className="text-white font-medium">{t('notifications.subscriptions')}</p>
                            <p className="text-white/50 text-sm">{t('notifications.subscriptionsDesc')}</p>
                          </div>
                        </div>
                        <Switch 
                          checked={notificationPrefs.subscriptions}
                          onCheckedChange={(checked) => setNotificationPrefs(p => ({ ...p, subscriptions: checked }))}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between p-4 rounded-xl bg-white/10">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                            <Zap className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <p className="text-white font-medium">{t('notifications.livestreams')}</p>
                            <p className="text-white/50 text-sm">{t('notifications.livestreamsDesc')}</p>
                          </div>
                        </div>
                        <Switch 
                          checked={notificationPrefs.livestreams}
                          onCheckedChange={(checked) => setNotificationPrefs(p => ({ ...p, livestreams: checked }))}
                        />
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>

          {/* Tabs - merged into header bento */}
          <div className="mt-3 -mx-2" style={{ overflowX: 'clip', overflowClipMargin: '8px' }}>
            <div ref={notifTabLayerRef} className="relative overflow-visible">
              <GlassIndicator rect={notifTabRect} />
              <div 
                className="relative z-20 flex w-full"
              >
                {tabs.map((tab) => {
                  const count = getTabCount(tab.value);
                  return (
                    <button
                      key={tab.value}
                      ref={setNotifTabRef(tab.value)}
                      onClick={() => setActiveTab(tab.value)}
                      className={`relative z-40 flex-1 flex items-center justify-center px-2 py-[10.4px] rounded-xl transition-colors duration-200 ${
                        activeTab === tab.value
                          ? 'text-white'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <span className="relative z-10 flex items-center gap-1">
                        <tab.icon className="w-[22.5px] h-[22.5px]" />
                        {count > 0 && (
                          <span className={`px-1.5 py-0.5 text-xs rounded-lg transition-colors duration-200 ${
                            activeTab === tab.value
                              ? 'bg-white/20 text-white'
                              : 'bg-red-500 text-white'
                          }`}>
                            {count > 99 ? '99+' : count}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="px-2 sm:px-3 pt-2 pb-2">
        <div className="bg-zinc-900 rounded-2xl overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 flex flex-col items-center justify-center text-center">
              <Bell className="w-12 h-12 text-zinc-600 mb-4" />
              <h3 className="text-white font-semibold text-lg mb-2">{t('notifications.noNotificationsYet')}</h3>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {(() => {
                const bundled = bundleNotifications(notifications.filter(n => n && n.id), enrichedAvatars);
                return bundled.map((bundle) => (
                  <NotificationItem
                    key={bundle.primary.id}
                    notification={bundle.primary}
                    bundle={bundle}
                    onMarkAsRead={handleMarkAsRead}
                    isMarkingAsRead={bundle.allIds.includes(markingNotificationId || '')}
                    enrichedAvatars={enrichedAvatars}
                  />
                ));
              })()}
              
              {/* Load More */}
              {hasNextPage && (
                <div className="p-4 flex justify-center">
                  <Button
                    variant="ghost"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="text-zinc-400 hover:text-white"
                  >
                    {isFetchingNextPage ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    {t('notifications.loadMore')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
