/**
 * Video Playback Manager
 * ======================
 * Singleton that ensures only one video plays at a time across the app.
 * Videos register/unregister themselves and the manager handles pausing
 * when a new video starts playing.
 */

type VideoInstance = {
  pause: () => void;
  id: string;
};

class VideoPlaybackManager {
  private static instance: VideoPlaybackManager;
  private currentlyPlaying: VideoInstance | null = null;
  private registeredVideos: Map<string, VideoInstance> = new Map();
  private _globalMuted: boolean = true; // Start muted by default

  private constructor() {}

  static getInstance(): VideoPlaybackManager {
    if (!VideoPlaybackManager.instance) {
      VideoPlaybackManager.instance = new VideoPlaybackManager();
    }
    return VideoPlaybackManager.instance;
  }

  /**
   * Get the global mute preference
   */
  get globalMuted(): boolean {
    return this._globalMuted;
  }

  /**
   * Set the global mute preference (persists for all future videos)
   */
  set globalMuted(muted: boolean) {
    this._globalMuted = muted;
  }

  /**
   * Register a video instance with the manager
   */
  register(id: string, pause: () => void): void {
    this.registeredVideos.set(id, { id, pause });
  }

  /**
   * Unregister a video instance when unmounting
   */
  unregister(id: string): void {
    this.registeredVideos.delete(id);
    if (this.currentlyPlaying?.id === id) {
      this.currentlyPlaying = null;
    }
  }

  /**
   * Notify that a video has started playing.
   * Pauses any other currently playing video.
   */
  play(id: string): void {
    // Pause the current video if different
    if (this.currentlyPlaying && this.currentlyPlaying.id !== id) {
      this.currentlyPlaying.pause();
    }
    
    const video = this.registeredVideos.get(id);
    if (video) {
      this.currentlyPlaying = video;
    }
  }

  /**
   * Notify that a video has stopped playing
   */
  stop(id: string): void {
    if (this.currentlyPlaying?.id === id) {
      this.currentlyPlaying = null;
    }
  }

  /**
   * Get the currently playing video ID
   */
  getCurrentlyPlayingId(): string | null {
    return this.currentlyPlaying?.id ?? null;
  }
}

export const videoPlaybackManager = VideoPlaybackManager.getInstance();
