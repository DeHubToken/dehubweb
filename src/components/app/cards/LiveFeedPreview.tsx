/**
 * Live Feed Preview
 * =================
 * The picture a live post shows IN THE FEED. Until this existed the feed drew
 * a poster frame (often a stock fallback, because a MediaMTX stream renders no
 * thumbnail) and the stream itself only appeared after a click-through to the
 * post page — so a live post read as an empty card while it was on air.
 *
 * Deliberately not LiveStreamCard: that card is the full room (WHEP, tips,
 * chat, shop, host controls). This is the cheap half — muted, inline, and only
 * while the card is actually visible.
 *
 * ── Why this plays WebRTC rather than HLS ──
 *
 * It used to be HLS-only, and the post page has always preferred WHEP. That
 * split was the whole bug: the self-hosted ingest is a remuxer, so a broadcast
 * published over WebRTC keeps its OPUS audio in the HLS ladder
 * (`CODECS="avc1.42c01e,opus"`). Safari's native HLS does not decode Opus, so
 * a live card there played nothing and painted decoder garbage over the tile,
 * while the same stream opened fine on the post page one tap away — which is
 * exactly what a viewer reported. Same picture, same stream, different
 * transport.
 *
 * So: WHEP first, the way the post page does it, with HLS kept as the fallback
 * for Livepeer streams and for anywhere WebRTC cannot go. A self-hosted stream
 * never falls back to NATIVE HLS — that combination is the one that produces
 * the garbage — it uses hls.js where MSE exists and otherwise shows the poster.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type Hls from 'hls.js';
import { LiveEndedMedia } from './LiveEndedMedia';
import { ButtonLoader } from '../DeHubLoader';
import { liveSourceFromHlsUrl, whepEndpointFor } from '@/lib/live-ingest';
import type { WhepSubscription } from '@/lib/livepeer/whep';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, PictureInPicture2 } from 'lucide-react';
import { useVideoFullscreen } from '@/hooks/use-video-fullscreen';

interface LiveFeedPreviewProps {
  /** HLS ladder for the stream. First playable URL wins. */
  urls: (string | undefined)[];
  /** Poster frame, shown until the first video frame lands. */
  thumbnail?: string;
  className?: string;
  /** Chip shown when there is nothing playable. */
  fallbackLabel?: string;
  /**
   * The card's sound switch. The preview autoplays, which the browser only
   * allows muted, so it starts silent either way — but the element used to be
   * hard-coded `muted`, which meant the card's own button flipped its icon
   * and changed nothing. A viewer who pressed Unmute on a live card heard
   * nothing and had no way to know why.
   */
  muted?: boolean;
  controlsVisible?: boolean;
  onToggleMute?: (event: React.MouseEvent) => void;
}

/** A negotiated session that never delivers a frame is the worst case. */
const WHEP_START_TIMEOUT_MS = 6000;

/**
 * Concurrent WebRTC sessions this page will hold for feed previews.
 *
 * A grid of live cards can have several on screen at once, and the reason the
 * feed was not already doing this is the cost of one peer connection per card.
 * Two covers the case that matters — the card someone is looking at, and the
 * one arriving as they scroll — and anything past it keeps the poster.
 */
const MAX_CONCURRENT_WHEP = 2;
let whepSessionsOpen = 0;

export function LiveFeedPreview({ urls, thumbnail, className, fallbackLabel = 'Live ended', muted = true, controlsVisible = false, onToggleMute }: LiveFeedPreviewProps) {
  const { pathname } = useLocation();
  const postOpen = /^\/app\/post\//.test(pathname);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { isFullscreen, toggleFullscreen } = useVideoFullscreen(videoRef, containerRef, { escapeAncestors: true });
  const [paused, setPaused] = useState(true);
  // Applied imperatively as well as through the prop: React only writes the
  // `muted` property on mount, and the element is re-attached when the
  // transport moves from WebRTC to HLS.
  useEffect(() => {
    const el = videoRef.current;
    if (el) el.muted = muted;
  });
  const hlsRef = useRef<Hls | null>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  const src = urls.find((u): u is string => !!u && u.includes('.m3u8'));
  const source = useMemo(() => liveSourceFromHlsUrl(src), [src]);
  const selfHosted = source?.provider === 'mediamtx';

  // One WebRTC attempt per card: the transport only ever moves whep → hls, so
  // a failure cannot trade the element back and forth with the ladder.
  const [transport, setTransport] = useState<'whep' | 'hls'>(
    typeof RTCPeerConnection !== 'undefined' && !!source ? 'whep' : 'hls',
  );

  // Only attach while the card is on screen. A feed can hold dozens of live
  // cards; each attached session is a rolling download either way.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio > 0.25),
      { threshold: [0, 0.25, 0.6] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [src]);

  // ── WebRTC ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (transport !== 'whep' || !visible || postOpen || failed || !source) return;
    const el = videoRef.current;
    if (!el) return;
    if (whepSessionsOpen >= MAX_CONCURRENT_WHEP) {
      setTransport('hls');
      return;
    }

    let cancelled = false;
    let session: WhepSubscription | null = null;
    setLoading(true);
    whepSessionsOpen += 1;

    const fallBack = () => {
      if (cancelled) return;
      setTransport('hls');
    };

    // Negotiated but silent: no error to catch and nothing on screen.
    const timer = setTimeout(() => {
      if (!cancelled && !el.videoWidth) fallBack();
    }, WHEP_START_TIMEOUT_MS);

    const start = async () => {
      try {
        const { subscribeToWhep } = await import('@/lib/livepeer/whep');
        if (cancelled) return;
        session = await subscribeToWhep({
          playbackId: source.playbackId,
          endpoint: whepEndpointFor({
            provider: source.provider,
            playbackId: source.playbackId,
          }),
          onStateChange: (state) => {
            if (!cancelled && state === 'failed') fallBack();
          },
        });
        if (cancelled) {
          await session.stop();
          return;
        }
        el.srcObject = session.stream;
        await el.play().catch(() => { if (!cancelled) setLoading(false); });
      } catch {
        fallBack();
      }
    };

    void start();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      whepSessionsOpen = Math.max(0, whepSessionsOpen - 1);
      void session?.stop();
      // A dead srcObject left attached stops HLS ever getting a picture onto
      // this element.
      if (el.srcObject) el.srcObject = null;
    };
  }, [transport, visible, postOpen, failed, source]);

  // ── HLS ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = videoRef.current;
    if (transport !== 'hls' || !el || !src || !visible || postOpen || failed) return;
    let cancelled = false;
    setLoading(true);

    const attach = async () => {
      // Native HLS is Safari's path, and it is the right one for a Livepeer
      // stream (AAC audio). It is the WRONG one for the self-hosted ingest,
      // whose ladder carries Opus: Safari cannot decode it and paints garbage
      // rather than failing, so that combination is never attempted.
      if (!selfHosted && el.canPlayType('application/vnd.apple.mpegurl')) {
        el.src = src;
      } else {
        const { default: HlsCtor } = await import('hls.js');
        if (cancelled || !HlsCtor.isSupported()) {
          // No MSE — iOS before Managed Media Source. WebRTC was the only way
          // in and it did not get there; show the poster, never a broken tile.
          if (!cancelled) setFailed(true);
          return;
        }
        const hls = new HlsCtor({ lowLatencyMode: true, backBufferLength: 10 });
        hlsRef.current = hls;
        hls.on(HlsCtor.Events.ERROR, (_, data) => {
          if (!data.fatal) return;
          // A stream that has stopped publishing 404s its playlist. Fall back
          // to the poster rather than retrying a source that is gone.
          hls.destroy();
          hlsRef.current = null;
          if (!cancelled) setFailed(true);
        });
        hls.loadSource(src);
        hls.attachMedia(el);
      }
      el.play().catch(() => { if (!cancelled) setLoading(false); });
    };

    void attach().catch(() => { if (!cancelled) setFailed(true); });

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      el.removeAttribute('src');
      el.load();
    };
  }, [transport, src, visible, postOpen, failed, selfHosted]);

  if (!src || failed) {
    return <LiveEndedMedia thumbnail={thumbnail} label={fallbackLabel} />;
  }

  return (
    <div ref={containerRef} className={isFullscreen ? 'fixed inset-0 z-[9999] w-screen h-screen bg-black' : className ?? 'absolute inset-0 w-full h-full'}>
      {!playing &&
        (thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          /* No cover — the normal case for a stream published from an encoder,
             which has no browser sending poster frames. Without something here
             the card is a bare <video> with no poster: an empty box for as long
             as the connection takes to open, and permanently when autoplay is
             refused. The static screen says what the card is instead, and is
             replaced by the first frame. */
          <LiveEndedMedia label={fallbackLabel} />
        ))}
      <video
        ref={videoRef}
        className={`absolute inset-0 w-full h-full ${isFullscreen ? 'object-contain' : 'object-cover'}`}
        muted={muted}
        playsInline
        autoPlay
        preload="none"
        poster={thumbnail}
        onPlaying={() => { setPlaying(true); setPaused(false); setLoading(false); }}
        onWaiting={() => setLoading(true)}
        onPause={() => { setPaused(true); setLoading(false); }}
      />
      {visible && !postOpen && loading && (
        <div role="status" aria-label="Loading" className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <ButtonLoader size={40} className="!filter-none" />
        </div>
      )}
      {(controlsVisible || isFullscreen) && (
        <div data-video-controls className="absolute bottom-0 inset-x-0 z-10 flex items-center gap-2 px-3 pb-3 pt-6 bg-gradient-to-t from-black/80 to-transparent" onClick={(event) => event.stopPropagation()}>
          <button type="button" aria-label={paused ? 'Play' : 'Pause'} className="h-8 w-8 rounded-xl bg-black/40 border border-white/10 text-white flex items-center justify-center" onClick={() => {
            const el = videoRef.current;
            if (!el) return;
            if (el.paused) {
              setLoading(true);
              void el.play().catch(() => { setPaused(true); setLoading(false); });
            }
            else el.pause();
          }}>
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          <span className="text-xs font-semibold text-white">LIVE</span>
          <div className="flex-1" />
          {onToggleMute && <button type="button" aria-label={muted ? 'Unmute' : 'Mute'} onClick={onToggleMute} className="h-8 w-8 rounded-xl bg-black/40 border border-white/10 text-white flex items-center justify-center">
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>}
          {document.pictureInPictureEnabled && <button type="button" aria-label="Picture in picture" className="h-8 w-8 rounded-xl bg-black/40 border border-white/10 text-white flex items-center justify-center" onClick={() => {
            if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined);
            else void videoRef.current?.requestPictureInPicture().catch(() => undefined);
          }}><PictureInPicture2 className="h-4 w-4" /></button>}
          <button type="button" aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={() => toggleFullscreen()} className="h-8 w-8 rounded-xl bg-black/40 border border-white/10 text-white flex items-center justify-center">
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
