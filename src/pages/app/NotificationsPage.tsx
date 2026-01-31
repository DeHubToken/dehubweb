import { useState } from 'react';
import { Settings, Heart, MessageCircle, DollarSign, Users, Bell, Check, Loader2, UserPlus, Trophy, AlertTriangle, Video, Zap, Trash2 } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';

// Tabs organized by category as per API spec
const tabs: { label: string; value: NotificationCategory | 'all'; icon: React.ElementType }[] = [
  { label: 'All', value: 'all', icon: Bell },
  { label: 'Engagement', value: 'engagement', icon: Heart },
  { label: 'Social', value: 'social', icon: Users },
  { label: 'Monetization', value: 'monetization', icon: DollarSign },
  { label: 'Content', value: 'content', icon: Video },
  { label: 'System', value: 'system', icon: AlertTriangle },
];

function getNotificationIcon(type: DeHubNotification['type']) {
  switch (type) {
    case 'like':
      return <Heart className="w-4 h-4 text-pink-500" />;
    case 'comment':
    case 'comment_reply':
      return <MessageCircle className="w-4 h-4 text-blue-500" />;
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

function getNotificationContent(notification: DeHubNotification): React.ReactNode {
  // Use the content from API which already includes aggregation text
  if (notification.content) {
    return notification.content;
  }
  
  // Fallback text generation
  const actorName = notification.actorUsername || 'Someone';
  
  switch (notification.type) {
    case 'like':
      return `${actorName} liked your ${notification.postType === 'video' ? 'video' : 'post'}`;
    case 'comment':
      return `${actorName} commented on your ${notification.postType === 'video' ? 'video' : 'post'}`;
    case 'comment_reply':
      return `${actorName} replied to your comment`;
    case 'tip':
      const tipAmount = notification.amount ? ` ${notification.amount} ${notification.currency || 'DHB'}` : '';
      return `${actorName} tipped you${tipAmount}`;
    case 'subscription':
      return `${actorName} subscribed to your plan`;
    case 'ppv_purchase':
      return `${actorName} purchased access to your video`;
    case 'following':
      return `${actorName} started following you`;
    case 'video_milestone':
      return `🎉 Your video reached a new milestone!`;
    case 'livestream_start':
      return `${actorName} started streaming`;
    case 'video_removal':
      return `Your video was removed`;
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
  onMarkAsRead,
}: { 
  notification: DeHubNotification;
  onMarkAsRead: (id: string) => void;
}) {
  const navigate = useNavigate();
  
  // Build proper avatar URL using the canonical utility
  const rawAvatarPath = extractAvatarPath(notification) || notification.actorAvatar;
  const avatarUrl = notification.actorAddress 
    ? buildAvatarUrl(notification.actorAddress, rawAvatarPath)
    : rawAvatarPath?.startsWith('http') ? rawAvatarPath : undefined;
  
  // Dicebear fallback for when no avatar exists
  const fallbackAvatar = notification.actorAddress 
    ? `https://api.dicebear.com/7.x/identicon/svg?seed=${notification.actorAddress}`
    : undefined;
    
  const postThumbnail = notification.tokenThumbnail 
    ? (notification.tokenThumbnail.startsWith('http') ? notification.tokenThumbnail : `https://dehubcdn.dehub.io/${notification.tokenThumbnail}`)
    : null;
  
  const profileLink = notification.actorUsername 
    ? `/${notification.actorUsername}` 
    : notification.actorAddress 
      ? `/${notification.actorAddress}` 
      : null;

  const handleClick = () => {
    if (!notification.read) {
      onMarkAsRead(notification.id);
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
          {getNotificationContent(notification)}
        </p>
        
        {/* Show aggregated actor names if available */}
        {notification.aggregatedCount && notification.aggregatedCount > 1 && notification.latestActorNames && (
          <p className="text-xs text-zinc-500 mt-0.5">
            {notification.latestActorNames.slice(0, 3).join(', ')}
            {notification.aggregatedCount > 3 && ` and ${notification.aggregatedCount - 3} others`}
          </p>
        )}
        
        <p className="text-xs text-zinc-500 mt-1">
          {formatDistanceToNow(new Date(notification.updatedAt || notification.createdAt), { addSuffix: true })}
        </p>
      </div>

      {/* Post thumbnail if applicable */}
      {postThumbnail && (
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

      {/* Unread indicator */}
      {!notification.read && (
        <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
      )}
    </div>
  );
}

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState<NotificationCategory | 'all'>('all');
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
  
  // Only pass category if not 'all'
  const category = activeTab === 'all' ? undefined : activeTab;
  
  const { notifications, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useNotifications(category);
  const { data: unreadCount } = useUnreadNotificationCount();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const markAsRead = useMarkNotificationAsRead();

  if (!isAuthenticated) {
    return (
      <AuthGate description="Log in to view your notifications and stay updated." />
    );
  }

  const handleMarkAllAsRead = () => {
    markAllAsRead.mutate(category);
  };

  const handleMarkAsRead = (notificationId: string) => {
    markAsRead.mutate(notificationId);
  };

  // Get total unread count
  const totalUnread = unreadCount?.total ?? 0;
  
  // Get category-specific unread count for badge display
  const getCategoryCount = (cat: NotificationCategory | 'all'): number => {
    if (cat === 'all') return totalUnread;
    return unreadCount?.byCategory?.[cat] ?? 0;
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-11 lg:top-0 bg-black z-10 p-3 sm:p-4">
        <div className="bg-zinc-900 rounded-2xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={notificationsIcon} alt="Notifications" className="w-7 h-7 object-contain" />
              <h1 className="font-bold text-white text-lg">Notifications</h1>
              {totalUnread > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full">
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 rounded-xl hover:bg-zinc-800 transition-colors">
                    <Settings className="w-5 h-5 text-zinc-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 bg-zinc-900 border-zinc-800">
                  <DropdownMenuLabel className="text-zinc-400 text-xs">Actions</DropdownMenuLabel>
                  <DropdownMenuItem 
                    onClick={handleMarkAllAsRead}
                    disabled={markAllAsRead.isPending || totalUnread === 0}
                    className="text-white hover:bg-zinc-800 cursor-pointer"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Mark all as read
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    className="text-red-400 hover:bg-zinc-800 hover:text-red-400 cursor-pointer"
                    onClick={() => {
                      // TODO: Implement clear all notifications API
                      console.log('Clear all notifications');
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear all notifications
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator className="bg-zinc-800" />
                  <DropdownMenuLabel className="text-zinc-400 text-xs">Notification Types</DropdownMenuLabel>
                  
                  <div className="px-2 py-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Heart className="w-4 h-4 text-pink-500" />
                      <span className="text-sm text-white">Likes</span>
                    </div>
                    <Switch 
                      checked={notificationPrefs.likes}
                      onCheckedChange={(checked) => setNotificationPrefs(p => ({ ...p, likes: checked }))}
                    />
                  </div>
                  
                  <div className="px-2 py-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="w-4 h-4 text-blue-500" />
                      <span className="text-sm text-white">Comments</span>
                    </div>
                    <Switch 
                      checked={notificationPrefs.comments}
                      onCheckedChange={(checked) => setNotificationPrefs(p => ({ ...p, comments: checked }))}
                    />
                  </div>
                  
                  <div className="px-2 py-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-cyan-500" />
                      <span className="text-sm text-white">Follows</span>
                    </div>
                    <Switch 
                      checked={notificationPrefs.follows}
                      onCheckedChange={(checked) => setNotificationPrefs(p => ({ ...p, follows: checked }))}
                    />
                  </div>
                  
                  <div className="px-2 py-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-yellow-500" />
                      <span className="text-sm text-white">Tips</span>
                    </div>
                    <Switch 
                      checked={notificationPrefs.tips}
                      onCheckedChange={(checked) => setNotificationPrefs(p => ({ ...p, tips: checked }))}
                    />
                  </div>
                  
                  <div className="px-2 py-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-purple-500" />
                      <span className="text-sm text-white">Subscriptions</span>
                    </div>
                    <Switch 
                      checked={notificationPrefs.subscriptions}
                      onCheckedChange={(checked) => setNotificationPrefs(p => ({ ...p, subscriptions: checked }))}
                    />
                  </div>
                  
                  <div className="px-2 py-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-red-500" />
                      <span className="text-sm text-white">Livestreams</span>
                    </div>
                    <Switch 
                      checked={notificationPrefs.livestreams}
                      onCheckedChange={(checked) => setNotificationPrefs(p => ({ ...p, livestreams: checked }))}
                    />
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-3 sm:px-4 py-2">
        <div className="bg-zinc-900 rounded-2xl p-2">
          <div className="flex overflow-x-auto gap-1 scrollbar-hide">
            {tabs.map((tab) => {
              const count = getCategoryCount(tab.value);
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
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
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
              {notifications.filter(n => n && n.id).map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={handleMarkAsRead}
                />
              ))}
              
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
