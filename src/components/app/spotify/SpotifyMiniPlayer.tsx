/**
 * SpotifyMiniPlayer
 * =================
 * The corner player for Spotify links. Mounted once in AppLayout and empty
 * until a Spotify card's Play is pressed; then it holds Spotify's own embed,
 * so the music keeps going while you scroll and change pages.
 *
 * Spotify's iFrame API drives the embed: it lets one tap on our card start
 * the song (no second tap inside the embed) and reports pause state back to
 * the cards. If that script cannot load, the plain embed iframe still plays.
 *
 * Only one thing makes sound: starting Spotify stops the radio and a
 * popped-out audio post, and either of those starting pauses Spotify.
 *
 * Bottom left, the same corner as the audio post player (which Spotify
 * replaces when it starts), clear of the radio and stage players on the right.
 *
 * @module components/app/spotify/SpotifyMiniPlayer
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import X from '@/components/ui/cut-icons/close';
import { cn } from '@/lib/utils';
import { spotifyEmbedUrl } from '@/lib/spotify';
import {
  closeSpotify,
  reportSpotifyPaused,
  setSpotifyToggleHandler,
  useSpotifyPlayer,
} from '@/lib/spotify-player';
import { useRadioPlayer } from '@/hooks/use-radio-player';
import { getAudioPostPlaybackState, stopAudioPost, useAudioPostPlayback } from '@/lib/audio-post-playback';
import { useStagePlayback } from '@/lib/stage-playback';

const EMBED_HEIGHT = 80;
const API_SRC = 'https://open.spotify.com/embed/iframe-api/v1';

interface EmbedController {
  loadUri: (uri: string) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  destroy: () => void;
  addListener: (event: string, handler: (e: { data?: { isPaused?: boolean } }) => void) => void;
}
interface IFrameApi {
  createController: (el: HTMLElement, options: { uri: string; width: string | number; height: number }, cb: (c: EmbedController) => void) => void;
}

let apiPromise: Promise<IFrameApi> | null = null;
function loadIframeApi(): Promise<IFrameApi> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<IFrameApi>((resolve, reject) => {
    const w = window as unknown as { onSpotifyIframeApiReady?: (api: IFrameApi) => void };
    w.onSpotifyIframeApiReady = (api) => resolve(api);
    const script = document.createElement('script');
    script.src = API_SRC;
    script.async = true;
    script.onerror = () => { apiPromise = null; reject(new Error('spotify iframe api failed')); };
    document.head.appendChild(script);
    setTimeout(() => reject(new Error('spotify iframe api timed out')), 8000);
  });
  return apiPromise;
}

export function SpotifyMiniPlayer() {
  const { t } = useTranslation();
  const { current } = useSpotifyPlayer();
  const radio = useRadioPlayer();
  const audioPost = useAudioPostPlayback();
  const stage = useStagePlayback();
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<EmbedController | null>(null);
  const loadedUri = useRef<string | null>(null);
  const playWhenReady = useRef(false);
  const playingRef = useRef(false);
  const [fallback, setFallback] = useState(false);
  const uri = current?.link.uri ?? null;

  // Build the embed for the first link, swap the song for every one after.
  useEffect(() => {
    if (!uri) return;
    if (controllerRef.current) {
      if (loadedUri.current !== uri) {
        loadedUri.current = uri;
        playWhenReady.current = true;
        controllerRef.current.loadUri(uri);
      }
      return;
    }
    let cancelled = false;
    playWhenReady.current = true;
    loadIframeApi().then((api) => {
      const host = hostRef.current;
      if (cancelled || !host || controllerRef.current) return;
      const mount = document.createElement('div');
      host.replaceChildren(mount);
      loadedUri.current = uri;
      api.createController(mount, { uri, width: '100%', height: EMBED_HEIGHT }, (controller) => {
        if (cancelled) { controller.destroy(); return; }
        controllerRef.current = controller;
        setSpotifyToggleHandler(() => controller.togglePlay());
        controller.addListener('ready', () => {
          if (!playWhenReady.current) return;
          playWhenReady.current = false;
          controller.play();
        });
        controller.addListener('playback_update', (e) => {
          const paused = e.data?.isPaused;
          if (typeof paused !== 'boolean') return;
          playingRef.current = !paused;
          reportSpotifyPaused(paused);
        });
      });
    }).catch(() => { if (!cancelled) setFallback(true); });
    return () => { cancelled = true; };
  }, [uri]);

  // Closed: tear the embed down so nothing keeps playing.
  useEffect(() => {
    if (uri) return;
    controllerRef.current?.destroy();
    controllerRef.current = null;
    loadedUri.current = null;
    playingRef.current = false;
    setSpotifyToggleHandler(null);
    setFallback(false);
    hostRef.current?.replaceChildren();
  }, [uri]);

  useEffect(() => () => {
    controllerRef.current?.destroy();
    setSpotifyToggleHandler(null);
  }, []);

  // Starting Spotify silences the radio and a popped-out audio post.
  useEffect(() => {
    if (!uri) return;
    if (radio.isPlaying) radio.stop();
    if (getAudioPostPlaybackState().isPlaying) stopAudioPost();
    // Only on a new link: the radio starting later is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  // ...and either of those starting later pauses Spotify.
  useEffect(() => {
    if ((radio.isPlaying || audioPost.isPlaying) && playingRef.current) controllerRef.current?.pause();
  }, [radio.isPlaying, audioPost.isPlaying]);

  if (!current) return null;

  const stageShowing = !!stage.spaceId && stage.popout;

  return (
    <div
      className={cn(
        'fixed left-4 z-50 w-[calc(100vw-2rem)] max-w-sm select-none',
        stageShowing ? 'bottom-48 md:bottom-32' : 'bottom-20 md:bottom-4',
      )}
      role="region"
      aria-label={t('spotify.player', { defaultValue: 'Spotify player' })}
      data-spotify-player
    >
      <div
        className="relative rounded-2xl p-1.5 shadow-2xl"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {fallback ? (
          <iframe
            key={current.link.uri}
            title={current.title || 'Spotify'}
            src={spotifyEmbedUrl(current.link)}
            width="100%"
            height={EMBED_HEIGHT}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            className="block rounded-xl border-0"
          />
        ) : (
          <div
            ref={hostRef}
            className="overflow-hidden rounded-xl [&>iframe]:block"
            style={{ height: EMBED_HEIGHT, background: 'rgba(255,255,255,0.06)' }}
          />
        )}
        <button
          type="button"
          onClick={closeSpotify}
          aria-label={t('spotify.stopAndClose', { defaultValue: 'Stop and close' })}
          title={t('spotify.stopAndClose', { defaultValue: 'Stop and close' })}
          className="absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full opacity-95 transition-opacity hover:opacity-100"
          style={{ background: 'rgba(0,0,0,0.78)', color: '#fff', boxShadow: '0 0 0 1px rgba(255,255,255,0.25)' }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
