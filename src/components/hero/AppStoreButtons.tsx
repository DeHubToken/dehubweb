import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';

const fadeUpVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i,
      duration: 1.5,
      ease: [0.23, 0.86, 0.39, 0.96] as [number, number, number, number]
    },
  }),
};

const cursorStyle = { 
  cursor: 'url("data:image/svg+xml,%3Csvg width=\'12\' height=\'12\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Crect width=\'12\' height=\'12\' fill=\'white\' fill-opacity=\'0.9\' /%3E%3C/svg%3E") 6 6, auto' 
};

const glassOverride = "[&>div]:!bg-gradient-to-br [&>div]:!from-white/[0.04] [&>div]:!via-white/[0.02] [&>div]:!to-transparent [&>div]:!border-white/[0.08] [&>div]:!shadow-none [&>div]:before:!bg-none [&>div]:after:!bg-none";

// Fixed dimensions for all buttons
const btnClass = `w-full cursor-pointer ${glassOverride}`;

const GooglePlayIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none">
    <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92z" fill="#4285F4"/>
    <path d="M17.727 8.272L5.276.786a1.003 1.003 0 0 0-1.053.028L14.5 11.293l3.227-3.02z" fill="#EA4335"/>
    <path d="M17.727 15.728L14.5 12.707 4.223 23.186a1.004 1.004 0 0 0 1.053.028l12.451-7.486z" fill="#34A853"/>
    <path d="M21.398 10.558l-3.671-2.286L14.5 11.293l-.001.001.001.001 3.227 3.02 3.671-2.199a1.003 1.003 0 0 0 0-1.558z" fill="#FBBC04"/>
  </svg>
);

const AppleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="white">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
  </svg>
);

interface AppStoreButtonsProps {
  onEnterApp?: () => void;
}

export const AppStoreButtons = ({ onEnterApp }: AppStoreButtonsProps) => {
  const { t } = useTranslation();
  const handleAppStoreClick = () => {
    toast.info(t('hero.comingSoon', 'Coming Soon'), {
      description: t('hero.iosComingSoon', 'The iOS app will be available soon!'),
      duration: 3000,
    });
  };

  return (
    <motion.div 
      variants={fadeUpVariants} 
      custom={2} 
      initial="hidden" 
      animate="visible" 
      className="mt-6 -translate-y-[30px] md:translate-y-0 flex flex-col justify-center items-stretch gap-3 w-full px-4"
    >
      {/* Enter App button */}
      {onEnterApp && (
        <a href="/app" onClick={(e) => { e.preventDefault(); onEnterApp(); }} style={cursorStyle}>
          <LiquidGlassBubble shimmer className={btnClass}>
            <div className="flex items-center justify-center h-full">
              <span className="text-white text-base md:text-sm font-semibold tracking-wide">Enter App</span>
            </div>
          </LiquidGlassBubble>
        </a>
      )}

      {/* Google Play */}
      <a
        href="https://play.google.com/store/apps/details?id=io.dehub.mobile&hl"
        target="_blank"
        rel="noopener noreferrer"
        className="transition-transform hover:scale-105"
        style={cursorStyle}
      >
        <LiquidGlassBubble shimmer className={btnClass}>
          <div className="flex items-center justify-center gap-3 h-full">
            <GooglePlayIcon />
            <div className="text-left">
              <div className="text-white/60 text-[10px] md:text-[9px] uppercase tracking-wider leading-none">Get it on</div>
              <div className="text-white text-base md:text-sm font-semibold leading-tight">Google Play</div>
            </div>
          </div>
        </LiquidGlassBubble>
      </a>

      {/* App Store */}
      <button
        onClick={handleAppStoreClick}
        className="transition-transform hover:scale-105"
        style={cursorStyle}
      >
        <LiquidGlassBubble shimmer className={btnClass}>
          <div className="flex items-center justify-center gap-3 h-full">
            <AppleIcon />
            <div className="text-left">
              <div className="text-white/60 text-[10px] md:text-[9px] uppercase tracking-wider leading-none">Download on the</div>
              <div className="text-white text-base md:text-sm font-semibold leading-tight">App Store</div>
            </div>
          </div>
        </LiquidGlassBubble>
      </button>
    </motion.div>
  );
};
