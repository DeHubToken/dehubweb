/**
 * Ambient fill for long videos on wide screens (lib/wide-video-mode).
 *
 * Sits under the picture inside the player frame. The cover image, blurred and
 * dimmed, fills the frame straight away; once the video has a frame, a tiny
 * canvas copy of the playing picture takes over a few times a second, so the
 * space beside a tall or square video moves with it. The canvas is 32px wide
 * and the browser does the blur, so this costs next to nothing.
 *
 * Theatre mode reuses it with a matte frost and grain instead of the glow.
 *
 * Drawing a cross-origin video only marks the canvas as unreadable; it still
 * shows, which is all this needs.
 */
import { useEffect, useRef, type RefObject } from 'react';

const DRAW_EVERY_MS = 160;
const FILL_FILTER = 'blur(40px) saturate(150%) brightness(0.55)';
/** Theatre: matte frost, less colour, a fine grain on top. */
const FROST_FILTER = 'blur(44px) saturate(105%) brightness(0.42)';
const GRAIN = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .09 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

interface WideAmbientFillProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  thumbnail?: string;
  /** This card holds the shared video element right now. */
  live: boolean;
  /** Theatre look: frosted, grainy, quieter colour. */
  frost?: boolean;
}

export function WideAmbientFill({ videoRef, thumbnail, live, frost = false }: WideAmbientFillProps) {
  const filter = frost ? FROST_FILTER : FILL_FILTER;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shownRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !live) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) return;
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (!shownRef.current) {
          shownRef.current = true;
          canvas.style.opacity = '1';
        }
      } catch {
        // Not drawable yet (still attaching): the cover image stays.
      }
    };

    draw();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer == null) timer = setInterval(draw, DRAW_EVERY_MS);
    };
    const stop = () => {
      if (timer != null) clearInterval(timer);
      timer = null;
      draw();
    };
    const video = videoRef.current;
    if (video && !video.paused) start();
    video?.addEventListener('playing', start);
    video?.addEventListener('pause', stop);
    video?.addEventListener('seeked', draw);
    video?.addEventListener('loadeddata', draw);
    return () => {
      stop();
      video?.removeEventListener('playing', start);
      video?.removeEventListener('pause', stop);
      video?.removeEventListener('seeked', draw);
      video?.removeEventListener('loadeddata', draw);
    };
  }, [videoRef, live]);

  return (
    <div data-wide-ambient aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {thumbnail && (
        <img
          src={thumbnail}
          alt=""
          decoding="async"
          loading="lazy"
          className="absolute left-[-10%] top-[-10%] h-[120%] w-[120%] max-w-none object-cover"
          style={{ filter }}
        />
      )}
      <canvas
        ref={canvasRef}
        width={32}
        height={32}
        className="absolute left-[-10%] top-[-10%] h-[120%] w-[120%] opacity-0 transition-opacity duration-500"
        style={{ filter }}
      />
      {frost
        ? <div className="absolute inset-0 bg-white/[0.055]" style={{ backgroundImage: GRAIN }} />
        : <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_90%_at_50%_50%,transparent_40%,rgba(0,0,0,0.5))]" />}
    </div>
  );
}
