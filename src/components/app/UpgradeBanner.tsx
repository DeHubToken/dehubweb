/**
 * Thin red banner displayed at the very top of the app to inform users
 * about the contract upgrade and expected downtime.
 */
export function UpgradeBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white text-[11px] sm:text-xs font-medium px-3 py-1 text-center leading-tight">
      DeHub is undergoing a contract upgrade and new listings will be announced soon. The app is also being upgraded so downtime should be expected
    </div>
  );
}
