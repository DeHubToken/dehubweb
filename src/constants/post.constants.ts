/**
 * Post Creation Constants
 * ========================
 * Centralized constants for the post creation feature.
 * 
 * @module constants/post
 */

/**
 * Media upload limits
 */
export const MEDIA_LIMITS = {
  /** Baseline maximum number of images per post; badges can raise this to 20. */
  MAX_IMAGES: 4,
  /** Maximum number of videos per post */
  MAX_VIDEOS: 1,
  /** Maximum number of audio files per post */
  MAX_AUDIO: 1,
  /** Maximum file size in bytes (100MB) */
  MAX_FILE_SIZE: 100 * 1024 * 1024,
  /** Safe upload ceiling while the server-provided badge allowance loads */
  BASE_MEDIA_UPLOAD_SIZE: 1024 * 1024 * 1024,
  /** Maximum video duration for shorts in seconds */
  SHORTS_MAX_DURATION: 90,
} as const;

/**
 * Blocked post IDs - these posts are filtered out from all feeds
 */
export const BLOCKED_POST_IDS: number[] = [
  2726,
];
