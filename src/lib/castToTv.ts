/**
 * "Cast to TV" for any video post.
 *
 * Three routes, tried in this order:
 *  1. AirPlay (Safari on Mac and iPhone): the system picker on a <video>.
 *  2. Chromecast (Chrome, Edge): Google's Cast sender SDK hands the file's URL
 *     to the TV, which streams it itself. The page's own player is usually
 *     hls.js on a blob: URL, which a TV cannot open, so the TV gets the post's
 *     MP4 (or the playlist when that is all there is).
 *  3. Remote Playback API (Chrome on Android when the SDK is not offered).
 *
 * Anything else (Firefox, for one) has no way to cast a page's video, so the
 * caller explains that instead of showing a dead button.
 */

export interface CastSource {
  /** The file the TV should play: the MP4 when there is one. */
  url: string;
  title?: string;
  poster?: string;
  /** Seconds into the video, so the TV picks up where the phone was. */
  startAt?: number;
  /** The player on the page; paused once the TV takes over. */
  pageVideo?: HTMLVideoElement | null;
}

/**
 * 'picker': Safari's AirPlay picker is up; the system finishes the hand-off
 * (and the page's own player is often the one that moves to the TV).
 */
export type CastResult = 'casting' | 'picker' | 'cancelled' | 'unsupported' | 'failed';

const CAST_SDK = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';

type AirPlayVideo = HTMLVideoElement & { webkitShowPlaybackTargetPicker?: () => void };

declare global {
  interface Window {
    __onGCastApiAvailable?: (available: boolean) => void;
    // The Cast SDK ships no types we install; it is only touched here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cast?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chrome?: any;
  }
}

function absolute(url: string): string {
  try { return new URL(url, window.location.origin).href; } catch { return url; }
}

function contentType(url: string): string {
  return /\.m3u8(\?|$)/i.test(url) ? 'application/x-mpegURL' : 'video/mp4';
}

function supportsAirPlay(): boolean {
  if (typeof window === 'undefined') return false;
  return 'WebKitPlaybackTargetAvailabilityEvent' in window;
}

function isChromium(): boolean {
  return typeof window !== 'undefined' && !!window.chrome && !supportsAirPlay();
}

function supportsRemotePlayback(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'remote' in HTMLMediaElement.prototype;
}

/** Whether this browser has any way to cast. */
export function canCastToTv(): boolean {
  return supportsAirPlay() || isChromium() || supportsRemotePlayback();
}

let castSdk: Promise<boolean> | null = null;

function loadCastSdk(): Promise<boolean> {
  if (!isChromium()) return Promise.resolve(false);
  if (window.cast?.framework) return Promise.resolve(true);
  if (castSdk) return castSdk;
  castSdk = new Promise<boolean>((resolve) => {
    const done = (ok: boolean) => resolve(ok && !!window.cast?.framework);
    window.__onGCastApiAvailable = (available) => done(available);
    const script = document.createElement('script');
    script.src = CAST_SDK;
    script.async = true;
    script.onerror = () => done(false);
    document.head.appendChild(script);
    window.setTimeout(() => done(false), 8000);
  });
  // A failed load may be a blip; let the next tap try again.
  castSdk.then((ok) => { if (!ok) castSdk = null; });
  return castSdk;
}

/**
 * Starts loading the Cast SDK. Called when a video's menu opens, so the SDK is
 * ready by the time the row is tapped: the device picker needs the tap's
 * user activation, which a slow script load would outlive.
 */
export function prepareCastToTv(): void {
  if (isChromium()) void loadCastSdk();
}

/** One off-screen player that carries a cast when the page's own cannot. */
let castElement: HTMLVideoElement | null = null;

function castPlayer(source: CastSource): HTMLVideoElement {
  if (!castElement) {
    castElement = document.createElement('video');
    castElement.setAttribute('x-webkit-airplay', 'allow');
    castElement.setAttribute('playsinline', '');
    castElement.preload = 'metadata';
    castElement.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;left:0;';
    document.body.appendChild(castElement);
  }
  const url = absolute(source.url);
  if (castElement.src !== url) castElement.src = url;
  if (source.poster) castElement.poster = source.poster;
  return castElement;
}

function pausePage(source: CastSource) {
  try { source.pageVideo?.pause(); } catch { /* already gone */ }
}

function airPlay(source: CastSource): CastResult {
  // The page's player can go to the TV as it is when it plays a real URL
  // (Safari plays HLS natively), which keeps its position and controls.
  const page = source.pageVideo as AirPlayVideo | null | undefined;
  const pageUsable = !!page && !!page.currentSrc && !page.currentSrc.startsWith('blob:')
    && typeof page.webkitShowPlaybackTargetPicker === 'function';
  const video = (pageUsable ? page : castPlayer(source)) as AirPlayVideo;
  if (typeof video.webkitShowPlaybackTargetPicker !== 'function') return 'unsupported';
  video.disableRemotePlayback = false;
  video.setAttribute('x-webkit-airplay', 'allow');
  if (video !== page) {
    const onRoute = () => {
      if (!(video as unknown as { webkitCurrentPlaybackTargetIsWireless?: boolean }).webkitCurrentPlaybackTargetIsWireless) return;
      video.removeEventListener('webkitcurrentplaybacktargetiswirelesschanged', onRoute);
      pausePage(source);
      if (source.startAt) video.currentTime = source.startAt;
      void video.play().catch(() => {});
    };
    video.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', onRoute);
  }
  video.webkitShowPlaybackTargetPicker();
  return 'picker';
}

async function chromecast(source: CastSource): Promise<CastResult | null> {
  const ready = await loadCastSdk();
  if (!ready) return null;
  const { cast, chrome } = window;
  try {
    const context = cast.framework.CastContext.getInstance();
    context.setOptions({
      receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });
    try {
      await context.requestSession();
    } catch (error) {
      // The person closed the picker.
      if (error === 'cancel' || (error as { code?: string })?.code === 'cancel') return 'cancelled';
      throw error;
    }
    const session = context.getCurrentSession();
    if (!session) return 'cancelled';
    const url = absolute(source.url);
    const media = new chrome.cast.media.MediaInfo(url, contentType(url));
    media.streamType = chrome.cast.media.StreamType.BUFFERED;
    const metadata = new chrome.cast.media.GenericMediaMetadata();
    metadata.title = source.title || 'Riftn';
    if (source.poster) metadata.images = [new chrome.cast.Image(absolute(source.poster))];
    media.metadata = metadata;
    const request = new chrome.cast.media.LoadRequest(media);
    request.autoplay = true;
    request.currentTime = Math.max(0, source.startAt || 0);
    await session.loadMedia(request);
    pausePage(source);
    return 'casting';
  } catch {
    return 'failed';
  }
}

async function remotePlayback(source: CastSource): Promise<CastResult> {
  if (!supportsRemotePlayback()) return 'unsupported';
  const video = castPlayer(source);
  video.disableRemotePlayback = false;
  try {
    await video.remote.prompt();
  } catch (error) {
    const name = (error as DOMException)?.name;
    if (name === 'NotAllowedError' || name === 'AbortError') return 'cancelled';
    return name === 'NotSupportedError' ? 'unsupported' : 'failed';
  }
  pausePage(source);
  if (source.startAt) video.currentTime = source.startAt;
  void video.play().catch(() => {});
  return 'casting';
}

export async function castToTv(source: CastSource): Promise<CastResult> {
  if (typeof window === 'undefined' || !source.url) return 'unsupported';
  if (supportsAirPlay()) return airPlay(source);
  if (isChromium()) {
    const viaSdk = await chromecast(source);
    if (viaSdk) return viaSdk;
  }
  return remotePlayback(source);
}

/** The video on screen right now among several (Shorts keeps neighbours mounted). */
export function visibleVideo(selector: string): HTMLVideoElement | null {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>(selector));
  const playing = videos.find((video) => !video.paused);
  if (playing) return playing;
  const middle = window.innerHeight / 2;
  return videos.find((video) => {
    const box = video.getBoundingClientRect();
    return box.top <= middle && box.bottom >= middle;
  }) ?? null;
}
