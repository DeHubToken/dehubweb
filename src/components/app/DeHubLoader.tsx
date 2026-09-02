/**
 * DeHub preloader — the animated DeHub mark (a ring sweeping around the "U").
 *
 * Ported from the original dehub-nx monorepo loader
 * (libs/shared/asset/dehub/src/lib/dehub-loader.gif, the `dhb-loader` shown on
 * dehub.net), resized 1080² → 240² so it costs ~60 KB instead of 378 KB — it
 * has to download on exactly the slow connections it appears on.
 *
 * Scope: PAGE-level waits only — route/chunk Suspense fallbacks and the first
 * data load of a whole view. Inline waits (buttons, rows, infinite-scroll
 * sentinels) keep their small `Loader2` spinner, and the video pipeline keeps
 * `VideoGlitchLoader`.
 *
 * Colour: the art is white-on-transparent. index.css inverts it to black on the
 * light surfaces — the app's `light` theme and the docs surface's `html.light`
 * — via `[data-dehub-loader]`, so nothing here needs to know the theme.
 *
 * Flash guard: `.dehub-loader-mark` fades in on a 250 ms delay, so a route
 * chunk that resolves quickly never shows a loading stage at all.
 */

interface DeHubLoaderProps {
  /** Rendered size in px (square). Default 64. */
  size?: number;
  className?: string;
}

// dehub-loader.webp: the same 240px GIF (61 KB, 33 fps) re-encoded as a
// 144px, 16 fps animated WebP (23 KB). The mark renders at 64 CSS px at most
// (16 in buttons), so 144 covers a 2x screen; Lighthouse flagged the GIF as
// four times the pixels it needed and it sat on the boot path of every page.
export const DeHubLoader = ({ size = 64, className = "" }: DeHubLoaderProps) => (
  <img
    src="/dehub-loader.webp"
    alt=""
    aria-hidden="true"
    decoding="async"
    width={size}
    height={size}
    style={{ width: size, height: size }}
    data-dehub-loader
    className={`dehub-loader-mark select-none pointer-events-none ${className}`}
  />
);

interface DeHubPageLoaderProps extends DeHubLoaderProps {
  /** Optional caption under the mark (e.g. "Joining stage…"). */
  label?: string;
  /** Height of the centring box. Default "100%" of a full-viewport wrapper. */
  minHeight?: string;
  /** Fill the viewport instead of the parent box. */
  fullScreen?: boolean;
}

/**
 * Centred page-level preloader. Transparent background so it sits on whatever
 * surface it lands in (paper, black, or glass-over-canvas).
 */
export const DeHubPageLoader = ({
  size = 64,
  label,
  minHeight = "60vh",
  fullScreen = false,
  className = "",
}: DeHubPageLoaderProps) => (
  <div
    role="status"
    aria-label={label ?? "Loading"}
    className={`flex flex-col items-center justify-center gap-3 ${
      fullScreen ? "min-h-[100dvh] w-full" : "w-full"
    } ${className}`}
    style={fullScreen ? undefined : { minHeight }}
  >
    <DeHubLoader size={size} />
    {/* text-zinc-500 rather than an opacity utility: `.dehub-loader-mark`
        animates opacity, which would override it. */}
    {label && <span className="dehub-loader-mark text-sm text-zinc-500">{label}</span>}
  </div>
);


/**
 * Inline button preloader — the same DeHub mark, icon-sized, for the moment
 * between a click and the thing it asked for finishing.
 *
 * Why not `DeHubLoader`: that one fades in on a 250 ms delay so a fast route
 * chunk never flashes a loading stage. A button is the opposite case — the
 * whole point is to answer the click *immediately*, on a slow phone or a slow
 * connection, so this one paints on frame one and skips `.dehub-loader-mark`.
 *
 * Default 16 px matches the button primitive's `[&_svg]:size-4`, so it drops
 * into an icon slot without moving anything around it.
 */
export const ButtonLoader = ({ size = 16, className = "" }: DeHubLoaderProps) => (
  <img
    src="/dehub-loader.webp"
    alt=""
    aria-hidden="true"
    decoding="async"
    width={size}
    height={size}
    style={{ width: size, height: size }}
    data-dehub-loader
    className={`select-none pointer-events-none shrink-0 ${className}`}
  />
);

export default DeHubPageLoader;
