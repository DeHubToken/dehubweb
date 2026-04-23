/**
 * Thin red banner displayed at the very top of the app to inform users
 * about the contract upgrade and expected downtime.
 *
 * - Mobile: single-line marquee that scrolls horizontally so the full
 *   message is readable.
 * - Desktop (sm+): static centered text.
 *
 * The banner sits in normal document flow so it pushes the rest of the
 * content down rather than overlapping it.
 */
const MESSAGE =
  'DeHub is undergoing a contract upgrade and new listings will be announced soon. The app is also being upgraded so downtime should be expected during this period.';

export function UpgradeBanner() {
  return (
    <div className="relative w-full bg-red-600 text-white text-[11px] sm:text-xs font-medium leading-tight">
      {/* Mobile: marquee */}
      <div className="sm:hidden overflow-hidden py-1">
        <div
          className="whitespace-nowrap inline-block"
          style={{ animation: 'upgrade-banner-marquee 22s linear infinite' }}
        >
          <span className="px-8">{MESSAGE}</span>
          <span className="px-8">{MESSAGE}</span>
        </div>
      </div>

      {/* Desktop: static centered */}
      <div className="hidden sm:block px-3 py-1 text-center">{MESSAGE}</div>

      <style>{`
        @keyframes upgrade-banner-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
