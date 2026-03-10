import { useState, useEffect } from "react";
import { X } from "lucide-react";
import googlePlayBadge from "@/assets/google-play-badge.png";

export function DevelopmentNoticeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const hasSeenNotice = localStorage.getItem("dev-notice-seen");
    if (!hasSeenNotice) {
      setOpen(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem("dev-notice-seen", "true");
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60" 
        onClick={handleClose}
      />
      
      {/* Modal - Liquid Glass */}
      <div 
        className="relative mx-4 max-w-sm w-full rounded-2xl p-6 border border-white/10 shadow-2xl"
        style={{
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        }}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="text-center pt-2">
          <h2 className="text-xl font-bold text-white mb-3">Almost There!</h2>
          <p className="text-white/60 text-sm leading-relaxed mb-6">
            App upgrade almost complete. Some users may experience downtime as we ship final developments.
          </p>
          
          {/* Google Play button */}
          <a
            href="https://play.google.com/store/apps/details?id=io.dehub.mobile&hl"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block transition-transform hover:scale-105 mb-4"
          >
            <img
              src={googlePlayBadge}
              alt="Get it on Google Play"
              className="h-12"
            />
          </a>
          
          {/* Continue button */}
          <button
            onClick={handleClose}
            className="block w-full py-3 text-sm text-white/40 hover:text-white transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
