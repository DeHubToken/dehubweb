/**
 * SpotifyMiniPlayer
 * =================
 * The engine behind every Spotify card, plus the corner player. Mounted once
 * in AppLayout and empty until a Spotify card's Play is pressed.
 *
 * Spotify's own embed lives here, out of sight, and Spotify's iFrame API
 * drives it: our cards show the song, the progress and the buttons, so a song
 * plays right inside the post (or grid tile) you pressed Play on. The corner
 * player only appears when you ask for it (the pop-out button) or when the
 * card the song is playing from leaves the screen, so you can always stop it.
 *
 * If the embed will not start on its own (some browsers want a tap inside
 * Spotify's player first) or the controller script cannot load, Spotify's
 * player is shown in the corner so it can be tapped.
 *
 * Only one thing makes sound: starting Spotify stops the radio and a
 * popped-out audio post, and either of those starting pauses Spotify.
 *
 * Bottom left, the same corner as the audio post player, clear of the radio
 * and stage players on the right.
 *
 * @module components/app/spotify/SpotifyMiniPlayer
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import X from '@/components/ui/cut-icons/close';
import { cn } from '@/lib/utils';
import { spotifyEmbedUrl } from '@/lib/spotify';
import {
  closeSpotify,
  reportSpotifyPlayback,
  setSpotifyHandlers,
  setSpotifyNeedsTap,
  useSpotifyPlayer,
} from '@/lib/spotify-player';
import { useRadioPlayer } from '@/hooks/use-radio-player';
import { getAudioPostPlaybackState, stopAudioPost, useAudioPostPlayback } from '@/lib/audio-post-playback';
import { useStagePlayback } from '@/lib/stage-playback';
import { SpotifyNowPlayingBar } from '@/components/app/cards/SpotifyCard';

const EMBED_HEIGHT = 80;
const API_SRC = 'https://open.spotify.com/embed/iframe-api/v1';
/** How long a pressed Play may take to start before the embed is shown to be tapped. */
const START_GRACE_MS = 6000;

interface PlaybackData { isPaused?: boolean; isBuffering?: boolean; position?: number; duration?: number }
interface EmbedController {
  loadUri: (uri: string) => void;
  play: () => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  destroy: () => void;
  addListener: (event: string, handler: (e: { data?: PlaybackData }) => void) => void;
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
  const { current, popout, inView, needsTap, isPaused } = useSpotifyPlayer();
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
        setSpotifyHandlers({
          toggle: () => controller.togglePlay(),
          pause: () => controller.pause(),
          seek: (seconds) => controller.seek(seconds),
        });
        controller.addListener('ready', () => {
          if (!playWhenReady.current) return;
          playWhenReady.current = false;
          controller.play();
        });
        controller.addListener('playback_update', (e) => {
          const data = e.data ?? {};
          if (typeof data.isPaused === 'boolean') playingRef.current = !data.isPaused;
          reportSpotifyPlayback(data);
        });
      });
    }).catch(() => { if (!cancelled) setFallback(true); });
    return () => { cancelled = true; };
  }, [uri]);

  // A pressed Play that has not started after a while: show Spotify's player
  // so it can be tapped (some browsers only let a tap inside it start sound).
  useEffect(() => {
    if (!uri) return;
    setSpotifyNeedsTap(false);
    const timer = window.setTimeout(() => {
      if (!playingRef.current) setSpotifyNeedsTap(true);
    }, START_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [uri]);

  // Closed: tear the embed down so nothing keeps playing.
  useEffect(() => {
    if (uri) return;
    controllerRef.current?.destroy();
    controllerRef.current = null;
    loadedUri.current = null;
    playingRef.current = false;
    setSpotifyHandlers(null);
    setFallback(false);
    hostRef.current?.replaceChildren();
  }, [uri]);

  useEffect(() => () => {
    controllerRef.current?.destroy();
    setSpotifyHandlers(null);
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
  // Spotify's own player is shown only when it has to be tapped.
  const showEmbed = fallback || (needsTap && isPaused !== false);
  const showBar = !showEmbed && (popout || !inView);

  return (
    <div
      className={cn(
        'pointer-events-none fixed left-4 z-50 w-[calc(100vw-2rem)] max-w-sm select-none',
        stageShowing ? 'bottom-48 md:bottom-32' : 'bottom-20 md:bottom-4',
      )}
      role="region"
      aria-label={t('spotify.player', { defaultValue: 'Spotify player' })}
      data-spotify-player={showEmbed ? 'embed' : showBar ? 'bar' : 'inline'}
    >
      <AnimatePresence>
        {showBar && (
          <motion.div
            key="bar"
            className="pointer-events-auto"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          >
            <SpotifyNowPlayingBar />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spotify's player. Kept on screen (see-through when our controls are
          in charge) so the browser never treats it as hidden and slows it. */}
      <div
        aria-hidden={!showEmbed}
        className={cn(
          'rounded-2xl p-1.5 shadow-2xl transition-opacity',
          showEmbed ? 'pointer-events-auto relative opacity-100' : 'absolute bottom-0 left-0 w-full opacity-0',
        )}
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
            tabIndex={showEmbed ? undefined : -1}
            className="overflow-hidden rounded-xl [&>iframe]:block"
            style={{ height: EMBED_HEIGHT, background: 'rgba(255,255,255,0.06)' }}
          />
        )}
        {showEmbed && (
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
        )}
      </div>
    </div>
  );
}
