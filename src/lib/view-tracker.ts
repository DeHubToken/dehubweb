/**
 * View Tracker
 * ============
 * Manages view recording for videos (single) and feed items (batch).
 * 
 * - Videos: Fire-and-forget after watching to a threshold
 * - Feed items (images/posts): Batch after visibility duration, sent together
 * - Deduplication: 24-hour per-user-per-post via localStorage
 * - Only logged-in users can record views
 */

import { getAuthToken } from '@/lib/api/dehub';

const DEHUB_API_BASE = "https://api.dehub.io";
const VIEWED_STORAGE_KEY = 'dehub_viewed_posts';
const VIEW_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Batch configuration
const BATCH_INTERVAL_MS = 5000; // Send batch every 5 seconds
const MIN_VISIBILITY_MS = 2000; // Post must be visible for 2 seconds to count
const MAX_BATCH_SIZE = 50; // API limit

// ============================================================================
// TYPES
// ============================================================================

interface ViewedRecord {
  tokenId: string;
  timestamp: number;
}

interface BatchViewResponse {
  success: boolean;
  processed: number;
  newUniqueViews: number;
  rateLimited: number;
}

interface SingleViewResponse {
  success: boolean;
  isNewView: boolean;
  views: number;
  totalImpressions: number;
}

// ============================================================================
// LOCAL STORAGE HELPERS
// ============================================================================

function getViewedPosts(): ViewedRecord[] {
  try {
    const data = localStorage.getItem(VIEWED_STORAGE_KEY);
    if (!data) return [];
    
    const records: ViewedRecord[] = JSON.parse(data);
    const now = Date.now();
    
    // Filter out expired records (older than 24 hours)
    return records.filter(r => now - r.timestamp < VIEW_EXPIRY_MS);
  } catch {
    return [];
  }
}

function saveViewedPosts(records: ViewedRecord[]): void {
  try {
    localStorage.setItem(VIEWED_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Storage full or unavailable - silently fail
  }
}

function hasBeenViewed(tokenId: string): boolean {
  const records = getViewedPosts();
  return records.some(r => r.tokenId === tokenId);
}

function markAsViewed(tokenIds: string[]): void {
  const records = getViewedPosts();
  const now = Date.now();
  
  for (const tokenId of tokenIds) {
    if (!records.some(r => r.tokenId === tokenId)) {
      records.push({ tokenId, timestamp: now });
    }
  }
  
  saveViewedPosts(records);
}

// ============================================================================
// API CALLS
// ============================================================================

async function recordSingleView(tokenId: string): Promise<SingleViewResponse | null> {
  const token = getAuthToken();
  if (!token) return null; // Not logged in
  
  try {
    const response = await fetch(`${DEHUB_API_BASE}/api/record-view/${tokenId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      if (response.status === 429) {
        console.debug(`[ViewTracker] Rate limited for token ${tokenId}`);
      }
      return null;
    }
    
    return response.json();
  } catch (error) {
    console.error('[ViewTracker] Single view error:', error);
    return null;
  }
}

async function recordBatchViews(tokenIds: number[]): Promise<BatchViewResponse | null> {
  const token = getAuthToken();
  if (!token) return null; // Not logged in
  
  try {
    const response = await fetch(`${DEHUB_API_BASE}/api/view/batch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ tokenIds }),
    });
    
    if (!response.ok) {
      console.error('[ViewTracker] Batch view error:', response.status);
      return null;
    }
    
    return response.json();
  } catch (error) {
    console.error('[ViewTracker] Batch view error:', error);
    return null;
  }
}

// ============================================================================
// VIDEO VIEW TRACKER (Single, Fire-and-Forget)
// ============================================================================

/**
 * Track video view progress and fire view once watch threshold is met.
 * Call this on timeupdate events.
 */
class VideoViewTracker {
  private watchedVideos = new Set<string>();
  private watchProgress = new Map<string, number>(); // tokenId -> seconds watched
  
  private readonly WATCH_THRESHOLD_PERCENT = 0.1; // 10% of video
  private readonly MIN_WATCH_SECONDS = 3; // At least 3 seconds
  
  /**
   * Update watch progress for a video
   * @param tokenId - The video token ID
   * @param currentTime - Current playback time in seconds
   * @param duration - Total video duration in seconds
   */
  updateProgress(tokenId: string, currentTime: number, duration: number): void {
    // Already sent view for this video
    if (this.watchedVideos.has(tokenId)) return;
    
    // Already viewed in last 24h
    if (hasBeenViewed(tokenId)) {
      this.watchedVideos.add(tokenId);
      return;
    }
    
    // Track cumulative watch time
    const previousTime = this.watchProgress.get(tokenId) || 0;
    if (currentTime > previousTime) {
      this.watchProgress.set(tokenId, currentTime);
    }
    
    const watchedTime = this.watchProgress.get(tokenId) || 0;
    const thresholdSeconds = Math.max(
      this.MIN_WATCH_SECONDS,
      duration * this.WATCH_THRESHOLD_PERCENT
    );
    
    // Check if threshold met
    if (watchedTime >= thresholdSeconds) {
      this.fireView(tokenId);
    }
  }
  
  private fireView(tokenId: string): void {
    this.watchedVideos.add(tokenId);
    markAsViewed([tokenId]);
    
    // Fire and forget - don't await
    recordSingleView(tokenId).then(result => {
      if (result?.success) {
        console.debug(`[ViewTracker] Video view recorded: ${tokenId}`, result);
      }
    });
  }
  
  /**
   * Reset tracking for a video (e.g., when unmounting)
   */
  reset(tokenId: string): void {
    this.watchProgress.delete(tokenId);
  }
  
  /**
   * Check if a video has already been viewed this session
   */
  hasViewed(tokenId: string): boolean {
    return this.watchedVideos.has(tokenId) || hasBeenViewed(tokenId);
  }
}

// ============================================================================
// FEED VIEW TRACKER (Batch, Visibility-Based)
// ============================================================================

/**
 * Tracks visibility of feed items and sends batch view requests.
 * Items must be visible for MIN_VISIBILITY_MS before being queued.
 */
class FeedViewTracker {
  private visibilityStart = new Map<string, number>(); // tokenId -> timestamp when became visible
  private pendingViews = new Set<string>(); // tokenIds ready to be sent
  private batchTimer: NodeJS.Timeout | null = null;
  private alreadySent = new Set<string>(); // Session-level dedup
  
  constructor() {
    // Start the batch interval
    this.startBatchInterval();
  }
  
  private startBatchInterval(): void {
    if (this.batchTimer) return;
    
    this.batchTimer = setInterval(() => {
      this.flushBatch();
    }, BATCH_INTERVAL_MS);
  }
  
  /**
   * Mark an item as visible (call when item enters viewport)
   */
  onVisible(tokenId: string): void {
    // Skip if already sent or pending
    if (this.alreadySent.has(tokenId) || hasBeenViewed(tokenId)) return;
    
    if (!this.visibilityStart.has(tokenId)) {
      this.visibilityStart.set(tokenId, Date.now());
    }
  }
  
  /**
   * Mark an item as hidden (call when item leaves viewport)
   */
  onHidden(tokenId: string): void {
    const startTime = this.visibilityStart.get(tokenId);
    if (startTime) {
      const visibleDuration = Date.now() - startTime;
      
      // If visible long enough, queue for batch
      if (visibleDuration >= MIN_VISIBILITY_MS) {
        if (!this.alreadySent.has(tokenId) && !hasBeenViewed(tokenId)) {
          this.pendingViews.add(tokenId);
        }
      }
    }
    
    this.visibilityStart.delete(tokenId);
  }
  
  /**
   * Check currently visible items and queue those that have been visible long enough
   */
  checkVisibleItems(): void {
    const now = Date.now();
    
    for (const [tokenId, startTime] of this.visibilityStart) {
      const visibleDuration = now - startTime;
      
      if (visibleDuration >= MIN_VISIBILITY_MS) {
        if (!this.alreadySent.has(tokenId) && !hasBeenViewed(tokenId)) {
          this.pendingViews.add(tokenId);
        }
      }
    }
  }
  
  private async flushBatch(): Promise<void> {
    // Check items still visible
    this.checkVisibleItems();
    
    if (this.pendingViews.size === 0) return;
    
    // Not logged in - clear pending and skip
    if (!getAuthToken()) {
      this.pendingViews.clear();
      return;
    }
    
    // Take up to MAX_BATCH_SIZE items
    const tokenIds = Array.from(this.pendingViews).slice(0, MAX_BATCH_SIZE);
    
    // Remove from pending
    for (const id of tokenIds) {
      this.pendingViews.delete(id);
      this.alreadySent.add(id);
    }
    
    // Mark as viewed locally
    markAsViewed(tokenIds);
    
    // Send batch request
    const numericIds = tokenIds.map(id => parseInt(id, 10)).filter(n => !isNaN(n));
    
    if (numericIds.length === 0) return;
    
    const result = await recordBatchViews(numericIds);
    if (result?.success) {
      console.debug(`[ViewTracker] Batch views recorded:`, result);
    }
  }
  
  /**
   * Force flush all pending views (e.g., on page unload)
   */
  flush(): void {
    this.flushBatch();
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }
}

// ============================================================================
// SINGLETON INSTANCES
// ============================================================================

export const videoViewTracker = new VideoViewTracker();
export const feedViewTracker = new FeedViewTracker();

// Flush on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    feedViewTracker.flush();
  });
  
  // Also flush on visibility change (tab hidden)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      feedViewTracker.flush();
    }
  });
}
