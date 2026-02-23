import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import googlePlayBadge from '@/assets/google-play-badge.png';
import appStoreBadge from '@/assets/app-store-badge.svg';

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

export const AppStoreButtons = () => {
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
      className="mt-8 -translate-y-[53px] md:translate-y-0 md:-ml-[18px] flex flex-col sm:flex-row justify-center items-center gap-4"
    >
      <a
        href="https://play.google.com/store/apps/details?id=io.dehub.mobile&hl"
        target="_blank"
        rel="noopener noreferrer"
        className="transition-transform hover:scale-105"
        style={cursorStyle}
      >
        <img 
          src={googlePlayBadge} 
          alt="Get it on Google Play" 
          className="h-[135px] md:h-[94.5px] w-auto"
          style={{ filter: 'drop-shadow(0 0 12px rgba(255, 255, 255, 0.5))' }}
        />
      </a>
      <button
        onClick={handleAppStoreClick}
        className="transition-transform hover:scale-105 -translate-y-[25px] md:translate-y-0"
        style={cursorStyle}
      >
        <img 
          src={appStoreBadge} 
          alt="Download on the App Store" 
          className="h-[101px] md:h-[65.34px] w-auto"
          style={{ filter: 'drop-shadow(0 0 12px rgba(255, 255, 255, 0.5))' }}
        />
      </button>
    </motion.div>
  );
};
