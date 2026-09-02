/**
 * View Tracker
 * ============
 * Manages view recording for videos (single) and feed items (batch).
 * 
 * - Videos: Fire-and-forget after watching to a threshold, ONCE PER WATCH —
 *   a replay or a reopen is another view, the way it works on every other video
 *   platform. No local suppression; the API's 30-second per-viewer-per-post
 *   rate limit is what stops a reload loop.
 * - Feed items (images/posts): Batch after visibility duration, sent together
 * - Deduplication: 24-hour per-user-per-post via localStorage, feed items only
 *
 * Signed-out visitors count too. The DeHub API requires a valid JWT on its view
 * endpoints, so views from visitors with no session go to the `anon-views`
 * Supabase edge function instead, which dedupes by (device id + IP) per post per
 * UTC day. Each viewer only ever hits one of the two backends, so a person is
 * never counted twice.
 */

import { getAuthToken } from '@/lib/api/dehub';
import { recordAnonViews, recordAnonViewsBeacon } from '@/lib/anon-views-api';

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

  // Signed out: the DeHub API rejects unauthenticated view calls outright, so
  // route to the anonymous view backend instead of dropping the view.
  if (!token) {
    const result = await recordAnonViews([tokenId]);
    if (!result?.success) return null;
    // The anonymous backend reports how many views were new, not the post's
    // running totals, so there are no counts to hand back here.
    return { success: true, isNewView: result.recorded > 0, views: 0, totalImpressions: 0 };
  }

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

  // Signed out: send the same batch to the anonymous view backend.
  if (!token) {
    const result = await recordAnonViews(tokenIds.map(String));
    if (!result?.success) return null;
    return {
      success: true,
      processed: result.submitted,
      newUniqueViews: result.recorded,
      rateLimited: result.submitted - result.recorded,
    };
  }

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
   * @param loops - Whether the element replays itself. A wrap is not a watch.
   */
  updateProgress(tokenId: string, currentTime: number, duration: number, loops = false): void {
    // One view per watch, not one view ever. `watchedVideos` closes the current
    // watch so a single play fires once; `reset()` re-arms it, so a replay or a
    // fresh open of the same video is another view. The 24-hour localStorage
    // dedup that used to sit here is gone on purpose — it made the second watch
    // of a video invisible, which is not how a video's view count works
    // anywhere. What is left standing against a reload loop is the API's
    // 30-second per-viewer-per-post rate limit.

    // Playback has jumped back to the top after a real watch — a replay, in the
    // same mounted player. Re-arm, so pressing play again counts again.
    //
    // Not when the element loops. A loop wraps on its own, with nobody
    // deciding anything: a short left on screen wrapped every few seconds, each
    // wrap read as a replay, and the API's 30-second per-viewer limit turned
    // that into a view every 30 seconds for as long as the tab stayed open. A
    // phone put down on the desk was manufacturing view counts.
    //
    // A deliberate replay of a looping short is indistinguishable from a wrap,
    // so it counts once per mount there. Leaving and coming back is a fresh
    // mount and does count again.
    const priorProgress = this.watchProgress.get(tokenId) || 0;
    if (!loops && priorProgress > this.MIN_WATCH_SECONDS && currentTime < 1) {
      this.reset(tokenId);
    }

    if (this.watchedVideos.has(tokenId)) return;

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

    // Deliberately does NOT markAsViewed: that list is the feed tracker's
    // 24-hour suppression, and a video that counts every watch must not write
    // itself into it. The feed's own impression dedup is untouched.

    // Fire and forget - don't await
    recordSingleView(tokenId).then(result => {
      if (result?.success) {
        console.debug(`[ViewTracker] Video view recorded: ${tokenId}`, result);
      }
    });
  }
  
  /**
   * Reset tracking for a video (e.g., when unmounting, or on replay).
   *
   * Clears the fired flag as well as the progress, which is what makes the next
   * watch count. Leave the flag set and a rewatch inside the same page session
   * would be silently dropped by the client before the API ever saw it.
   */
  reset(tokenId: string): void {
    this.watchProgress.delete(tokenId);
    this.watchedVideos.delete(tokenId);
  }

  /**
   * Whether the CURRENT watch of this video has already counted.
   */
  hasViewed(tokenId: string): boolean {
    return this.watchedVideos.has(tokenId);
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
  
  /**
   * @param unloading - true when called from a page-unload or tab-hide handler.
   *   Signed-out batches then go out via sendBeacon, since a fetch started while
   *   the document is going away is usually cancelled before it lands.
   */
  private async flushBatch(unloading = false): Promise<void> {
    // Check items still visible
    this.checkVisibleItems();

    if (this.pendingViews.size === 0) return;

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

    // Signed out and the page is going away: hand the batch to the browser to
    // deliver after unload. Only fall through to a normal request if the beacon
    // could not be queued.
    if (unloading && !getAuthToken()) {
      if (recordAnonViewsBeacon(numericIds.map(String))) return;
    }

    const result = await recordBatchViews(numericIds);
    if (result?.success) {
      console.debug(`[ViewTracker] Batch views recorded:`, result);
    }
  }

  /**
   * Force flush all pending views (e.g., on page unload)
   */
  flush(unloading = false): void {
    this.flushBatch(unloading);
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
    feedViewTracker.flush(true);
  });

  // Also flush on visibility change (tab hidden)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      feedViewTracker.flush(true);
    }
  });
}
