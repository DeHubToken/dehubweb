/**
 * Lib Utilities Barrel Export
 * ============================
 * Re-exports all utility functions and helpers.
 * 
 * @module lib
 * @example
 * ```tsx
 * import { cn, getViewCount, generateFilterCSS } from '@/lib';
 * ```
 */

// Core utilities
export { cn } from './utils';

// Feed utilities
export { 
  shuffleArray, 
  formatCount, 
  formatDuration, 
  formatViews, 
  formatTimeAgo 
} from './feed-utils';

// Filter utilities
export { 
  generateFilterCSS, 
  getDefaultSettings, 
  blendWithPreset, 
  hasFilterApplied,
  applyFilterToImage 
} from './filters';

// Audio utilities
export { 
  generateWaveformFromBlob, 
  sliceAudioBlob, 
  formatTime,
  type WaveformData 
} from './audio-waveform';

// Markdown rendering
export { MarkdownText } from './markdown';

// Noise generation
export { SimplexNoise } from './simplex-noise';

// Watermark utilities
export { addWatermarkClient } from './watermark';

// Type guards
export {
  isTextPost,
  isVideoItem,
  isImagePost,
  isLiveStream,
  isShortVideo,
  isDefined,
  isNonEmptyString,
  isNonEmptyArray
} from './type-guards';
