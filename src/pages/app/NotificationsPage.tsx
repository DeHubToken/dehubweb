import { useState } from 'react';
import { Settings, Heart, MessageCircle, DollarSign, Users, Share, Bell, Check, Loader2, UserPlus, AtSign, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/app/AuthGate';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useNotifications, useUnreadNotificationCount, useMarkAllNotificationsAsRead, useMarkNotificationAsRead } from '@/hooks/use-notifications';
import { getMediaUrl, type DeHubNotification } from '@/lib/api/dehub';
import { formatDistanceToNow } from 'date-fns';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { Link } from 'react-router-dom';

const tabs = [
  { label: 'All', value: 'all', icon: Bell },
  { label: 'Likes', value: 'like', icon: Heart },
  { label: 'Comments', value: 'comment', icon: MessageCircle },
  { label: 'Shares', value: 'share', icon: Share },
  { label: 'Tips', value: 'tip', icon: DollarSign },
  { label: 'Subs', value: 'subscribe', icon: Users },
];

function getNotificationIcon(type: DeHubNotification['type']) {
  switch (type) {
    case 'like':
      return <Heart className="w-4 h-4 text-pink-500" />;
    case 'comment':
      return <MessageCircle className="w-4 h-4 text-blue-500" />;
    case 'share':
      return <Share className="w-4 h-4 text-green-500" />;
    case 'tip':
      return <DollarSign className="w-4 h-4 text-yellow-500" />;
    case 'subscribe':
      return <Users className="w-4 h-4 text-purple-500" />;
    case 'follow':
      return <UserPlus className="w-4 h-4 text-cyan-500" />;
    case 'mention':
      return <AtSign className="w-4 h-4 text-orange-500" />;
    default:
      return <Bell className="w-4 h-4 text-zinc-500" />;
  }
}

function getNotificationText(notification: DeHubNotification): string {
  const actorName = notification.actor?.displayName || notification.actor?.username || 'Someone';
  
  switch (notification.type) {
    case 'like':
      return `${actorName} liked your post`;
    case 'comment':
      return `${actorName} commented on your post`;
    case 'share':
      return `${actorName} shared your post`;
    case 'tip':
      const tipAmount = notification.amount ? ` ${notification.amount} ${notification.currency || 'DHB'}` : '';
      return `${actorName} tipped you${tipAmount}`;
    case 'subscribe':
      return `${actorName} subscribed to you`;
    case 'follow':
      return `${actorName} started following you`;
    case 'mention':
      return `${actorName} mentioned you`;
    case 'system':
      return notification.content || 'System notification';
    default:
      return notification.content || 'New notification';
  }
}

function NotificationItem({ 
  notification, 
  onMarkAsRead,
}: { 
  notification: DeHubNotification;
  onMarkAsRead: (id: string) => void;
}) {
  const avatarUrl = getMediaUrl(notification.actor?.avatarImageUrl || notification.actor?.avatarUrl);
  const postThumbnail = notification.post?.imageUrl ? getMediaUrl(notification.post.imageUrl) : null;
  const isVerified = notification.actor?.isVerified || notification.actor?.is_verified;
  const profileLink = notification.actor?.username 
    ? `/app/profile/${notification.actor.username}` 
    : notification.actor?.address 
      ? `/app/profile/${notification.actor.address}` 
      : null;

  const handleClick = () => {
    if (!notification.read) {
      onMarkAsRead(notification.id);
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
        {profileLink ? (
          <Link to={profileLink} onClick={(e) => e.stopPropagation()}>
            <Avatar className="w-12 h-12">
              {avatarUrl && <AvatarImage src={avatarUrl} />}
              <AvatarFallback className="bg-zinc-700 text-white">
                {(notification.actor?.displayName || notification.actor?.username || 'U').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Link>
        ) : (
          <Avatar className="w-12 h-12">
            {avatarUrl && <AvatarImage src={avatarUrl} />}
            <AvatarFallback className="bg-zinc-700 text-white">
              {(notification.actor?.displayName || notification.actor?.username || 'U').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
        <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-zinc-900 border border-zinc-800">
          {getNotificationIcon(notification.type)}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${notification.read ? 'text-zinc-400' : 'text-white'}`}>
          {profileLink && notification.actor ? (
            <>
              <Link 
                to={profileLink} 
                className="font-semibold hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {notification.actor.displayName || notification.actor.username}
              </Link>
              {isVerified && <VerifiedBadge className="w-3.5 h-3.5 inline ml-1" />}
              <span className="text-zinc-400"> {getNotificationText(notification).split(notification.actor.displayName || notification.actor.username || '')[1]}</span>
            </>
          ) : (
            getNotificationText(notification)
          )}
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
        </p>
      </div>

      {/* Post thumbnail if applicable */}
      {postThumbnail && (
        <Link 
          to={`/app/post/${notification.post?.tokenId}`}
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0"
        >
          <img 
            src={postThumbnail} 
            alt="Post" 
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
  const [activeTab, setActiveTab] = useState('all');
  const { isAuthenticated } = useAuth();
  
  const { notifications, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useNotifications(activeTab);
  const { data: unreadCount } = useUnreadNotificationCount();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const markAsRead = useMarkNotificationAsRead();

  if (!isAuthenticated) {
    return (
      <AuthGate description="Log in to view your notifications and stay updated." />
    );
  }

  const handleMarkAllAsRead = () => {
    markAllAsRead.mutate();
  };

  const handleMarkAsRead = (notificationId: string) => {
    markAsRead.mutate(notificationId);
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-11 lg:top-0 bg-black z-10 p-3 sm:p-4">
        <div className="bg-zinc-900 rounded-2xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-white text-lg">Notifications</h1>
              {unreadCount !== undefined && unreadCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount !== undefined && unreadCount > 0 && (
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
              <button className="p-2 rounded-xl hover:bg-zinc-800 transition-colors">
                <Settings className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-3 sm:px-4 py-2">
        <div className="bg-zinc-900 rounded-2xl p-2">
          <div className="flex justify-evenly overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`flex-1 flex items-center justify-center gap-2 px-2 sm:px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.value
                    ? 'bg-white text-black'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
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
