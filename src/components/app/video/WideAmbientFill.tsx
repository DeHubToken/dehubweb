/**
 * Ambient fill for long videos on wide screens (lib/wide-video-mode).
 *
 * Sits under the picture inside the player frame. The cover image, blurred and
 * dimmed, fills the frame straight away; once the video has a frame, a tiny
 * canvas copy of the playing picture fades in over it and follows the video.
 *
 * Three things keep it calm:
 * - The canvas has the frame's own shape and copies the middle of the picture
 *   the way `object-cover` crops the cover image, so the two line up and
 *   nothing looks stretched when the live copy takes over.
 * - Each draw blends 18% of the new frame into the last one, so cuts and
 *   flashes in the video turn into a slow colour drift beside it.
 * - Its size never changes the layout: it is absolutely placed, and a resize
 *   only resets the canvas when the frame's shape really changes.
 *
 * Drawing a cross-origin video only marks the canvas as unreadable; it still
 * shows, which is all this needs.
 */
import { useEffect, useRef, type RefObject } from 'react';

const DRAW_EVERY_MS = 120;
const BLEND = 0.18;
const CANVAS_WIDTH = 48;
// The blur fades each layer to clear over about three times its radius, so
// both layers run 140px past every edge. At 10% they stopped inside that
// fade and a thin dark line showed along the edges of the frame.
const FILL_FILTER = 'blur(40px) saturate(150%) brightness(0.55)';

interface WideAmbientFillProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  thumbnail?: string;
  /** This card holds the shared video element right now. */
  live: boolean;
}

export function WideAmbientFill({ videoRef, thumbnail, live }: WideAmbientFillProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas || !live) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let painted = false;

    const fitCanvas = () => {
      const { width, height } = box.getBoundingClientRect();
      if (!width || !height) return;
      const h = Math.max(8, Math.round(CANVAS_WIDTH * (height / width)));
      if (canvas.height !== h) {
        canvas.width = CANVAS_WIDTH;
        canvas.height = h;
        painted = false;
      }
    };

    const draw = () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
      const cw = canvas.width;
      const ch = canvas.height;
      // object-cover crop: the middle of the picture at the canvas's shape.
      const target = cw / ch;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      let sw = vw;
      let sh = vh;
      if (vw / vh > target) sw = vh * target;
      else sh = vw / target;
      try {
        ctx.globalAlpha = painted ? BLEND : 1;
        ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, cw, ch);
        ctx.globalAlpha = 1;
        if (!painted) {
          painted = true;
          canvas.style.opacity = '1';
        }
      } catch {
        // Not drawable yet (still attaching): the cover image stays.
      }
    };

    fitCanvas();
    const resize = new ResizeObserver(fitCanvas);
    resize.observe(box);
    draw();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer == null) timer = setInterval(draw, DRAW_EVERY_MS);
    };
    const stop = () => {
      if (timer != null) clearInterval(timer);
      timer = null;
    };
    const video = videoRef.current;
    if (video && !video.paused) start();
    video?.addEventListener('playing', start);
    video?.addEventListener('pause', stop);
    video?.addEventListener('seeked', draw);
    video?.addEventListener('loadeddata', draw);
    return () => {
      stop();
      resize.disconnect();
      video?.removeEventListener('playing', start);
      video?.removeEventListener('pause', stop);
      video?.removeEventListener('seeked', draw);
      video?.removeEventListener('loadeddata', draw);
    };
  }, [videoRef, live]);

  return (
    <div ref={boxRef} data-wide-ambient aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {thumbnail && (
        <img
          src={thumbnail}
          alt=""
          decoding="async"
          className="absolute left-[-140px] top-[-140px] h-[calc(100%+280px)] w-[calc(100%+280px)] max-w-none object-cover"
          style={{ filter: FILL_FILTER }}
        />
      )}
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={27}
        className="absolute left-[-140px] top-[-140px] h-[calc(100%+280px)] w-[calc(100%+280px)] opacity-0 transition-opacity duration-700"
        style={{ filter: FILL_FILTER }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_90%_at_50%_50%,transparent_40%,rgba(0,0,0,0.5))]" />
    </div>
  );
}
