/**
 * The building blocks every half of the Stats page is drawn with — tiles,
 * proportion rows and group headings — shared so traffic, community and
 * money read as one page rather than three.
 */

import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div data-page-bento className="rounded-2xl bg-zinc-900 border border-zinc-800 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-xl sm:text-2xl font-bold text-white mt-0.5 tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-zinc-500 mt-0.5">{hint}</div>}
    </div>
  );
}

/** A labelled proportion bar. Fill is currentColor so it inverts with the theme. */
export function ShareRow({
  leading,
  label,
  value,
  max,
  formatted,
}: {
  leading?: string;
  label: string;
  value: number;
  max: number;
  formatted: string;
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      {leading && <span className="text-base leading-none w-5 shrink-0">{leading}</span>}
      <span className="text-sm text-white truncate flex-1 min-w-0">{label}</span>
      {/* The middle panel is narrow even on desktop, and the bar is decoration
          while the label is the content — so the bar yields space first. */}
      <div className="w-10 sm:w-20 lg:w-24 h-1.5 rounded-full bg-zinc-800/50 overflow-hidden shrink-0">
        <div className="h-full rounded-full bg-current opacity-50" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-zinc-400 tabular-nums w-12 text-right shrink-0">{formatted}</span>
    </div>
  );
}

/**
 * A heading for a group of tiles.
 *
 * Bare rather than a bento: the tiles beneath it are the cards, and wrapping a
 * label in its own card only to stack more cards under it reads as nesting that
 * isn't there. `href`, when given, is the endpoint the group's figures come
 * from — same self-evidencing habit as the traffic half — shown as
 * `hrefLabel`.
 */
export function GroupHeading({
  icon: Icon,
  title,
  titleHref,
  titleLabel,
  href,
  hrefLabel,
  actionHref,
  actionLabel,
}: {
  icon: LucideIcon;
  title: string;
  /** In-app route the words of the heading themselves open. */
  titleHref?: string;
  /** Accessible name for that link; the visible words stay `title`. */
  titleLabel?: string;
  href?: string;
  hrefLabel?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    // The page stacks its children on a uniform space-y-3. Left alone a heading
    // would sit as far from its own tiles as from the block above it; the extra
    // top padding and negative bottom margin pull it into the group it labels.
    <div className="flex items-baseline gap-2 px-1 pt-2 -mb-1">
      <Icon className="w-4 h-4 text-zinc-400 self-center shrink-0" />
      {titleHref ? (
        // The heading is what people reach for when a group has a page of its
        // own, so it is a link in its own right and not only the small action
        // on the right. Same hover treatment as that action.
        <Link
          to={titleHref}
          aria-label={titleLabel}
          className="text-sm font-semibold text-white hover:text-zinc-300 transition-colors underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
        >
          {title}
        </Link>
      ) : (
        <span className="text-sm font-semibold text-white">{title}</span>
      )}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors ml-auto shrink-0"
        >
          {hrefLabel ?? href}
        </a>
      )}
      {actionHref && actionLabel && (
        <Link
          to={actionHref}
          className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors ml-auto shrink-0"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
