import { useState, useEffect } from "react";
import { X } from "lucide-react";
import googlePlayBadge from "@/assets/google-play-badge.png";

export function DevelopmentNoticeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const hasSeenNotice = sessionStorage.getItem("dev-notice-seen");
    if (!hasSeenNotice) {
      setOpen(true);
    }
  }, []);

  const handleClose = () => {
    sessionStorage.setItem("dev-notice-seen", "true");
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mx-4 max-w-sm w-full shadow-2xl">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="text-center pt-2">
          <h2 className="text-xl font-bold text-white mb-3">Under Development</h2>
          <p className="text-zinc-400 text-sm leading-relaxed mb-6">
            This webapp is currently under development. Download DeHub on Google Play today for the full experience. Apple listings coming soon!
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
            className="block w-full py-3 text-sm text-zinc-500 hover:text-white transition-colors"
          >
            Continue to webapp
          </button>
        </div>
      </div>
    </div>
  );
}
