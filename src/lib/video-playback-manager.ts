/**
 * Video Playback Manager
 * ======================
 * Singleton that manages audio ownership across simultaneously playing videos.
 * Multiple videos can play at once (e.g. 2-column grid), but only ONE gets audio.
 * The first video to start playing owns audio; subsequent ones play muted.
 * When the audio owner stops, the next playing video (in registration order) inherits audio.
 */

type VideoInstance = {
  pause: () => void;
  mute: (muted: boolean) => void;
  id: string;
};

class VideoPlaybackManager {
  private static instance: VideoPlaybackManager;
  private activeVideos: Set<string> = new Set(); // currently playing video IDs
  private audioOwnerId: string | null = null;    // the one video allowed to have audio
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

  /**
   * Register a video instance with the manager.
   * Now requires a mute callback so the manager can force-mute non-owners.
   */
  register(id: string, pause: () => void, mute?: (muted: boolean) => void): void {
    this.registeredVideos.set(id, { id, pause, mute: mute ?? (() => {}) });
  }

  unregister(id: string): void {
    this.registeredVideos.delete(id);
    this.activeVideos.delete(id);
    if (this.audioOwnerId === id) {
      this.audioOwnerId = null;
      // Hand audio to next active video if any
      this.promoteNextAudioOwner();
    }
  }

  /**
   * Notify that a video has started playing.
   * Returns true if this video should play with audio (is the audio owner).
   */
  play(id: string): boolean {
    this.activeVideos.add(id);

    // First active video becomes audio owner
    if (!this.audioOwnerId || !this.activeVideos.has(this.audioOwnerId)) {
      this.audioOwnerId = id;
      return true; // this video owns audio
    }

    return this.audioOwnerId === id; // only true if already the owner
  }

  /**
   * Notify that a video has stopped playing.
   */
  stop(id: string): void {
    this.activeVideos.delete(id);
    if (this.audioOwnerId === id) {
      this.audioOwnerId = null;
      this.promoteNextAudioOwner();
    }
  }

  /**
   * Check if a specific video is the audio owner.
   */
  isAudioOwner(id: string): boolean {
    return this.audioOwnerId === id;
  }

  /**
   * Claim audio ownership for a specific video (e.g. user manually unmutes it).
   * Mutes the previous owner.
   */
  claimAudio(id: string): void {
    if (this.audioOwnerId && this.audioOwnerId !== id) {
      const prev = this.registeredVideos.get(this.audioOwnerId);
      if (prev) prev.mute(true);
    }
    this.audioOwnerId = id;
  }

  /**
   * Get the currently playing video ID (audio owner for backwards compat)
   */
  getCurrentlyPlayingId(): string | null {
    return this.audioOwnerId;
  }

  /** Promote the next active video to audio owner and unmute it */
  private promoteNextAudioOwner(): void {
    for (const activeId of this.activeVideos) {
      const video = this.registeredVideos.get(activeId);
      if (video) {
        this.audioOwnerId = activeId;
        if (!this._globalMuted) {
          video.mute(false);
        }
        return;
      }
    }
  }
}

export const videoPlaybackManager = VideoPlaybackManager.getInstance();
