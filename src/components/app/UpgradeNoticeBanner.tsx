import { useState, useEffect } from "react";
import { X } from "lucide-react";

const STORAGE_KEY = "upgrade-notice-dismissed-v3";
const MESSAGE = "DeHub is under going a contract upgrade and will provide updates on new lisings soon";

export function UpgradeNoticeBanner() {
  // Synchronous initial visibility — mount visible to avoid flash from
  // HTML boot banner → empty → re-appear during React hydration.
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return true;
    try { return localStorage.getItem(STORAGE_KEY) !== "true"; } catch { return true; }
  });

  const handleClose = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] border-b border-red-500/30"
      style={{
        background: "rgba(220, 38, 38, 0.35)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
      }}
      role="alert"
    >
      <div className="flex items-center gap-2 pr-10">
        {/* Desktop: centered, wraps naturally */}
        <div className="hidden lg:block flex-1 px-4 py-2 text-center text-sm text-white font-medium">
          {MESSAGE}
        </div>

        {/* Mobile/Tablet: single-line side-scrolling marquee */}
        <div className="lg:hidden flex-1 overflow-hidden py-2">
          <div className="whitespace-nowrap animate-marquee text-sm text-white font-medium">
            <span className="px-4">{MESSAGE}</span>
            <span className="px-4">{MESSAGE}</span>
          </div>
        </div>

        <button
          onClick={handleClose}
          aria-label="Dismiss notice"
          className="absolute top-1/2 -translate-y-1/2 right-2 p-1.5 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
