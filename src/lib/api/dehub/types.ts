// Types based on DeHub API response (supports both API field naming conventions)
export interface DeHubUser {
  _id?: string;
  id?: string;
  address?: string;
  wallet_address?: string;
  username?: string | null;
  displayName?: string | null;
  display_name?: string;
  bio?: string;
  aboutMe?: string | null;
  avatarImageUrl?: string | null;
  avatarUrl?: string;
  avatar_url?: string;
  coverImageUrl?: string | null;
  coverUrl?: string;
  cover_url?: string;
  isVerified?: boolean;
  is_verified?: boolean;
  followers?: number | string[];
  follower_count?: number;
  followings?: string[];
  followingsList?: string[];
  followersList?: string[];
  following_count?: number;
  likes?: number | number[];
  uploads?: number;
  post_count?: number;
  sentTips?: number;
  receivedTips?: number;
  unlocked?: number[];
  isFollowing?: boolean;
  followsYou?: boolean;
  isPending?: boolean;
  isPrivate?: boolean;
  youBlocked?: boolean;
  blockedYou?: boolean;
  isBlocked?: boolean;
  balanceData?: Array<{
    chainId: number;
    tokenAddress: string;
    walletBalance: number;
    staked: number;
  }>;
  dmSettings?: {
    disables?: string[];
    minTipDhb?: number;
  };
  customs?: Record<string, unknown>;
  seenModal?: boolean;
  online?: boolean;
  staked?: number;
  badgeBalance?: number;
  createdAt?: string;
  created_at?: string;
  lastLoginTimestamp?: number;
}

export interface AuthResponse {
  status: boolean;
  token: string;
  user: DeHubUser;
  result: {
    address: string;
    isMobile: boolean;
    lastLoginTimestamp: number;
    tokenExpiry: string;
    isNewAccount?: boolean;
  };
  message: string;
}

export interface DeHubNFT {
  tokenId: number;
  id?: string;
  token_id?: string;
  name: string;
  title?: string;
  description?: string;
  imageUrl: string;
  imageUrls?: string[];
  videoUrl?: string;
  media_url?: string;
  thumbnail_url?: string;
  postType: "video" | "image" | "audio";
  media_type?: "video" | "image" | "audio";
  minter: string;
  mintername?: string;
  minterUsername?: string;
  minterDisplayName?: string;
  minterAvatarUrl?: string;
  creator?: DeHubUser;
  owner?: DeHubUser;
  views?: number;
  view_count?: number;
  commentCount?: number;
  comment_count?: number;
  totalVotes?: { for?: number; against?: number };
  likes?: number;
  dislikes?: number;
  like_count?: number;
  dislike_count?: number;
  videoDuration?: number;
  duration?: number;
  createdAt: string;
  created_at?: string;
  category?: string | string[];
  tags?: string[];
  is_live?: boolean;
  is_ppv?: boolean;
  ppv_price?: number;
  ppv_currency?: string;
  is_w2e?: boolean;
  is_locked?: boolean;
  locked_price?: number;
  locked_currency?: string;
  streamInfo?: {
    isLockContent?: boolean;
    lockContentAmount?: number;
    lockContentTokenSymbol?: string;
    isPayPerView?: boolean;
    payPerViewAmount?: number;
    isAddBounty?: boolean;
    addBountyFirstXViewers?: number | string;
    addBountyFirstXComments?: number | string;
    addBountyAmount?: number;
    addBountyTokenSymbol?: string;
    addBountyChainId?: number;
  };
  isLiked?: boolean;
  isDisliked?: boolean;
  isSaved?: boolean;
  isOwner?: boolean;
  isUnlocked?: boolean;
  minterUser?: DeHubUser;
  minterFollowers?: number;
  minterFollowings?: number;
  stream?: {
    streamId?: string;
    status?: string;
    isActive?: boolean;
    viewerCount?: number;
    title?: string;
    category?: string;
    streamKey?: string;
    playbackId?: string;
    startedAt?: string;
    endedAt?: string;
    scheduledFor?: string;
    peakViewers?: number;
    totalViews?: number;
    likes?: number;
    totalTips?: number;
    duration?: number;
    streamDelay?: number;
  };
  chainId?: number;
  mintTxHash?: string;
  status?: string;

  // Quote post / repost fields
  isQuotePost?: boolean;
  quotedTokenId?: number | null;
  quotedPost?: DeHubNFT | null;
  reposts?: number;
  totalReposts?: number;
  quotes?: number;

  // Moderation / visibility
  isHidden?: boolean;
  isDeleted?: boolean;

  // Pay-per-view
  ppvBuyerCount?: number;

  // Staking
  minterStaked?: number;
}

export interface DeHubComment {
  id: string;
  content: string;
  user: DeHubUser;
  created_at: string;
  like_count?: number;
  reply_count?: number;
  parent_id?: string;
}

export interface DeHubCategory {
  id: string;
  name: string;
  slug: string;
  icon_url?: string;
  nft_count?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export interface SearchNFTsParams {
  page?: number;
  unit?: number;
  category?: string;
  sortMode?: "new" | "popular" | "trending";
  creator_id?: string;
  postType?: string;
  search?: string;
  /** @deprecated Viewer context is now extracted from JWT Bearer token */
  address?: string;
  status?: "minted" | "signed" | "all" | "pending" | "failed";
}

export interface UniversalSearchParams {
  q: string;
  page?: number;
  unit?: number;
  type?: "accounts" | "videos" | "livestreams";
  postType?: string;
  /** @deprecated Viewer context is now extracted from JWT Bearer token */
  address?: string;
}

export interface SearchAccount {
  id: string;
  address: string;
  username: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  avatarImageUrl?: string;
  verified?: boolean;
  followerCount?: number;
  followingCount?: number;
}

export interface SearchLivestream {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  viewerCount?: number;
  streamer?: {
    address: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
  };
}

export interface UniversalSearchResponse {
  accounts?: SearchAccount[];
  videos?: DeHubNFT[];
  livestreams?: SearchLivestream[];
  total?: number;
  has_more?: boolean;
}

export interface SearchSuggestionsParams {
  q: string;
  limit?: number;
}

export interface SearchSuggestion {
  text: string;
  type: 'query' | 'account' | 'tag';
  data?: {
    address?: string;
    username?: string;
    avatarUrl?: string;
  };
}

export interface SearchLogParams {
  query: string;
  type?: 'accounts' | 'videos' | 'livestreams' | 'all';
  resultCount?: number;
  clicked?: boolean;
  clickedResultId?: string;
}
