/**
 * JustWatch attribution.
 *
 * This is not decoration. The partner terms require JustWatch branding to be
 * displayed alongside every set of offers, and the link must resolve to the
 * country-specific sub-folder for the title rather than the JustWatch root.
 * Non-compliance is grounds for revoking API access, so `OfferPanel` renders
 * this unconditionally — there is no prop that turns it off.
 */
export function JustWatchAttribution({ href, className = '' }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300 ${className}`}
    >
      <span>Availability and prices by</span>
      <span className="font-semibold tracking-tight text-zinc-300">JustWatch</span>
    </a>
  );
}
