import { useTranslation as _useCopy } from 'react-i18next';
/**
 * JustWatch attribution.
 *
 * This is not decoration and it is not optional. The partner terms require
 * JustWatch branding to be displayed alongside every set of offers, and the
 * link must resolve to the country-specific sub-folder for the title rather
 * than the JustWatch root. Non-compliance is grounds for revoking API access,
 * so `OfferPanel` renders this unconditionally — there is no prop that turns
 * it off.
 *
 * What the terms do NOT require is attribution on surfaces that show no
 * offers. It used to sit on the idle panel and the empty state too; those are
 * gone, because the requirement attaches to the offers, not to the page.
 * This is the minimum that keeps the licence — trim it further and the
 * integration fails review.
 */
export function JustWatchAttribution({ href, className = '' }: { href: string; className?: string }) {
  const { t: _copy } = _useCopy();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-[11px] text-zinc-600 transition-colors hover:text-zinc-400 ${className}`}
    >
      <span>{_copy("copy.4d327af41f96", { defaultValue: "via" })}</span>
      <span className="font-medium text-zinc-500">{_copy("copy.94b3fa810269", { defaultValue: "JustWatch" })}</span>
    </a>
  );
}
