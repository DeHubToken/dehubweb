import { useState, useEffect, useRef, useCallback } from 'react';
import { Settings, Heart, MessageCircle, DollarSign, Users, Bell, Check, Loader2, UserPlus, Trophy, AlertTriangle, Video, Zap, Trash2, MailOpen, Repeat2 } from 'lucide-react';
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
import { formatDistanceToNow } from 'date-fns';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { Link, useNavigate } from 'react-router-dom';
import notificationsIcon from '@/assets/icons/notifications-icon.png';

import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { DEHUB_CDN_BASE } from '@/lib/api/dehub';
import { supabase } from '@/integrations/supabase/client';
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

const BUNDLE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

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
        if (Math.abs(nTime - new Date(m.createdAt).getTime()) > BUNDLE_WINDOW_MS) continue;
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

const tabs: { label: string; value: NotificationTypeFilter; icon: React.ElementType }[] = [
  { label: 'All', value: 'all', icon: Bell },
  { label: 'Likes', value: 'likes', icon: Heart },
  { label: 'Follows', value: 'follows', icon: UserPlus },
  { label: 'Comments', value: 'comments', icon: MessageCircle },
  { label: 'Reposts', value: 'reposts', icon: Repeat2 },
  { label: 'Subs', value: 'subscriptions', icon: Users },
  { label: 'Tips', value: 'tips', icon: DollarSign },
  { label: 'Live', value: 'livestreams', icon: Zap },
];

// Map tab filter to notification types
const filterTypeMap: Record<NotificationTypeFilter, string[] | null> = {
  all: null,
  likes: ['like'],
  follows: ['following'],
  comments: ['comment', 'comment_reply'],
  reposts: ['repost', 'quote'],
  subscriptions: ['subscription', 'ppv_purchase'],
  tips: ['tip'],
  livestreams: ['livestream_start'],
};

function getNotificationIcon(type: DeHubNotification['type']) {
  switch (type) {
    case 'like':
      return <Heart className="w-4 h-4 text-pink-500" />;
    case 'comment':
    case 'comment_reply':
      return <MessageCircle className="w-4 h-4 text-blue-400" />;
    case 'tip':
      return <DollarSign className="w-4 h-4 text-yellow-500" />;
    case 'subscription':
    case 'ppv_purchase':
      return <Users className="w-4 h-4 text-purple-500" />;
    case 'following':
      return <UserPlus className="w-4 h-4 text-cyan-500" />;
    case 'video_milestone':
      return <Trophy className="w-4 h-4 text-orange-500" />;
    case 'livestream_start':
      return <Zap className="w-4 h-4 text-red-500" />;
    case 'video_removal':
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    default:
      return <Bell className="w-4 h-4 text-zinc-500" />;
  }
}

function getNotificationContent(notification: DeHubNotification, bundle?: BundledNotification): React.ReactNode {
  const actorName = notification.actorUsername || 'Someone';
  
  // Backend-aggregated follow: "okanbey and 2 others started following you"
  if (notification.type === 'following' && (notification as any).aggregatedCount > 1) {
    const othersCount = (notification as any).aggregatedCount - 1;
    const othersText = othersCount === 1 ? '1 other' : `${othersCount} others`;
    return `${actorName} and ${othersText} started following you`;
  }
  
  // Same-actor bundle: "Frank liked 5 of your posts"
  if (bundle?.bundleType === 'same-actor' && bundle.postCount > 1) {
    const count = bundle.postCount;
    switch (notification.type) {
      case 'like':
        return `${actorName} liked ${count} of your posts`;
      case 'comment':
        return `${actorName} commented on ${count} of your posts`;
      case 'comment_reply':
        return `${actorName} replied to ${count} of your comments`;
      default:
        return `${actorName} interacted with ${count} of your posts`;
    }
  }
  
  switch (notification.type) {
    case 'like':
      return `${actorName} liked your post`;
    case 'comment':
      return `${actorName} commented on your post`;
    case 'comment_reply':
      return `${actorName} replied to your comment`;
    case 'tip':
      const tipAmount = notification.amount ? ` ${notification.amount} ${notification.currency || 'DHB'}` : '';
      return `${actorName} tipped you${tipAmount}`;
    case 'subscription':
      return `${actorName} subscribed to your plan`;
    case 'ppv_purchase':
      return `${actorName} purchased your content`;
    case 'following':
      return `${actorName} started following you`;
    case 'video_milestone':
      return `🎉 Your post reached a new milestone!`;
    case 'livestream_start':
      return `${actorName} started streaming`;
    case 'video_removal':
      return `Your post was removed`;
    default:
      return 'New notification';
  }
}

function getNavigationLink(notification: DeHubNotification): string | null {
  switch (notification.type) {
    case 'like':
    case 'comment':
    case 'comment_reply':
    case 'tip':
    case 'video_milestone':
      return notification.tokenId ? `/app/post/${notification.tokenId}` : null;
    case 'following':
      return notification.actorUsername 
        ? `/${notification.actorUsername}` 
        : notification.actorAddress 
          ? `/${notification.actorAddress}` 
          : null;
    case 'subscription':
    case 'ppv_purchase':
      return notification.actorUsername 
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
  
  // Prefer fresh enriched avatar over stale API snapshot
  const enriched = notification.actorAddress ? enrichedAvatars.get(notification.actorAddress.toLowerCase()) : undefined;
  const freshAvatarPath = enriched?.avatarUrl;
  const staleAvatarPath = extractAvatarPath(notification) || notification.actorAvatar;
  
  // If enriched avatar is already a full URL, use it directly with cache-busting
  const cacheBust = Math.floor(Date.now() / 300000);
  const avatarUrl = freshAvatarPath?.startsWith('http')
    ? `${freshAvatarPath}${freshAvatarPath.includes('?') ? '&' : '?'}v=${cacheBust}`
    : notification.actorAddress
      ? buildAvatarUrl(notification.actorAddress, freshAvatarPath || staleAvatarPath)
      : staleAvatarPath?.startsWith('http') ? staleAvatarPath : undefined;
  
  // Dicebear fallback for when no avatar exists
  const fallbackAvatar = notification.actorAddress 
    ? `https://api.dicebear.com/7.x/identicon/svg?seed=${notification.actorAddress}`
    : undefined;
    
  const postThumbnail = notification.tokenThumbnail 
    ? (notification.tokenThumbnail.startsWith('http') ? notification.tokenThumbnail : `${DEHUB_CDN_BASE}${notification.tokenThumbnail}`)
    : null;
  
  const profileLink = notification.actorUsername 
    ? `/${notification.actorUsername}` 
    : notification.actorAddress 
      ? `/${notification.actorAddress}` 
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
      className={`flex items-start gap-3 p-4 rounded-xl transition-colors cursor-pointer ${
        notification.read ? 'bg-zinc-900/50' : 'bg-zinc-800/80 hover:bg-zinc-800'
      }`}
    >
      {/* Avatar with type icon overlay */}
      <div className="relative flex-shrink-0">
        {profileLink && notification.actorUsername ? (
          <Link to={profileLink} onClick={(e) => e.stopPropagation()}>
            <Avatar className="w-12 h-12">
              <AvatarImage src={avatarUrl || fallbackAvatar} />
              <AvatarFallback className="bg-zinc-700 text-white">
                {fallbackAvatar ? (
                  <img src={fallbackAvatar} alt="" className="w-full h-full" />
                ) : (
                  (notification.actorUsername || 'U').charAt(0).toUpperCase()
                )}
              </AvatarFallback>
            </Avatar>
          </Link>
        ) : (
          <Avatar className="w-12 h-12">
            <AvatarImage src={avatarUrl || fallbackAvatar} />
            <AvatarFallback className="bg-zinc-700 text-white">
              {fallbackAvatar ? (
                <img src={fallbackAvatar} alt="" className="w-full h-full" />
              ) : (
                (notification.actorUsername || 'U').charAt(0).toUpperCase()
              )}
            </AvatarFallback>
          </Avatar>
        )}
        <div className="absolute -bottom-1 -right-1 p-1 rounded-lg bg-zinc-900 border border-zinc-800">
          {getNotificationIcon(notification.type)}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${notification.read ? 'text-zinc-400' : 'text-white'}`}>
          {getNotificationContent(notification, bundle)}
        </p>
        
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
      {hasUnread && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            bundle.allIds.forEach(id => onMarkAsRead(id));
          }}
          disabled={isMarkingAsRead}
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50 flex-shrink-0"
          title="Mark as read"
        >
          {isMarkingAsRead ? (
            <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
          ) : (
            <MailOpen className="w-4 h-4 text-zinc-400" />
          )}
        </button>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState<NotificationTypeFilter>('all');
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
  const { notifications: allNotifications, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useNotifications();
  const { data: unreadCount } = useUnreadNotificationCount();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const markAsRead = useMarkNotificationAsRead();
  
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
    
    supabase.functions.invoke('batch-avatars', {
      body: { addresses: uniqueNew },
    }).then(({ data }) => {
      if (data?.success && data.avatars) {
        setEnrichedAvatars(prev => {
          const next = new Map(prev);
          for (const [addr, info] of Object.entries(data.avatars)) {
            next.set(addr, info as EnrichedAvatar);
          }
          return next;
        });
      }
    }).catch(err => {
      console.warn('Failed to enrich notification avatars:', err);
    });
  }, [allNotifications]);

  const [markingNotificationId, setMarkingNotificationId] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <AuthGate description="Log in to view your notifications and stay updated with your friends on DeHub." />
    );
  }

  const handleMarkAllAsRead = () => {
    markAllAsRead.mutate(undefined);
  };

  const handleMarkAsRead = (notificationId: string) => {
    setMarkingNotificationId(notificationId);
    markAsRead.mutate(notificationId, {
      onSettled: () => setMarkingNotificationId(null),
    });
  };

  // Filter notifications by selected tab type
  const notifications = activeTab === 'all' 
    ? allNotifications 
    : allNotifications.filter(n => {
        const allowedTypes = filterTypeMap[activeTab];
        return allowedTypes ? allowedTypes.includes(n.type) : true;
      });

  // Get total unread count
  const totalUnread = unreadCount?.total ?? 0;
  
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
      <div className="sticky top-11 lg:top-0 bg-black z-10 p-3 sm:p-4">
        <div className="bg-zinc-900 rounded-2xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={notificationsIcon} alt="Notifications" className="w-9 h-9 object-contain" />
              <h1 className="font-bold text-white text-lg">Notifications</h1>
              {totalUnread > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg">
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
                  <span className="ml-1 hidden sm:inline">Mark all read</span>
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
                      Notification Settings
                    </SheetTitle>
                  </SheetHeader>
                  
                  {/* Actions Section */}
                  <div className="space-y-3 mb-6">
                    <p className="text-xs text-white/50 uppercase tracking-wider font-medium">Actions</p>
                    <button
                      onClick={handleMarkAllAsRead}
                      disabled={markAllAsRead.isPending || totalUnread === 0}
                      className="w-full flex items-center gap-3 p-4 rounded-xl bg-white/10 hover:bg-white/15 transition-colors disabled:opacity-50"
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-white font-medium">Mark all as read</p>
                        <p className="text-white/50 text-sm">Clear all unread indicators</p>
                      </div>
                    </button>
                    
                    <button
                      onClick={() => {
                        // TODO: Implement clear all notifications API
                        console.log('Clear all notifications');
                      }}
                      className="w-full flex items-center gap-3 p-4 rounded-xl bg-white/10 hover:bg-white/15 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                        <Trash2 className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-white font-medium">Clear all notifications</p>
                        <p className="text-white/50 text-sm">Remove all notification history</p>
                      </div>
                    </button>
                  </div>
                  
                  {/* Notification Types Section */}
                  <div className="space-y-3">
                    <p className="text-xs text-white/50 uppercase tracking-wider font-medium">Notification Types</p>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-4 rounded-xl bg-white/10">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                            <Heart className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <p className="text-white font-medium">Likes</p>
                            <p className="text-white/50 text-sm">When someone likes your content</p>
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
                            <MessageCircle className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <p className="text-white font-medium">Comments</p>
                            <p className="text-white/50 text-sm">When someone comments or replies</p>
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
                            <p className="text-white font-medium">Follows</p>
                            <p className="text-white/50 text-sm">When someone follows you</p>
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
                            <p className="text-white font-medium">Tips</p>
                            <p className="text-white/50 text-sm">When someone tips your content</p>
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
                            <p className="text-white font-medium">Subscriptions</p>
                            <p className="text-white/50 text-sm">When someone subscribes to you</p>
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
                            <p className="text-white font-medium">Livestreams</p>
                            <p className="text-white/50 text-sm">When creators you follow go live</p>
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
        </div>
      </div>

      {/* Tabs */}
      <div className="px-3 sm:px-4 py-2">
        <div className="bg-zinc-900 rounded-2xl p-2">
          <div 
            className="flex overflow-x-auto gap-1 scrollbar-hide"
            style={{
              maskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent 100%)'
            }}
          >
            {tabs.map((tab) => {
              const count = getTabCount(tab.value);
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`flex-shrink-0 flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab.value
                      ? 'bg-white text-black'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {count > 0 && activeTab !== tab.value && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-lg">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="px-3 sm:px-4 py-2">
        <div className="bg-zinc-900 rounded-2xl overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 flex flex-col items-center justify-center text-center">
              <Bell className="w-12 h-12 text-zinc-600 mb-4" />
              <h3 className="text-white font-semibold text-lg mb-2">No notifications yet</h3>
              <p className="text-zinc-500 text-sm max-w-xs">
                When you get likes, comments, tips, or new subscribers, they'll show up here.
              </p>
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
                    Load more
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
