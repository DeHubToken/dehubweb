/**
 * Hooks Barrel Export
 * ====================
 * Re-exports all custom React hooks for clean imports.
 * 
 * @module hooks
 * @example
 * ```tsx
 * import { useIsMobile, useToast, useGlitchEffect } from '@/hooks';
 * ```
 */

// useAudioAnalyser removed - was unused
export { useDebouncedValue } from './use-debounced-value';
export { useDeHubFeed, useDeHubVideos, useDeHubImages, useDeHubLive, mapNFTToVideoItem, mapNFTToImagePost } from './use-dehub-feed';
export { useUnifiedFeed, mapToVideoItem, mapToImagePost, mapToTextPost, type UnifiedFeedItem, type UnifiedFeedParams } from './use-unified-feed';
export { useDeHubProfile, useDeHubUserContent, separateUserContent, mapUserToProfile, type ProfileData } from './use-dehub-profile';
export { useProfileAvatar, useAvatarPrefetch, useCachedAvatar, useInvalidateAvatar } from './use-profile-avatar-cache';
export { 
  useDeHubSearch,
  useSearchSuggestions,
  useSearchAnalytics,
  getTypeForTab,
  getPostTypeForTab, 
  extractUniqueCreators, 
  mapAccountToCreator,
  flattenSearchAccounts,
  flattenSearchVideos,
  flattenSearchLivestreams,
  flattenSearchResults,
  mapNFTsToContent,
  type SearchCreator,
  type UseDeHubSearchOptions,
  type SearchPageResult,
} from './use-dehub-search';
export { useSearchHistory, type SearchHistoryItem } from './use-search-history';
export { useDeHubUserSearch, mapUserToSearchCreator } from './use-dehub-user-search';
export { useGlitchEffect } from './use-glitch-effect';
export { GlobalDropZoneProvider, useGlobalDropZone } from './use-global-drop-zone';
export { useFeedPrefetch, clearPrefetchState } from './use-feed-prefetch';
export { usePullToRefresh } from './use-pull-to-refresh';

export { useIsMobile } from './use-mobile';
export { useIsTouchDevice } from './use-touch-device';
export { useUserLanguage } from './use-user-language';
export { useVideoViewTracking, useFeedViewTracking, useFeedViewTrackingCallback } from './use-view-tracking';
export { useVoiceChat } from './use-voice-chat';
export { RadioPlayerProvider, useRadioPlayer } from './use-radio-player';
export { TVPlayerProvider, useTVPlayer } from './use-tv-player';
export { useScrollRestoration, useIsBackNavigation } from './use-scroll-restoration';
export { 
  useConversations, 
  useMessages, 
  useSendMessage, 
  useCreateConversation, 
  useDeleteConversation, 
  useUserSearchForDM,
  useTotalUnreadCount,
  messagesKeys,
} from './use-messages';
export { useReauthHandler } from './use-reauth-handler';
export { useStoryReactions } from './use-story-reactions';
export { useStoryViews } from './use-story-views';
export { useStoryComments, type StoryComment } from './use-story-comments';
