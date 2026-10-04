import { getVideoPreferences, setMediaMuted } from './video-preferences';
import { visualActivity } from './visual-activity';
import { isVideoInPictureInPicture } from './picture-in-picture';
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
  /** Whether this video is the one on screen; only such a video is handed the sound. */
  isProminent: () => boolean;
  element?: () => HTMLVideoElement | null;
};

class VideoPlaybackManager {
  private static instance: VideoPlaybackManager;
  private activeVideos: Set<string> = new Set(); // currently playing video IDs
  private audioOwnerId: string | null = null;    // the one video allowed to have audio
  private registeredVideos: Map<string, VideoInstance> = new Map();
  private _globalMuted: boolean = getVideoPreferences().mediaMuted ?? true;

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
    setMediaMuted(muted);
  }

  /**
   * Register a video instance with the manager.
   * Now requires a mute callback so the manager can force-mute non-owners.
   */
  register(id: string, pause: () => void, mute?: (muted: boolean) => void, isProminent?: () => boolean, element?: () => HTMLVideoElement | null): void {
    this.registeredVideos.set(id, { id, pause, mute: mute ?? (() => {}), isProminent: isProminent ?? (() => true), element });
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
    if (visualActivity.isCallBusy()) {
      this.registeredVideos.get(id)?.pause();
      return false;
    }
    this.activeVideos.add(id);

    // First active video becomes audio owner
    if (!this.audioOwnerId || !this.activeVideos.has(this.audioOwnerId)) {
      this.audioOwnerId = id;
      return true; // this video owns audio
    }

    return this.audioOwnerId === id; // only true if already the owner
  }

  /**
   * A video started playing without asking for the sound — an autoplayed clip
   * that is only peeking in at the edge of the window. Always returns false.
   */
  playMuted(id: string): boolean {
    if (visualActivity.isCallBusy()) {
      this.registeredVideos.get(id)?.pause();
      return false;
    }
    this.activeVideos.add(id);
    return false;
  }

  /**
   * Hand the sound to `id` only if no other playing video holds it. Returns
   * whether `id` now owns it.
   */
  takeFreeAudio(id: string): boolean {
    if (!this.activeVideos.has(id)) return false;
    if (this.audioOwnerId && this.audioOwnerId !== id && this.activeVideos.has(this.audioOwnerId)) return false;
    this.audioOwnerId = id;
    return true;
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

  pauseAll(): void {
    const videos = [...this.registeredVideos.values()];
    videos.forEach(video => {
      if (!visualActivity.isCallBusy() && isVideoInPictureInPicture(video.element?.() ?? null)) return;
      this.activeVideos.delete(video.id);
      if (this.audioOwnerId === video.id) this.audioOwnerId = null;
      try { video.pause(); } catch {}
    });
    if (!this.audioOwnerId) this.promoteNextAudioOwner();
  }

  /** Promote the next active video to audio owner and unmute it */
  private promoteNextAudioOwner(): void {
    for (const activeId of this.activeVideos) {
      const video = this.registeredVideos.get(activeId);
      // Never unmute a clip nobody is looking at: it gets the sound when it
      // scrolls into view instead.
      if (video && (video.isProminent() || isVideoInPictureInPicture(video.element?.() ?? null))) {
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
