/**
 * Video Playback Manager
 * ======================
 * Singleton that ensures only one video plays at a time across the app
 * (exclusive mode) OR allows multiple feed videos to play simultaneously
 * (feed mode). Videos register/unregister themselves.
 */

type VideoInstance = {
  pause: () => void;
  id: string;
};

class VideoPlaybackManager {
  private static instance: VideoPlaybackManager;
  private activePlaying: Set<string> = new Set();
  private registeredVideos: Map<string, VideoInstance> = new Map();
  private _globalMuted: boolean = true; // Start muted by default

  private constructor() {}

  static getInstance(): VideoPlaybackManager {
    if (!VideoPlaybackManager.instance) {
      VideoPlaybackManager.instance = new VideoPlaybackManager();
    }
    return VideoPlaybackManager.instance;
  }

  get globalMuted(): boolean {
    return this._globalMuted;
  }

  set globalMuted(muted: boolean) {
    this._globalMuted = muted;
  }

  register(id: string, pause: () => void): void {
    this.registeredVideos.set(id, { id, pause });
  }

  unregister(id: string): void {
    this.registeredVideos.delete(id);
    this.activePlaying.delete(id);
  }

  /**
   * Exclusive play — pauses ALL other videos, then marks this one active.
   * Use for manual user clicks, TV player, dedicated video pages.
   */
  play(id: string): void {
    // Pause every other active video
    for (const activeId of this.activePlaying) {
      if (activeId !== id) {
        const video = this.registeredVideos.get(activeId);
        video?.pause();
      }
    }
    this.activePlaying.clear();
    this.activePlaying.add(id);
  }

  /**
   * Feed play — marks as active WITHOUT pausing others.
   * Use for autoplay in scrollable feed/grid where multiple videos can be visible.
   */
  playInFeed(id: string): void {
    this.activePlaying.add(id);
  }

  stop(id: string): void {
    this.activePlaying.delete(id);
  }

  stopAll(): void {
    for (const activeId of this.activePlaying) {
      const video = this.registeredVideos.get(activeId);
      video?.pause();
    }
    this.activePlaying.clear();
  }

  getCurrentlyPlayingId(): string | null {
    // Return first active for backward compat
    const first = this.activePlaying.values().next();
    return first.done ? null : first.value;
  }

  isActive(id: string): boolean {
    return this.activePlaying.has(id);
  }
}

export const videoPlaybackManager = VideoPlaybackManager.getInstance();
