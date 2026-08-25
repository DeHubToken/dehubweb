/**
 * Full account archive
 * ====================
 * The portable half of an export — follows, blocks, folders — is the part
 * another account can absorb. This is the other half: everything the account
 * actually holds, written down so a person can read it, keep it, or hand it to
 * a regulator. Nothing here is imported anywhere; it exists so "export my
 * data" means the whole account and not a subset of it.
 *
 * Two rules run through it:
 *
 * - **Every section is optional.** One dead endpoint must not cost the user
 *   the other eleven sections, so each collector catches its own failure and
 *   reports itself as failed in `meta.failed`. A partial archive with a list
 *   of what is missing beats a toast saying "export failed".
 * - **Ceilings, not database dumps.** Each list is paged to a hard ceiling.
 *   An account with 40,000 notifications should get a large file, not a tab
 *   that hangs for ten minutes.
 *
 * @module lib/data-archive
 */

import {
  getAccountInfo,
  getFollowList,
  getMyPosts,
  getUserComments,
  getLikedPosts,
  getWatchHistory,
  getNotifications,
  getConversations,
  getMessages,
  getDPayTransactions,
  fetchSessions,
  type DeHubNFT,
} from '@/lib/api/dehub';
// badges.ts is not in the barrel — importing it through '@/lib/api/dehub'
// resolves to nothing.
import { fetchMyDelegations } from '@/lib/api/dehub/badges';

/** Page size used for every paged read here. */
const PAGE = 100;

/** Hard ceilings, in pages of PAGE. */
const MAX_FOLLOWER_PAGES = 20;      // 2,000
const MAX_POST_PAGES = 20;          // 2,000
const MAX_COMMENT_PAGES = 20;       // 2,000
const MAX_LIKED_PAGES = 10;         // 1,000
const MAX_HISTORY_PAGES = 5;        // 500
const MAX_NOTIFICATION_PAGES = 5;   // 500
const MAX_TRANSACTION_PAGES = 10;   // 1,000
const MAX_CONVERSATIONS = 50;
const MAX_MESSAGE_PAGES = 5;        // 500 per conversation

/** Device-local settings worth carrying. Prefix match on localStorage keys. */
const LOCAL_PREF_PREFIXES = ['dehub', 'feed-', 'autoplay-', 'show-animations', 'shorts-', 'i18nextLng'];

export interface ArchivedPerson {
  address: string;
  username?: string;
  displayName?: string;
}

export interface ArchivedPost {
  tokenId: number;
  title: string;
  description?: string;
  postType?: string;
  createdAt?: string;
  mediaUrl?: string;
  views?: number;
  likes?: number;
  comments?: number;
  category?: string | string[];
  tags?: string[];
}

export interface ArchivedComment {
  id: string;
  tokenId: number;
  content: string;
  imageUrl?: string | null;
  createdAt?: string;
  likes?: number;
  dislikes?: number;
  parentId: number | null;
}

export interface ArchivedMessage {
  id: string;
  from: 'me' | 'other';
  sender?: string;
  content: string;
  type?: string;
  media?: string[];
  tipAmount?: number | null;
  tipSymbol?: string | null;
  createdAt?: string;
  editedAt?: string | null;
  deleted?: boolean;
}

export interface ArchivedConversation {
  id: string;
  isGroup?: boolean;
  title?: string;
  participants: ArchivedPerson[];
  createdAt?: string;
  messages: ArchivedMessage[];
  messagesTruncated: boolean;
}

export interface DeHubArchive {
  /** Which sections were collected, which were cut off, which failed. */
  meta: {
    collectedAt: string;
    failed: string[];
    truncated: string[];
  };
  profile: Record<string, unknown> | null;
  followers: ArchivedPerson[];
  posts: ArchivedPost[];
  comments: ArchivedComment[];
  likedPosts: ArchivedPost[];
  watchHistory: ArchivedPost[];
  notifications: unknown[];
  conversations: ArchivedConversation[];
  transactions: unknown[];
  sessions: unknown[];
  badgeDelegations: unknown;
  devicePreferences: Record<string, string>;
}

/**
 * Progress callback. Reports sections *finished*, not started — the sections
 * all launch at once, so "collecting notifications…" would flicker through
 * every name in one frame and then sit on whichever happened to be last.
 */
export type ArchiveStep = (done: number, total: number) => void;

/** Sections collected by {@link collectArchive}, in `meta` order. */
const SECTIONS = [
  'profile',
  'followers',
  'posts',
  'comments',
  'likedPosts',
  'watchHistory',
  'notifications',
  'conversations',
  'transactions',
  'sessions',
  'badgeDelegations',
] as const;

const lower = (value?: string | null) => (value ?? '').toLowerCase();

function toPerson(user: {
  address?: string;
  wallet_address?: string;
  username?: string | null;
  displayName?: string | null;
} | null | undefined): ArchivedPerson {
  return {
    address: lower(user?.address || user?.wallet_address),
    username: user?.username ?? undefined,
    displayName: user?.displayName ?? undefined,
  };
}

function toPost(nft: DeHubNFT): ArchivedPost {
  return {
    tokenId: Number(nft.tokenId),
    title: nft.title || nft.name || '',
    description: nft.description,
    postType: nft.postType || nft.media_type,
    createdAt: nft.createdAt || nft.created_at,
    mediaUrl: nft.videoUrl || nft.imageUrl || nft.media_url,
    views: nft.totalViews ?? nft.views ?? nft.view_count,
    likes: nft.likes ?? nft.like_count,
    comments: nft.commentCount ?? nft.comment_count,
    category: nft.category,
    tags: nft.tags,
  };
}

/**
 * Walk a paged endpoint to a ceiling.
 *
 * `hitCeiling` matters as much as the rows: a caller that stops at page 20 has
 * to be able to say so, otherwise a truncated archive reads as a complete one.
 */
async function paged<T>(
  maxPages: number,
  read: (page: number) => Promise<{ items: T[]; hasMore: boolean }>,
  firstPage = 1,
): Promise<{ items: T[]; hitCeiling: boolean }> {
  const out: T[] = [];
  let hasMore = false;
  for (let i = 0; i < maxPages; i++) {
    const res = await read(firstPage + i);
    out.push(...res.items);
    hasMore = res.hasMore;
    if (!hasMore) break;
  }
  return { items: out, hitCeiling: hasMore };
}

/** Everything under a DeHub-owned localStorage key, as strings. */
function readDevicePreferences(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (!LOCAL_PREF_PREFIXES.some(prefix => key.startsWith(prefix))) continue;
      // Session material is not a preference and has no business in a file
      // the user is about to email to themselves.
      if (/token|secret|password|wallet|private|mnemonic|keystore|session/i.test(key)) continue;
      const value = localStorage.getItem(key);
      if (value !== null && value.length <= 20_000) out[key] = value;
    }
  } catch {
    // Storage disabled — an empty section, not a failed export.
  }
  return out;
}

async function collectConversations(): Promise<{ items: ArchivedConversation[]; hitCeiling: boolean }> {
  const { items: convos } = await getConversations(0, MAX_CONVERSATIONS);
  const out: ArchivedConversation[] = [];
  for (const convo of convos.slice(0, MAX_CONVERSATIONS)) {
    const messages: ArchivedMessage[] = [];
    let truncated = false;
    try {
      // /api/dm/messages is 0-based.
      const res = await paged<ArchivedMessage>(
        MAX_MESSAGE_PAGES,
        async page => {
          const batch = await getMessages(convo.id, page, PAGE);
          return {
            items: (batch.items ?? []).map(message => ({
              id: message._id,
              from: message.author,
              sender: lower(message.sender?.address),
              content: message.isDeleted ? '' : message.content,
              type: message.msgType,
              media: (message.mediaUrls ?? []).map(media => media.url),
              tipAmount: message.tipAmount,
              tipSymbol: message.tipSymbol,
              createdAt: message.createdAt,
              editedAt: message.editedAt,
              deleted: message.isDeleted,
            })),
            hasMore: batch.hasMore,
          };
        },
        0,
      );
      messages.push(...res.items);
      truncated = res.hitCeiling;
    } catch {
      // A conversation that will not open still belongs in the list.
      truncated = true;
    }
    out.push({
      id: convo.id,
      isGroup: convo.isGroup,
      title: convo.groupInfo?.name ?? convo.otherUser?.username ?? undefined,
      participants: (convo.participants ?? []).map(toPerson),
      createdAt: convo.createdAt,
      messages,
      messagesTruncated: truncated,
    });
  }
  return { items: out, hitCeiling: convos.length >= MAX_CONVERSATIONS };
}

/**
 * Build the archive.
 *
 * Sections run in parallel — one slow endpoint should not serialise the rest —
 * and each one records its own failure rather than throwing.
 */
export async function collectArchive(address: string, onStep?: ArchiveStep): Promise<DeHubArchive> {
  const self = lower(address);
  const failed: string[] = [];
  const truncated: string[] = [];
  let done = 0;

  /** Run one section, and never let it take the archive down with it. */
  async function section<T>(name: string, fallback: T, run: () => Promise<{ value: T; cut?: boolean }>): Promise<T> {
    try {
      const { value, cut } = await run();
      if (cut) truncated.push(name);
      return value;
    } catch (error) {
      console.warn(`[archive] ${name} failed`, error);
      failed.push(name);
      return fallback;
    } finally {
      onStep?.(++done, SECTIONS.length);
    }
  }

  const [
    profile,
    followers,
    posts,
    comments,
    likedPosts,
    watchHistory,
    notifications,
    conversations,
    transactions,
    sessions,
    badgeDelegations,
  ] = await Promise.all([
    section<Record<string, unknown> | null>('profile', null, async () => ({
      value: (await getAccountInfo(self, self)) as unknown as Record<string, unknown>,
    })),

    section<ArchivedPerson[]>('followers', [], async () => {
      const res = await paged<ArchivedPerson>(MAX_FOLLOWER_PAGES, async page => {
        const { items, pagination } = await getFollowList(self, 'followers', { page, limit: PAGE });
        return { items: items.map(toPerson), hasMore: !!pagination?.hasMore };
      });
      return { value: res.items, cut: res.hitCeiling };
    }),

    section<ArchivedPost[]>('posts', [], async () => {
      const res = await paged<ArchivedPost>(MAX_POST_PAGES, async page => {
        const { result, pagination } = await getMyPosts(page, PAGE);
        const items = result ?? [];
        return { items: items.map(toPost), hasMore: pagination?.hasMore ?? items.length >= PAGE };
      });
      return { value: res.items, cut: res.hitCeiling };
    }),

    section<ArchivedComment[]>('comments', [], async () => {
      const res = await paged<ArchivedComment>(MAX_COMMENT_PAGES, async page => {
        const batch = await getUserComments(self, page, PAGE);
        const items = batch.data ?? [];
        return {
          items: items.map(comment => ({
            id: comment.id,
            tokenId: comment.tokenId,
            content: comment.content,
            imageUrl: comment.imageUrl,
            createdAt: comment.createdAt,
            likes: comment.likeCount,
            dislikes: comment.dislikeCount,
            parentId: comment.parentId,
          })),
          hasMore: batch.has_more ?? items.length >= PAGE,
        };
      });
      return { value: res.items, cut: res.hitCeiling };
    }),

    section<ArchivedPost[]>('likedPosts', [], async () => {
      const res = await paged<ArchivedPost>(MAX_LIKED_PAGES, async page => {
        const { result, pagination } = await getLikedPosts(page, PAGE);
        const items = result ?? [];
        return { items: items.map(toPost), hasMore: pagination?.hasMore ?? items.length >= PAGE };
      });
      return { value: res.items, cut: res.hitCeiling };
    }),

    section<ArchivedPost[]>('watchHistory', [], async () => {
      // getWatchHistory takes a 0-based page and reports no pagination, so a
      // short page is the only end-of-list signal there is.
      const res = await paged<ArchivedPost>(
        MAX_HISTORY_PAGES,
        async page => {
          const { result } = await getWatchHistory(page, PAGE);
          const items = result ?? [];
          return { items: items.map(toPost), hasMore: items.length >= PAGE };
        },
        0,
      );
      return { value: res.items, cut: res.hitCeiling };
    }),

    section<unknown[]>('notifications', [], async () => {
      const res = await paged<unknown>(MAX_NOTIFICATION_PAGES, async page => {
        const batch = await getNotifications(page, PAGE);
        return { items: batch.items ?? [], hasMore: !!batch.hasMore };
      });
      return { value: res.items, cut: res.hitCeiling };
    }),

    section<ArchivedConversation[]>('conversations', [], async () => {
      const res = await collectConversations();
      return { value: res.items, cut: res.hitCeiling };
    }),

    section<unknown[]>('transactions', [], async () => {
      const res = await paged<unknown>(MAX_TRANSACTION_PAGES, async page => {
        const batch = await getDPayTransactions({ page, limit: PAGE });
        return { items: batch.transactions ?? [], hasMore: !!batch.hasMore };
      });
      return { value: res.items, cut: res.hitCeiling };
    }),

    section<unknown[]>('sessions', [], async () => ({ value: await fetchSessions() })),

    section<unknown>('badgeDelegations', null, async () => ({ value: await fetchMyDelegations() })),
  ]);

  return {
    meta: { collectedAt: new Date().toISOString(), failed, truncated },
    profile,
    followers,
    posts,
    comments,
    likedPosts,
    watchHistory,
    notifications,
    conversations,
    transactions,
    sessions,
    badgeDelegations,
    devicePreferences: readDevicePreferences(),
  };
}
