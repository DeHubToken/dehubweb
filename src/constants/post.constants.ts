/**
 * Post Creation Constants
 * ========================
 * Centralized constants for the post creation feature.
 * 
 * @module constants/post
 */

/**
 * LocalStorage key for storing drafts
 */
export const DRAFTS_STORAGE_KEY = 'post_drafts';

/**
 * Media upload limits
 */
export const MEDIA_LIMITS = {
  /** Maximum number of images per post */
  MAX_IMAGES: 4,
  /** Maximum number of videos per post */
  MAX_VIDEOS: 1,
  /** Maximum number of audio files per post */
  MAX_AUDIO: 1,
  /** Maximum file size in bytes (100MB) */
  MAX_FILE_SIZE: 100 * 1024 * 1024,
  /** Maximum video duration for shorts in seconds */
  SHORTS_MAX_DURATION: 90,
} as const;

/**
 * Supported file types
 */
export const SUPPORTED_FILE_TYPES = {
  IMAGES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  VIDEOS: ['video/mp4', 'video/webm', 'video/quicktime'],
  AUDIO: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3'],
} as const;

/**
 * Toast messages for post actions
 */
export const POST_TOAST_MESSAGES = {
  SUCCESS: {
    POSTED: 'Your post has been published!',
    SCHEDULED: 'Your post has been scheduled!',
    DRAFT_SAVED: 'Draft saved successfully',
    DRAFT_DELETED: 'Draft deleted',
    DRAFT_LOADED: 'Draft loaded',
    ENHANCED: 'Text enhanced with AI',
  },
  ERROR: {
    ENHANCE_FAILED: 'Failed to enhance text. Please try again.',
    MAX_IMAGES: `Maximum ${4} images allowed`,
    MAX_VIDEOS: 'Only one video per post is allowed',
    INVALID_FILE: 'Invalid file type',
    PROCESSING_FAILED: 'Failed to process file',
  },
  INFO: {
    PROCESSING: 'Processing your media...',
    UPLOADING: 'Uploading...',
  },
} as const;

/**
 * Post destination labels
 */
export const POST_DESTINATIONS = {
  HOME: 'Home',
  IMAGES: 'Images',
  VIDEOS: 'Videos',
  SHORTS: 'Shorts',
  MUSIC: 'Music',
  LIVE: 'Live',
  PPV: 'PPV',
} as const;

/**
 * Default PPV/W2E values
 */
export const MONETIZATION_DEFAULTS = {
  PPV_MIN_AMOUNT: 0.99,
  PPV_MAX_AMOUNT: 999.99,
  W2E_MIN_VIEWS: 1,
  W2E_MIN_COMMENTS: 0,
} as const;

/**
 * Blocked post IDs - these posts are filtered out from all feeds
 */
export const BLOCKED_POST_IDS: number[] = [
  2726,
];
