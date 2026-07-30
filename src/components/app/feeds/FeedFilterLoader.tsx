/**
 * Feed Filter Loader
 * ==================
 * The loader that owns the middle feed column while a filter toggle's request
 * is in flight. Paired with `useFeedFilterTransition` — see that hook for why
 * `isLoading` alone can't drive this.
 *
 * Two variants:
 *
 *  - War theme: a panel-sized cut-down of the boot sequence (WarPreloader).
 *    Deliberately CSS-only — no THREE.js, no second WebGL context. The boot
 *    globe plays once per session; this can fire a dozen times while somebody
 *    tries out sort options, so it has to stay cheap.
 *  - Everything else: a single glass card with a ring spinner, matching the
 *    monochrome system (no colour, no bespoke chrome).
 *
 * The loader REPLACES the list rather than overlaying it. Unmounting ~30 feed
 * cards is what removes the render stall people were reading as a freeze; an
 * overlay would leave every card mounted and still re-render them all in one
 * commit when the response landed.
 */

import { useAppTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

/** Cells in the indeterminate meter. Purely decorative; no progress is known. */
const MINI_CELL_COUNT = 22;
const MINI_CELLS = Array.from({ length: MINI_CELL_COUNT }, (_, i) => i);
/** Per-cell stagger, in ms. Turns the shared keyframe into a marching wave. */
const CELL_STAGGER_MS = 55;

interface FeedFilterLoaderProps {
  /** Announced to screen readers. Visible only in the default variant. */
  label?: string;
  className?: string;
}

export function FeedFilterLoader({
  label = 'Updating feed',
  className,
}: FeedFilterLoaderProps) {
  const { theme } = useAppTheme();

  if (theme === 'war') {
    return <WarFilterLoader label={label} className={className} />;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-feed-filter-loader
      className={cn(
        'flex min-h-[260px] flex-col items-center justify-center gap-4 rounded-xl',
        'border border-white/[0.08] bg-white/[0.02] backdrop-blur-[24px]',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-2 border-white/[0.12] border-t-white/70"
      />
      <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">{label}</p>
    </div>
  );
}

/**
 * Compact War variant. Every hook here is styled in war-theme.css section 19;
 * the component only ever renders it under `html[data-theme='war']`, which is
 * why the CSS there is unscoped (same convention as the boot panel).
 */
function WarFilterLoader({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-war-mini-boot
      className={className}
    >
      {/* The only text in the live region — the HUD copy below is decoration
          and would otherwise be announced on every single filter tap. */}
      <span className="sr-only">{label}</span>

      <span aria-hidden="true" data-war-mini-bracket="tl" />
      <span aria-hidden="true" data-war-mini-bracket="tr" />
      <span aria-hidden="true" data-war-mini-bracket="bl" />
      <span aria-hidden="true" data-war-mini-bracket="br" />
      <span aria-hidden="true" data-war-mini-sweep />

      <div aria-hidden="true" data-war-mini-frame>
        <p data-war-mini-kicker>DEHUB // TACTICAL NETWORK</p>
        <p data-war-mini-title>RETASKING SENSORS</p>

        <div data-war-mini-bar>
          {MINI_CELLS.map((cell) => (
            <span
              key={cell}
              style={{ animationDelay: `${cell * CELL_STAGGER_MS}ms` }}
            />
          ))}
        </div>

        <p data-war-mini-sub>REACQUIRING TARGETS &middot; STAND BY</p>
      </div>
    </div>
  );
}

export default FeedFilterLoader;
