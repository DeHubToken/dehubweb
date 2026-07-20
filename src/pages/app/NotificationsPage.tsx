import { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';
import { useDragTabIndicator } from '@/hooks/use-drag-tab-indicator';
import { useTranslation } from 'react-i18next';
import { Settings, ThumbsUp, MessageSquareText, Gem, Users, Bell, Check, Loader2, UserPlus, Trophy, AlertTriangle, Video, Zap, Trash2, MailOpen, Mail, Repeat2, Star, X as XIcon, Store, UsersRound, ShoppingBag, Lightbulb } from 'lucide-react';
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
import { useQueries, useQueryClient } from '@tanstack/react-query';

import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { supabase } from '@/integrations/supabase/client';
import { seedProfileCache } from '@/lib/profile-cache-seed';
import { SEOHead } from '@/components/SEOHead';
import { DEHUB_CDN_BASE, getNFTInfo, getFollowRequests, approveFollowRequest, rejectFollowRequest } from '@/lib/api/dehub';
import { mapNFTToFeedItem } from '@/lib/nft-to-feed-item';

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Switch } from '@/components/ui/switch';
import { FollowersListDrawer } from '@/components/app/profile';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { ImageCard } from '@/components/app/cards/ImageCard';
import { PostCard } from '@/components/app/cards/PostCard';
import { Skeleton } from '@/components/ui/skeleton';
import type { FeedItem } from '@/types/feed.types';

// ============================================================================
// NotificationPostCards — fetches full NFT data and renders real feed cards
// ============================================================================
function NotificationPostCards({ tokenIds }: { tokenIds: number[] }) {
  const results = useQueries({
    queries: tokenIds.map((id) => ({
      queryKey: ['nft-info', String(id)],
      queryFn: () => getNFTInfo(String(id)),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const isLoading = results.some((r) => r.isLoading);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {tokenIds.map((id) => (
          <div key={id} className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3">
            <div className="flex items-center gap-3 pb-3">
              <Skeleton className="w-10 h-10 rounded-md" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-1/3 bg-white/[0.06]" />
                <Skeleton className="h-3 w-1/4 bg-white/[0.06]" />
              </div>
            </div>
            <Skeleton className="aspect-video w-full rounded-lg bg-white/[0.06]" />
          </div>
        ))}
      </div>
    );
  }

  const feedItems: FeedItem[] = results
    .map((r) => r.data)
    .filter((nft): nft is NonNullable<typeof nft> => nft != null)
    .map(mapNFTToFeedItem);

  return (
    <div className="space-y-4">
      {feedItems.map((item) => {
        let card: React.ReactNode = null;
        switch (item.type) {
          case 'video':
            card = <VideoCard key={item.id} video={item} />;
            break;
          case 'image':
            card = <ImageCard key={item.id} post={item} />;
            break;
          case 'post':
            card = <PostCard key={item.id} post={item} />;
            break;
          default:
            return null;
        }
        return (
          <div key={item.id} className="rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] p-3">
            {card}
          </div>
        );
      })}
    </div>
  );
}

// Batch avatar enrichment cache for fresh profile pictures
interface EnrichedAvatar {
  avatarUrl: string | null;
  username: string | null;
  displayName: string | null;
  address?: string | null;
}

// Module-level caches survive component unmount/remount (tab switching, navigation)
let moduleAvatarCache = new Map<string, EnrichedAvatar>();
const moduleEnrichedKeys = new Set<string>();

// Bundled notification: wraps one or more raw notifications into a display group
interface BundledNotification {
  /** The primary notification (most recent in the bundle) */
  primary: DeHubNotification;
  /** All notification IDs in this bundle */
  allIds: string[];
  /** All raw notifications in this bundle (for same-actor: each has its own tokenId/title/thumbnail) */
  allNotifications: DeHubNotification[];
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

  // Deduplicate: when API sends both 'mention' and 'comment_reply' for the same commentId
  // from the same actor, keep only the 'mention' (more specific) and discard the 'comment_reply'.
  const deduped = notifications.filter((n, _idx, arr) => {
    if (n.type !== 'comment_reply') return true;
    const commentId = (n as any).commentId;
    if (!commentId) return true;
    // If there's a matching 'mention' notification with the same commentId from the same actor, drop this one
    return !arr.some(other =>
      other.id !== n.id &&
      other.type === 'mention' &&
      (other as any).commentId === commentId &&
      other.actorAddress?.toLowerCase() === n.actorAddress?.toLowerCase()
    );
  });

  const bundles: BundledNotification[] = [];
  const consumed = new Set<string>();

  for (let i = 0; i < deduped.length; i++) {
    const n = deduped[i];
    if (consumed.has(n.id)) continue;

    const nTime = new Date(n.createdAt).getTime();

    // No client-side multi-actor bundling for follows — each follow stays individual.
    // Backend-aggregated follows (with aggregatedCount > 1) are handled in getNotificationContent.

    // Try same-actor bundling for likes/comments on different posts
    if (['like', 'comment', 'repost', 'quote'].includes(n.type) && n.actorAddress) {
      const group: DeHubNotification[] = [n];
      for (let j = i + 1; j < deduped.length; j++) {
        const m = deduped[j];
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
          allNotifications: group,
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
      allNotifications: [n],
      postCount: 1,
      actorNames: [],
      actorCount: 1,
      bundleType: 'single',
    });
  }

  return bundles;
}

// Notification type tabs
type NotificationTypeFilter = 'all' | 'likes' | 'follows' | 'comments' | 'reposts' | 'subscriptions' | 'tips' | 'livestreams' | 'communities' | 'stores' | 'features';

const tabs: { labelKey: string; value: NotificationTypeFilter; icon: React.ElementType }[] = [
  { labelKey: 'notifications.all', value: 'all', icon: Bell },
  { labelKey: 'notifications.likes', value: 'likes', icon: ThumbsUp },
  { labelKey: 'notifications.follows', value: 'follows', icon: UserPlus },
  { labelKey: 'notifications.comments', value: 'comments', icon: MessageSquareText },
  { labelKey: 'notifications.reposts', value: 'reposts', icon: Repeat2 },
  { labelKey: 'notifications.features', value: 'features', icon: Lightbulb },
  { labelKey: 'notifications.communities', value: 'communities', icon: UsersRound },
  { labelKey: 'notifications.stores', value: 'stores', icon: Store },
  { labelKey: 'notifications.subs', value: 'subscriptions', icon: Users },
  { labelKey: 'notifications.tips', value: 'tips', icon: Gem },
  { labelKey: 'notifications.live', value: 'livestreams', icon: Zap },
];

// Map tab filter to notification types
const filterTypeMap: Record<NotificationTypeFilter, string[] | null> = {
  all: null,
  likes: ['like', 'comment_like', 'feature_request_like', 'governance_vote'],
  follows: ['following', 'follow_request', 'followRequest', 'follow-request'],
  comments: ['comment', 'comment_reply', 'mention', 'feature_request_comment', 'governance_comment'],
  reposts: ['repost', 'quote'],
  features: ['feature_request_like', 'feature_request_comment'],
  communities: ['community_join'],
  stores: ['store_order', 'fraction_offer', 'fraction_offer_accepted', 'fraction_offer_rejected'],
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
      return <Gem className="w-4 h-4 text-white/70" />;
    case 'subscription':
    case 'ppv_purchase':
      return <Users className="w-4 h-4 text-white/70" />;
    case 'following':
    case 'follow_request':
    case 'followRequest':
    case 'follow-request':
      return <UserPlus className="w-4 h-4 text-white/70" />;
    case 'video_milestone':
      return <Trophy className="w-4 h-4 text-white/70" />;
    case 'livestream_start':
      return <Zap className="w-4 h-4 text-white/70" />;
    case 'video_removal':
      return <AlertTriangle className="w-4 h-4 text-white/70" />;
    case 'governance_vote':
      return <Star className="w-4 h-4 text-white/70" />;
    case 'community_join':
      return <UsersRound className="w-4 h-4 text-white/70" />;
    case 'store_order':
      return <ShoppingBag className="w-4 h-4 text-white/70" />;
    case 'fraction_offer':
    case 'fraction_offer_accepted':
    case 'fraction_offer_rejected':
      return <Store className="w-4 h-4 text-white/70" />;
    default:
      return <Bell className="w-4 h-4 text-white/70" />;
  }
}

/** Normalize a username for comparison: trim, strip leading @, lowercase */
function normalizeUsername(name: string | null | undefined): string {
  if (!name) return '';
  return name.trim().replace(/^@/, '').toLowerCase();
}

function toUsernameCacheKey(name: string | null | undefined): string | null {
  const normalized = normalizeUsername(name);
  return normalized ? `username:${normalized}` : null;
}

interface CanonicalActor {
  display: string;
  key: string;
  resolvedUsername?: string;
  canonicalId: string;
  address?: string;
}

function findActorEnrichment(actor: CanonicalActor, enrichedAvatarsMap?: Map<string, EnrichedAvatar>): EnrichedAvatar | undefined {
  if (!enrichedAvatarsMap) return undefined;

  const candidateKeys = new Set<string>();
  if (actor.address) candidateKeys.add(actor.address.toLowerCase());
  if (actor.canonicalId) {
    candidateKeys.add(actor.canonicalId);
    const canonicalUsernameKey = toUsernameCacheKey(actor.canonicalId);
    if (canonicalUsernameKey) candidateKeys.add(canonicalUsernameKey);
  }
  const actorUsernameKey = toUsernameCacheKey(actor.key);
  if (actorUsernameKey) candidateKeys.add(actorUsernameKey);
  const resolvedUsernameKey = toUsernameCacheKey(actor.resolvedUsername);
  if (resolvedUsernameKey) candidateKeys.add(resolvedUsernameKey);

  for (const key of candidateKeys) {
    const hit = enrichedAvatarsMap.get(key);
    if (hit) return hit;
  }

  const normalizedActorKey = normalizeUsername(actor.resolvedUsername || actor.key || actor.display);
  const actorAddress = (actor.address || '').toLowerCase();

  for (const [, entry] of enrichedAvatarsMap) {
    if (!entry) continue;
    if (actorAddress && entry.address?.toLowerCase() === actorAddress) return entry;
    if (normalizeUsername(entry.username) === normalizedActorKey) return entry;
  }

  return undefined;
}

/**
 * Build a canonical, deduplicated actor list from latestActorNames + primary actor.
 * Deduplicates by RESOLVED IDENTITY (address or canonical username from enrichment),
 * not by raw display text — so the same person under different name forms only gets one slot.
 */
function buildCanonicalActors(
  latestActorNames: string[] | undefined,
  primaryUsername: string | null | undefined,
  enrichedUsername: string | null | undefined,
  enrichedAvatarsMap?: Map<string, EnrichedAvatar>,
): CanonicalActor[] {
  const actors: CanonicalActor[] = [];
  const seenCanonicalIds = new Set<string>();

  const resolveCanonicalIdentity = (nameOrKey: string): { canonicalId: string; resolvedUsername?: string; address?: string } => {
    const normalized = normalizeUsername(nameOrKey);
    if (!normalized) return { canonicalId: '' };

    const usernameKey = toUsernameCacheKey(normalized);
    const byUsername = usernameKey ? enrichedAvatarsMap?.get(usernameKey) : undefined;

    if (byUsername) {
      const resolvedAddress = byUsername.address?.toLowerCase();
      const resolvedUsername = normalizeUsername(byUsername.username);
      return {
        canonicalId: resolvedAddress || resolvedUsername || normalized,
        resolvedUsername: byUsername.username || undefined,
        address: resolvedAddress || undefined,
      };
    }

    if (enrichedAvatarsMap) {
      for (const [, candidate] of enrichedAvatarsMap) {
        if (normalizeUsername(candidate.username) === normalized || candidate.address?.toLowerCase() === normalized) {
          const resolvedAddress = candidate.address?.toLowerCase();
          const resolvedUsername = normalizeUsername(candidate.username);
          return {
            canonicalId: resolvedAddress || resolvedUsername || normalized,
            resolvedUsername: candidate.username || undefined,
            address: resolvedAddress || undefined,
          };
        }
      }
    }

    return { canonicalId: normalized };
  };

  const addActorCandidate = (displayValue: string | null | undefined, preferredKey?: string | null) => {
    const display = (displayValue || '').trim();
    const key = normalizeUsername(preferredKey || displayValue);
    if (!key) return;

    const identity = resolveCanonicalIdentity(key);
    if (!identity.canonicalId || seenCanonicalIds.has(identity.canonicalId)) return;

    seenCanonicalIds.add(identity.canonicalId);
    actors.push({
      display: display || key,
      key,
      resolvedUsername: identity.resolvedUsername,
      canonicalId: identity.canonicalId,
      address: identity.address,
    });
  };

  latestActorNames?.forEach((name) => addActorCandidate(name));
  addActorCandidate(enrichedUsername || primaryUsername, enrichedUsername || primaryUsername);

  return actors;
}

function resolveActorAvatarUrl(actor: CanonicalActor, enrichedAvatarsMap?: Map<string, EnrichedAvatar>): string | undefined {
  return findActorEnrichment(actor, enrichedAvatarsMap)?.avatarUrl || undefined;
}

/** Resolve a safe profile link for an actor, avoiding broken display-name URLs */
function resolveActorProfileLink(actor: CanonicalActor, enrichedAvatarsMap?: Map<string, EnrichedAvatar>): string | null {
  const enriched = findActorEnrichment(actor, enrichedAvatarsMap);
  const resolvedHandle = normalizeUsername(actor.resolvedUsername || enriched?.username);
  if (resolvedHandle && /^[a-z0-9._]+$/.test(resolvedHandle)) return `/${resolvedHandle}`;

  const safeKey = normalizeUsername(actor.key);
  if (safeKey && /^[a-z0-9._]+$/.test(safeKey)) return `/${safeKey}`;

  const address = (actor.address || enriched?.address || '').toLowerCase();
  return address ? `/${address}` : null;
}
function getNotificationContent(
  notification: DeHubNotification,
  bundle?: BundledNotification,
  t?: (key: string, opts?: any) => string,
  onOthersClick?: () => void,
  canonicalActors?: CanonicalActor[],
): React.ReactNode {

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
  if ((notification.type as string) === 'community_join') {
    const title = (notification as any)._customReferenceTitle || notification.tokenTitle;
    return title ? `${actorName} joined your community "${title}"` : `${actorName} joined your community`;
  }
  if ((notification.type as string) === 'store_order') {
    const title = (notification as any)._customReferenceTitle || notification.tokenTitle;
    return title ? `${actorName} purchased your listing "${title}"` : `${actorName} purchased your listing`;
  }
  if ((notification.type as string) === 'fraction_offer') {
    return (notification as any).content || `${actorName} made an offer on your fractions`;
  }
  if ((notification.type as string) === 'fraction_offer_accepted') {
    return (notification as any).content || `Your fraction offer was accepted`;
  }
  if ((notification.type as string) === 'fraction_offer_rejected') {
    return (notification as any).content || `Your fraction offer was rejected`;
  }

  // Backend-aggregated follow
  if (notification.type === 'following' && (notification as any).aggregatedCount > 2) {
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
  
  // Backend-aggregated like/comment/repost (aggregatedCount > 1 with latestActorNames)
  const aggCount = (notification as any).aggregatedCount || 1;
  const aggNames = (notification as any).latestActorNames as string[] | undefined;
  const typeStr = notification.type as string;
  if (aggCount > 2 && ['like', 'comment', 'repost'].includes(typeStr)) {
    const canonical = (canonicalActors && canonicalActors.length > 0)
      ? canonicalActors
      : buildCanonicalActors(aggNames, undefined, undefined);

    if (canonical.length <= 1) {
      const name = canonical[0]?.display || actorName;
      const postCount = aggCount;
      if (typeStr === 'like') return `${name} liked ${postCount} of your posts`;
      if (typeStr === 'comment') return `${name} commented on ${postCount} of your posts`;
      if (typeStr === 'repost') return `${name} reposted ${postCount} of your posts`;
    } else {
      // Multiple users — first name and others count come from the exact same canonical source as the grid
      const first = canonical[0]?.display || aggNames?.[0] || actorName;
      const rest = Math.max(aggCount - 1, 0);
      const othersText = rest === 1 ? tr('notifications.oneOther') : tr('notifications.nOthers', { count: rest });
      const othersSpan = onOthersClick ? (
        <span className="cursor-pointer hover:text-white hover:underline decoration-solid" onClick={(e) => { e.stopPropagation(); e.preventDefault(); onOthersClick(); }}>
          {othersText}
        </span>
      ) : othersText;

      if (typeStr === 'like') return <>{first} and {othersSpan} liked your post</>;
      if (typeStr === 'comment') return <>{first} and {othersSpan} commented on your post</>;
      if (typeStr === 'repost') return <>{first} and {othersSpan} reposted your post</>;
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
    case 'follow_request':
      return `${actorName} requested to follow you`;
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

  // Comment-type notifications should auto-open comments on the post
  const isCommentType = ['comment', 'comment_reply', 'comment_like'].includes(notification.type);
  const commentSuffix = isCommentType ? '?comments=1' : '';

  switch (notification.type) {
    case 'like':
    case 'comment':
    case 'comment_reply':
    case 'comment_like':
    case 'mention':
    case 'tip':
    case 'video_milestone':
      return notification.tokenId ? `/app/post/${notification.tokenId}${commentSuffix}` : null;
    case 'following':
      return notification.actorAddress 
        ? `/${notification.actorAddress}` 
        : notification.actorUsername 
          ? `/${notification.actorUsername}` 
          : null;
    case 'follow_request':
      // Follow requests don't navigate — they have inline accept/reject buttons
      return null;
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

// Off-screen rows (index >= 6) get `content-visibility: auto` so the browser
// skips their layout + paint until they scroll near the viewport — same
// technique as offscreenCardStyle in ProfileTabContent / the home feed. The
// `auto` keyword means once a row has rendered, the browser reuses its real
// size as the placeholder. Constant object keeps the prop referentially
// stable so it never defeats React.memo.
const OFFSCREEN_ROW_STYLE: React.CSSProperties = { contentVisibility: 'auto', containIntrinsicSize: 'auto 80px' };
function offscreenRowStyle(index: number): React.CSSProperties | undefined {
  return index < 6 ? undefined : OFFSCREEN_ROW_STYLE;
}

// Memoized: the page stays mounted forever (PersistentPageCache), so any parent
// re-render used to re-run every row's per-render work (canonical-actor
// building, date formatting). All props are kept referentially stable in the
// parent (memoized bundles/list, useCallback onMarkAsRead, constant style).
const NotificationItem = memo(function NotificationItem({
  notification,
  bundle,
  onMarkAsRead,
  isMarkingAsRead,
  enrichedAvatars,
  style,
}: {
  notification: DeHubNotification;
  bundle: BundledNotification;
  onMarkAsRead: (id: string) => void;
  isMarkingAsRead: boolean;
  enrichedAvatars: Map<string, EnrichedAvatar>;
  style?: React.CSSProperties;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [isClosing, setIsClosing] = useState(false);
  const [showActorsDrawer, setShowActorsDrawer] = useState(false);
  const [showPostsDrawer, setShowPostsDrawer] = useState(false);
  const drawerJustClosed = useRef(false);
  const [followRequestAction, setFollowRequestAction] = useState<'accepted' | 'rejected' | null>(null);
  const [followRequestLoading, setFollowRequestLoading] = useState<'accept' | 'reject' | null>(null);

  const isFollowRequest = (notification.type as string) === 'follow_request' || 
    (notification.type as string) === 'followRequest' ||
    (notification.type as string) === 'follow-request' ||
    ((notification.type as string) === 'following' && notification.content?.toLowerCase().includes('requested'));

  const handleFollowRequestAction = async (action: 'accept' | 'reject') => {
    if (!notification.actorAddress) return;
    setFollowRequestLoading(action);
    try {
      // Fetch follow requests to find the matching request ID
      const requests = await getFollowRequests();
      console.log('[FollowRequest] fetched requests:', requests.map(r => ({ id: r.id, _id: (r as any)._id, address: r.address })));
      const match = requests.find(
        r => r.address?.toLowerCase() === notification.actorAddress?.toLowerCase()
      );
      const requestId = match?.id || match?._id;
      console.log('[FollowRequest] matched:', { match: !!match, requestId, actorAddress: notification.actorAddress });
      
      if (!requestId) {
        // No pending request found — it was likely already handled
        setFollowRequestAction(action === 'accept' ? 'accepted' : 'rejected');
        toast.info('Request already handled');
        return;
      }
      
      if (action === 'accept') {
        await approveFollowRequest(requestId);
        setFollowRequestAction('accepted');
        toast.success(`Accepted ${notification.actorUsername || 'user'}'s follow request`);
      } else {
        await rejectFollowRequest(requestId);
        setFollowRequestAction('rejected');
        toast.success(`Rejected ${notification.actorUsername || 'user'}'s follow request`);
      }
      // Mark as read
      if (!notification.read) {
        bundle.allIds.forEach(id => onMarkAsRead(id));
      }
    } catch (err: any) {
      console.error('[FollowRequest] Error:', err);
      const msg = err?.message?.toLowerCase() || '';
      if (msg.includes('not found') || msg.includes('already')) {
        setFollowRequestAction(action === 'accept' ? 'accepted' : 'rejected');
        toast.info('Request already handled');
      } else {
        toast.error(`Failed to ${action} follow request`);
      }
    } finally {
      setFollowRequestLoading(null);
    }
  };

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

  const aggregatedActorNames = (notification as any).latestActorNames as string[] | undefined;
  // Memoized: walks the enrichedAvatars Map per actor — without the memo this
  // re-ran for every row on every parent render.
  const canonicalActors = useMemo(() => {
    const fromAggregated = buildCanonicalActors(aggregatedActorNames, undefined, undefined, enrichedAvatars);
    if (fromAggregated.length > 0) return fromAggregated;
    return buildCanonicalActors(undefined, notification.actorUsername, enriched?.username, enrichedAvatars);
  }, [aggregatedActorNames, notification.actorUsername, enriched?.username, enrichedAvatars]);
  const aggregatedCount = (notification as any).aggregatedCount || 1;
  const isBackendAggregatedMultiActor =
    canonicalActors.length >= 2 &&
    aggregatedCount > 2 &&
    ['like', 'comment', 'repost', 'following'].includes(notification.type as string) &&
    bundle.bundleType !== 'same-actor';

  const primaryKey = normalizeUsername(enriched?.username || notification.actorUsername);
  const primaryAddress = notification.actorAddress?.toLowerCase();

  const resolveActorAvatar = (actor: CanonicalActor | null | undefined): string | undefined => {
    if (!actor) return undefined;

    const resolved = resolveActorAvatarUrl(actor, enrichedAvatars);
    if (resolved) return resolved;

    // Critical: for backend multi-actor aggregates, never borrow the primary actor avatar
    // for other actors (this causes "wrong face under correct name" mismatches).
    if (isBackendAggregatedMultiActor) return undefined;

    const actorAddress = actor.address?.toLowerCase();
    if (primaryAddress && actorAddress && actorAddress === primaryAddress) return avatarUrl;

    return actor.key === primaryKey ? avatarUrl : undefined;
  };

  const hasUnread = bundle.bundleType !== 'single' 
    ? bundle.allIds.some(id => {
        // Check if any notification in the bundle is unread - we only have the primary easily
        return !notification.read;
      })
    : !notification.read;

  const { walletAddress } = useAuth();

  // Seed profile cache before navigating to a profile so the header renders instantly
  const seedAndNavigateToProfile = (n: DeHubNotification) => {
    const username = n.actorUsername?.replace('@', '');
    const address = n.actorAddress;
    if (username || address) {
      seedProfileCache(queryClient, {
        address: address || '',
        username,
        avatarUrl: n.actorAvatar || (n.actor as any)?.avatar,
        displayName: (n.actor as any)?.displayName || username,
      }, walletAddress || undefined);
    }
    const target = username || address;
    if (target) navigate(`/${target}`);
  };

  const handleClick = () => {
    // If a drawer is open or just closed, don't navigate
    if (showActorsDrawer || showPostsDrawer || drawerJustClosed.current) return;
    
    // Mark all notifications in bundle as read
    if (hasUnread) {
      bundle.allIds.forEach(id => onMarkAsRead(id));
    }
    
    // Follow request notifications — clicking row navigates to requester's profile
    if (isFollowRequest) {
      seedAndNavigateToProfile(notification);
      return;
    }

    // Aggregated follow notifications → open followers drawer inline
    const isAggregatedFollow = notification.type === 'following' && (notification as any).aggregatedCount > 2;
    if (isAggregatedFollow && walletAddress) {
      window.dispatchEvent(new CustomEvent('open-followers-drawer'));
      return;
    }
    
    // Same-actor bundle with multiple posts → open posts drawer
    if (bundle.bundleType === 'same-actor' && bundle.postCount > 1) {
      setShowPostsDrawer(true);
      return;
    }
    
    // Navigate to appropriate destination
    const navLink = getNavigationLink(notification);
    if (navLink) {
      // Seed profile cache for profile-bound navigations
      const isProfileNav = ['following', 'subscription', 'ppv_purchase'].includes(notification.type);
      if (isProfileNav) {
        seedAndNavigateToProfile(notification);
      } else {
        navigate(navLink);
      }
    }
  };

  

  const isUnreadRow = !(notification.read || isClosing);

  return (
    <div
      onClick={handleClick}
      data-notification-row
      data-unread={isUnreadRow ? '' : undefined}
      style={style}
      className={`flex items-start gap-3 p-4 transition-colors duration-300 cursor-pointer ${
        (notification.read || isClosing) ? 'bg-zinc-900/50' : 'bg-zinc-800/80 hover:bg-zinc-800'
      }`}
    >
      {/* Avatar with type icon overlay — stacked for aggregated notifications */}
      <div className="relative flex-shrink-0">
        {(() => {
          const hasMultipleActors = isBackendAggregatedMultiActor;
          
          if (hasMultipleActors) {
            // 2×2 grid: TL=actor1, TR=actor2, BL=actor3, BR=type icon
            const [actor1, actor2, actor3] = canonicalActors.slice(0, 3);
            const avatar1Url = resolveActorAvatar(actor1);
            const avatar2Url = resolveActorAvatar(actor2);
            const avatar3Url = resolveActorAvatar(actor3);

            const renderGridAvatar = (
              url: string | undefined,
              name: string | null,
              link: string | null,
              size: string
            ) => {
              const avatarEl = (
                <Avatar className={`${size} ring-1 ring-zinc-800`}>
                  {url && <AvatarImage src={url} />}
                  <AvatarFallback className="bg-zinc-700 text-white text-[10px] font-medium">
                    {name ? name.charAt(0).toUpperCase() : '?'}
                  </AvatarFallback>
                </Avatar>
              );
              return link ? (
                <Link to={link} onClick={(e) => e.stopPropagation()}>
                  {avatarEl}
                </Link>
              ) : avatarEl;
            };
            
            return (
              <div className="grid grid-cols-2 grid-rows-2 gap-0.5 w-12 h-12 flex-shrink-0">
                {renderGridAvatar(avatar1Url, actor1?.display || fallbackLetter, actor1 ? resolveActorProfileLink(actor1, enrichedAvatars) || profileLink : profileLink, 'w-[23px] h-[23px]')}
                {renderGridAvatar(avatar2Url, actor2?.display || null, actor2 ? resolveActorProfileLink(actor2, enrichedAvatars) : null, 'w-[23px] h-[23px]')}
                {actor3 ? (
                  renderGridAvatar(avatar3Url, actor3.display, resolveActorProfileLink(actor3, enrichedAvatars), 'w-[23px] h-[23px]')
                ) : (
                  renderGridAvatar(undefined, null, null, 'w-[23px] h-[23px]')
                )}
                <button
                  className="w-[23px] h-[23px] rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center hover:bg-zinc-700 transition-colors cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setShowActorsDrawer(true);
                  }}
                  title="View all"
                >
                  {getNotificationIcon(notification.type)}
                </button>
              </div>
            );
          }
          
          // Single avatar (default)
          return profileLink ? (
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
          );
        })()}
        {/* Type icon badge — only for single-actor notifications (aggregated ones render it inside) */}
        {!isBackendAggregatedMultiActor && (
          <div className="absolute -bottom-1 -right-1 p-1 rounded-lg bg-zinc-900 border border-zinc-800">
            {getNotificationIcon(notification.type)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${(notification.read || isClosing) ? 'text-zinc-400' : 'text-white'}`}>
          {getNotificationContent(notification, bundle, t, () => setShowActorsDrawer(true), canonicalActors)}
        </p>
        
        {/* Post preview snippet — for replies/mentions show the comment text, otherwise the post title */}
        {bundle.bundleType !== 'same-actor' && (() => {
          const commentPreview = (notification as any).commentPreview;
          const isReplyOrMention = notification.type === 'comment_reply' || notification.type === 'mention';
          // Strip leading @mention from comment preview
          const cleanedPreview = commentPreview ? commentPreview.replace(/^@\w+\s*/, '') : null;
          const previewText = isReplyOrMention && cleanedPreview ? cleanedPreview : notification.tokenTitle;
          if (!previewText) return null;
          return (
            <>
              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1 italic">
                "{previewText}"
              </p>
              {/* Secondary post title context for reply/mention */}
              {isReplyOrMention && notification.tokenTitle && (
                <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">
                  on: {notification.tokenTitle}
                </p>
              )}
            </>
          );
        })()}
        
        {/* Show individual actor names below backend-aggregated follows */}
        {notification.type === 'following' && (notification as any).aggregatedCount > 2 && (notification as any).latestActorNames?.length > 1 && (
          <p className="text-xs text-zinc-500 mt-0.5">
            {(notification as any).latestActorNames.join(', ')}
          </p>
        )}
        
        <p className="text-xs text-zinc-500 mt-1">
          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
        </p>

        {/* Follow request accept/reject buttons — inline under text on mobile */}
        {isFollowRequest && !followRequestAction && (
          <div className="flex items-center gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => handleFollowRequestAction('accept')}
              disabled={followRequestLoading !== null}
              className="h-7 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              {followRequestLoading === 'accept' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Accept
            </button>
            <button
              onClick={() => handleFollowRequestAction('reject')}
              disabled={followRequestLoading !== null}
              className="h-7 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              {followRequestLoading === 'reject' ? <Loader2 className="w-3 h-3 animate-spin" /> : <XIcon className="w-3 h-3" />}
              Reject
            </button>
          </div>
        )}
        {isFollowRequest && followRequestAction && (
          <span className={`text-xs font-medium mt-2 inline-block px-2 py-1 rounded-lg ${
            followRequestAction === 'accepted' ? 'text-green-400 bg-green-500/10' : 'text-zinc-500 bg-zinc-800/50'
          }`}>
            {followRequestAction === 'accepted' ? '✓ Accepted' : '✗ Rejected'}
          </span>
        )}
      </div>

      {/* Post thumbnail if applicable */}
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

      {/* Actors drawer — shows all users who performed this action */}
      <Drawer open={showActorsDrawer} onOpenChange={(open) => {
        if (!open) { drawerJustClosed.current = true; setTimeout(() => { drawerJustClosed.current = false; }, 300); }
        setShowActorsDrawer(open);
      }}>
        <DrawerContent data-notifications-page className="bg-black/60 backdrop-blur-[24px] border-white/10 max-h-[70vh]">
          <DrawerHeader className="text-center pb-2">
            <DrawerTitle className="text-white text-base">
              {(notification.type as string) === 'like' ? 'Liked by' : (notification.type as string) === 'repost' ? 'Reposted by' : (notification.type as string) === 'comment' ? 'Commented by' : 'Users'}
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-1 overflow-y-auto max-h-[50vh]" data-vaul-no-drag>
            {canonicalActors.map((actor) => {
              const actorLink = resolveActorProfileLink(actor, enrichedAvatars);
              const actorAvatar = resolveActorAvatar(actor);
              const actorHandle = normalizeUsername(actor.resolvedUsername || actor.key || actor.display) || actor.display;

              return (
                <Link
                  key={actor.canonicalId}
                  to={actorLink || '#'}
                  onClick={() => setShowActorsDrawer(false)}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors"
                >
                  <Avatar className="w-10 h-10">
                    {actorAvatar && <AvatarImage src={actorAvatar} />}
                    <AvatarFallback className="bg-zinc-700 text-white font-medium">{actor.display.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="text-white text-sm font-medium">@{actorHandle}</span>
                </Link>
              );
            })}
            {aggregatedCount > canonicalActors.length && (
              <p className="text-center text-zinc-500 text-xs py-2">
                and {aggregatedCount - canonicalActors.length} more
              </p>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Posts drawer — shows all posts in a same-actor bundle */}
      <Drawer open={showPostsDrawer} onOpenChange={(open) => {
        if (!open) { drawerJustClosed.current = true; setTimeout(() => { drawerJustClosed.current = false; }, 300); }
        setShowPostsDrawer(open);
      }}>
        <DrawerContent data-notifications-page className="bg-black/60 backdrop-blur-[24px] border-white/10 max-h-[80vh]">
          <DrawerHeader className="text-center pb-2">
            <DrawerTitle className="text-white text-base">
              {notification.type === 'like' ? 'Liked posts' : notification.type === 'comment' ? 'Commented posts' : (notification.type as string) === 'repost' ? 'Reposted posts' : 'Posts'}
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 overflow-y-auto max-h-[65vh] space-y-4" data-vaul-no-drag>
            <NotificationPostCards tokenIds={bundle.allNotifications.map(n => n.tokenId).filter((id): id is number => id != null)} />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
});

export default function NotificationsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<NotificationTypeFilter>('all');
  const [notifTabTransition, setNotifTabTransition] = useState(false);
  const isDraggingRef = useRef(false);
  const { layerRef: notifTabLayerRef, setRef: setNotifTabRef, rect: notifTabRect, onScroll: onNotifTabScroll } = useTabIndicator(activeTab, undefined, isDraggingRef);

  // Swallow the notifications list at the sticky header bento's top edge under
  // the glass themes, exactly like the home feed cuts at its nav pill.
  const notifContentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(notifContentRef, '[data-feed-nav-outer] > [data-page-bento]');

  // Drag-to-swipe state
  const tabButtonPositions = useRef<Partial<Record<NotificationTypeFilter, HTMLElement | null>>>({});

  const { isDragging, indicatorRef, handleDragStart, handleDragMove, handleDragEnd } = useDragTabIndicator({
    tabRect: notifTabRect,
    tabLayerRef: notifTabLayerRef,
    tabButtonPositions,
    tabValues: tabs.map(t => t.value) as NotificationTypeFilter[],
    activeTab,
    onTabChange: setActiveTab,
    isDraggingRef,
  });

  const handleTabClick = useCallback((tab: NotificationTypeFilter) => {
    if (isDragging) return;
    setNotifTabTransition(true);
    setActiveTab(tab);
    setTimeout(() => setNotifTabTransition(false), 450);
  }, [isDragging]);
  const { isAuthenticated, walletAddress: pageWalletAddress } = useAuth();
  
  // Followers drawer state (opened inline from aggregated follow notifications)
  const [followDrawerOpen, setFollowDrawerOpen] = useState(false);
  
  // Listen for open-followers-drawer events from notification items
  useEffect(() => {
    const handler = () => setFollowDrawerOpen(true);
    window.addEventListener('open-followers-drawer', handler);
    return () => window.removeEventListener('open-followers-drawer', handler);
  }, []);
  
  // Notification preference toggles (local state for now)
  const [notificationPrefs, setNotificationPrefs] = useState({
    likes: true,
    comments: true,
    follows: true,
    tips: true,
    subscriptions: true,
    livestreams: true,
  });
  
  const queryClient = useQueryClient();
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
  
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [clearedAtTs, setClearedAtTs] = useState(() => {
    const stored = localStorage.getItem('notifications_cleared_at');
    return stored ? parseInt(stored, 10) : 0;
  });
  
  // Merge DeHub + custom notifications, sorted by date (memoized to prevent re-triggering enrichment)
  // Filter out notifications where the actor is the current user (e.g. backend sends DM notif to sender)
  const allNotifications = useMemo(
    () => {
      return [...dehubNotifications, ...customNotifications]
        .filter(n => {
          // Filter out notifications before the "clear all" timestamp
          if (clearedAtTs && new Date(n.createdAt).getTime() <= clearedAtTs) return false;
          // Filter out self-notifications
          if (!pageWalletAddress || !n.actorAddress) return true;
          return n.actorAddress.toLowerCase() !== pageWalletAddress.toLowerCase();
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    [dehubNotifications, customNotifications, pageWalletAddress, clearedAtTs]
  );
  
  // Batch-avatar enrichment for fresh profile pictures
  // Module-level caches persist across navigations to prevent avatar flashing
  const [enrichedAvatars, setEnrichedAvatars] = useState<Map<string, EnrichedAvatar>>(() => moduleAvatarCache);
  

  // Module-level caches persist across navigations — no clearing on mount

  useEffect(() => {
    if (!allNotifications.length) return;
    
    // Collect actor addresses
    const newAddresses = allNotifications
      .map(n => n.actorAddress?.toLowerCase())
      .filter((addr): addr is string => Boolean(addr) && !moduleEnrichedKeys.has(addr));
    
    // Also collect ALL usernames from latestActorNames (for aggregated notification avatars)
    const aggregatedActorUsernames = allNotifications
      .filter(n => (n as any).aggregatedCount > 1 && (n as any).latestActorNames?.length > 0)
      .flatMap(n => ((n as any).latestActorNames as string[]))
      .map(name => normalizeUsername(name))
      .filter((name): name is string => Boolean(name))
      .filter(name => {
        const cacheKey = toUsernameCacheKey(name);
        return cacheKey ? !moduleEnrichedKeys.has(cacheKey) : false;
      });
    
    const uniqueNewAddresses = [...new Set(newAddresses)];
    const uniqueNewUsernames = [...new Set(aggregatedActorUsernames)];
    
    if (uniqueNewAddresses.length === 0 && uniqueNewUsernames.length === 0) {
      return;
    }
    
    // Mark as in-flight immediately to prevent duplicate calls
    uniqueNewAddresses.forEach(addr => moduleEnrichedKeys.add(addr));
    uniqueNewUsernames.forEach(name => {
      const cacheKey = toUsernameCacheKey(name);
      if (cacheKey) moduleEnrichedKeys.add(cacheKey);
    });
    
    const addressFetches = uniqueNewAddresses.map(async (addr) => {
      try {
        const { getAccountInfo } = await import('@/lib/api/dehub');
        const { extractAvatarPath, buildAvatarUrl } = await import('@/lib/media-url');
        const user = await getAccountInfo(addr);
        const rawPath = extractAvatarPath(user);
        const avatarUrl = buildAvatarUrl(user.address || addr, rawPath);

        return {
          resolved: true,
          key: addr,
          info: {
            address: (user.address || addr).toLowerCase(),
            avatarUrl,
            username: user.username || null,
            displayName: user.displayName || null,
          } as EnrichedAvatar,
          extraKeys: [] as string[],
        };
      } catch {
        return {
          resolved: true,
          key: addr,
          info: {
            address: addr,
            avatarUrl: null,
            username: null,
            displayName: null,
          } as EnrichedAvatar,
          extraKeys: [] as string[],
        };
      }
    });
    
    const usernameFetches = uniqueNewUsernames.map(async (username) => {
      const attemptedKey = toUsernameCacheKey(username);

      try {
        const { getAccountByUsername } = await import('@/lib/api/dehub');
        const { extractAvatarPath, buildAvatarUrl } = await import('@/lib/media-url');
        const user = await getAccountByUsername(username);
        
        // Detect empty API result (200 OK but no real user data) and avoid caching pseudo identities
        if (!user._id && !user.address && !user.username) {
          return { resolved: false, attemptedKey };
        }

        const resolvedUsername = normalizeUsername(user.username || username);
        const inputKey = toUsernameCacheKey(username);
        const resolvedKey = toUsernameCacheKey(resolvedUsername);
        const addressKey = user.address?.toLowerCase() || null;
        const primaryKey = addressKey || inputKey;

        if (!primaryKey) {
          return { resolved: false, attemptedKey };
        }
        
        const rawPath = extractAvatarPath(user);
        const avatarUrl = user.address ? buildAvatarUrl(user.address, rawPath) : null;
        const info: EnrichedAvatar = {
          address: user.address?.toLowerCase() || null,
          avatarUrl,
          username: user.username || resolvedUsername || null,
          displayName: user.displayName || null,
        };

        const extraKeys = [inputKey, resolvedKey]
          .filter((k): k is string => Boolean(k) && k !== primaryKey);

        return {
          resolved: true,
          key: primaryKey,
          info,
          extraKeys,
        };
      } catch {
        return { resolved: false, attemptedKey };
      }
    });
    
    // Batched enrichment: the old per-fetch setState re-rendered this
    // 1700-line page once per resolved actor (~30 renders on first open,
    // each re-running the O(n²) bundling). Wait for ALL fetches, then apply
    // ONE state update with the whole batch.
    // No cancellation on effect re-run: the actor keys were already claimed in
    // moduleEnrichedKeys above, so discarding an in-flight batch would lose
    // those avatars for the whole session. Concurrent batches fetch disjoint
    // keys and merge via the functional setState, so applying all is safe
    // (this page lives in PersistentPageCache and never unmounts).
    const allFetches = [...addressFetches, ...usernameFetches];
    Promise.allSettled(allFetches).then((outcomes) => {
      const resolvedEntries: Array<{ key: string; info: EnrichedAvatar; extraKeys: string[] }> = [];
      for (const outcome of outcomes) {
        if (outcome.status !== 'fulfilled') continue;
        const value = outcome.value;
        if (!value?.resolved) {
          if ((value as any)?.attemptedKey) {
            moduleEnrichedKeys.delete((value as any).attemptedKey);
          }
          continue;
        }
        if (!value.key || !value.info) continue;
        resolvedEntries.push({
          key: value.key,
          info: value.info as EnrichedAvatar,
          extraKeys: (((value as any).extraKeys || []) as string[]).filter(Boolean),
        });
      }
      if (resolvedEntries.length === 0) return;

      setEnrichedAvatars(prev => {
        const next = new Map(prev);
        for (const entry of resolvedEntries) {
          next.set(entry.key, entry.info);
          moduleEnrichedKeys.add(entry.key);
          for (const ek of entry.extraKeys) {
            next.set(ek, entry.info);
            moduleEnrichedKeys.add(ek);
          }
        }
        // Sync to module-level cache
        moduleAvatarCache = next;
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

  const handleClearAllNotifications = async () => {
    setIsClearingAll(true);
    try {
      // Mark all as read first via API
      markAllAsRead.mutate(undefined);
      markAllCustomAsRead.mutate();
      
      // Also delete all custom notifications from DB so they don't reappear
      if (pageWalletAddress) {
        const { withWalletHeader } = await import('@/lib/supabase-wallet-client');
        await withWalletHeader(
          supabase
            .from('custom_notifications')
            .delete()
            .eq('recipient_address', pageWalletAddress.toLowerCase()),
          pageWalletAddress
        );
      }
      
      // Store the "cleared at" timestamp — all notifications before this will be hidden
      const now = Date.now();
      localStorage.setItem('notifications_cleared_at', String(now));
      
      // Update state to trigger memo recalculation
      setClearedAtTs(now);

      // Invalidate custom notification caches
      queryClient.invalidateQueries({ queryKey: ['custom-notifications'] });
      
      toast.success('All notifications cleared');
    } catch (error) {
      toast.error('Failed to clear notifications');
    } finally {
      setIsClearingAll(false);
    }
  };

  // useCallback: passed to every memoized NotificationItem row — a fresh
  // function per render would defeat the memo. mutate fns are stable.
  const handleMarkAsRead = useCallback((notificationId: string) => {
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
  }, [markCustomAsRead.mutate, markAsRead.mutate]);

  // Filter notifications by selected tab type
  const notifications = activeTab === 'all'
    ? allNotifications
    : allNotifications.filter(n => {
        const allowedTypes = filterTypeMap[activeTab];
        return allowedTypes ? allowedTypes.includes(n.type) : true;
      });

  // Bundling is O(n²) over ~130 rows; memoized so the avatar-enrichment
  // drip (one state update per resolved actor) doesn't recompute it every
  // render — it re-runs only when the list or avatar map actually changes.
  const bundledNotifications = useMemo(
    () => bundleNotifications(notifications.filter(n => n && n.id), enrichedAvatars),
    [notifications, enrichedAvatars]
  );

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
    // data-notifications-page scopes the light-mode remaps in index.css; the
    // portaled settings sheet / actors drawer carry the same attribute
    // (portals escape this subtree).
    <div data-notifications-page className="min-h-screen">
      <SEOHead title="Notifications — Stay Updated" description="Stay on top of likes, comments, follows, tips, mentions and more on DeHub. Never miss an interaction from your community." url="https://dehub.io/app/notifications" />
      <h1 className="sr-only">DeHub Notifications — Decentralised Social Media, Censorship Resistant & Freedom of Speech</h1>
      {/* Header */}
      <div data-feed-nav-outer className="sticky top-11 lg:top-0 bg-black z-50 px-2 pt-1 pb-0 sm:px-3 sm:pt-1 sm:pb-0 lg:pt-2">
        <div data-page-bento className="bg-zinc-900 rounded-2xl px-4 py-3">
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
                  data-notifications-page
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
                      onClick={handleClearAllNotifications}
                      disabled={isClearingAll || allNotifications.length === 0}
                      className="w-full flex items-center gap-3 p-4 rounded-xl bg-white/10 hover:bg-white/15 transition-colors disabled:opacity-50"
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                        {isClearingAll ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Trash2 className="w-5 h-5 text-white" />}
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
                      <label className="flex items-center justify-between p-4 rounded-xl bg-white/10 cursor-pointer">
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
                      </label>
                      
                      <label className="flex items-center justify-between p-4 rounded-xl bg-white/10 cursor-pointer">
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
                      </label>
                      
                      <label className="flex items-center justify-between p-4 rounded-xl bg-white/10 cursor-pointer">
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
                      </label>
                      
                      <label className="flex items-center justify-between p-4 rounded-xl bg-white/10 cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                            <Gem className="w-5 h-5 text-white" />
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
                      </label>
                      
                      <label className="flex items-center justify-between p-4 rounded-xl bg-white/10 cursor-pointer">
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
                      </label>
                      
                      <label className="flex items-center justify-between p-4 rounded-xl bg-white/10 cursor-pointer">
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
                      </label>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>

           {/* Tabs - merged into header bento */}
          <div className="mt-3 -mx-2" style={{ overflowX: 'clip', overflowClipMargin: '8px' }}>
            <div ref={notifTabLayerRef} className="relative overflow-visible">
              <GlassIndicator ref={indicatorRef} rect={notifTabRect} enableTransition={!isDragging && notifTabTransition} />
              {/* Drag handle overlay - sits on top of indicator for pointer capture */}
              {notifTabRect.ready && (
                <div
                  className="absolute z-30 cursor-grab active:cursor-grabbing"
                  style={{
                    transform: `translate(${notifTabRect.x}px, ${notifTabRect.y}px)`,
                    width: notifTabRect.width,
                    height: notifTabRect.height,
                  }}
                  onPointerDown={handleDragStart}
                  onPointerMove={handleDragMove}
                  onPointerUp={handleDragEnd}
                  onPointerCancel={handleDragEnd}
                />
              )}
              <div 
                className="relative z-20 flex gap-1 sm:gap-1.5 overflow-x-auto sm:overflow-x-visible overflow-y-visible scrollbar-hide whitespace-nowrap px-1 py-1"
                style={{ touchAction: 'pan-x' }}
                onScroll={onNotifTabScroll}
              >
                {tabs.map((tab) => {
                  const count = getTabCount(tab.value);
                  return (
                    <button
                      key={tab.value}
                      ref={(el) => {
                        setNotifTabRef(tab.value)(el);
                        tabButtonPositions.current[tab.value] = el;
                      }}
                      onClick={() => handleTabClick(tab.value)}
                      className={`relative z-40 flex-shrink-0 sm:flex-shrink sm:flex-1 w-[53px] h-[53px] sm:w-auto sm:h-auto sm:py-2.5 flex items-center justify-center rounded-xl transition-colors duration-200 ${
                        activeTab === tab.value
                          ? 'text-white'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <span className="relative z-10">
                        <tab.icon className={tab.value === 'reposts' ? 'w-[26.5px] h-[26.5px]' : 'w-[22.5px] h-[22.5px]'} />
                        {count > 0 && (
                          <span className={`absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1 flex items-center justify-center text-[10px] font-bold rounded-full leading-none transition-colors duration-200 ${
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
      <div ref={notifContentRef} className="px-2 sm:px-3 pt-2 pb-2">
        <div data-page-bento className="bg-zinc-900 rounded-2xl overflow-hidden">
          {isLoading ? (
            // Row skeletons that mirror the real list layout — a lone spinner
            // reads as "empty page" instead of "content on the way".
            <div className="divide-y divide-zinc-800">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-4 animate-pulse">
                  <div className="w-10 h-10 rounded-xl bg-zinc-800 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="h-3.5 w-2/3 bg-zinc-800 rounded mb-2" />
                    <div className="h-3 w-1/3 bg-zinc-800 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 flex flex-col items-center justify-center text-center">
              <Bell className="w-12 h-12 text-zinc-600 mb-4" />
              <h3 className="text-white font-semibold text-lg mb-2">{t('notifications.noNotificationsYet')}</h3>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {bundledNotifications.map((bundle, index) => (
                <NotificationItem
                  key={bundle.primary.id}
                  notification={bundle.primary}
                  bundle={bundle}
                  onMarkAsRead={handleMarkAsRead}
                  isMarkingAsRead={bundle.allIds.includes(markingNotificationId || '')}
                  enrichedAvatars={enrichedAvatars}
                  style={offscreenRowStyle(index)}
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
                    {t('notifications.loadMore')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Followers drawer - opened inline from aggregated follow notifications */}
      {pageWalletAddress && (
        <FollowersListDrawer
          open={followDrawerOpen}
          onOpenChange={setFollowDrawerOpen}
          profileAddress={pageWalletAddress}
          title="Followers"
        />
      )}
    </div>
  );
}
