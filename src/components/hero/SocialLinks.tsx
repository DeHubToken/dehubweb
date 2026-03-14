import { motion } from 'framer-motion';
import { SOCIAL_LINKS } from '@/config/hero-config';
import tiktokLogo from '@/assets/tiktok-logo.png';
import instagramLogo from '@/assets/instagram-logo.png';
import xLogo from '@/assets/x-logo.png';
import telegramLogo from '@/assets/telegram-logo.png';

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

const iconStyle = { filter: 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.6))' };

const SocialIcon = ({ icon }: { icon: string }) => {
  switch (icon) {
    case 'send':
      return (
        <img 
          src={telegramLogo}
          alt="Telegram"
          className="w-9 h-9 md:w-9 md:h-9"
          style={iconStyle}
        />
      );
    case 'twitter':
      return (
        <img 
          src={xLogo}
          alt="X (Twitter)"
          className="w-9 h-9 md:w-9 md:h-9"
          style={iconStyle}
        />
      );
    case 'instagram':
      return (
        <img 
          src={instagramLogo}
          alt="Instagram"
          className="w-9 h-9 md:w-9 md:h-9"
          style={iconStyle}
        />
      );
    case 'music':
      return (
        <img 
          src={tiktokLogo}
          alt="TikTok"
          className="w-9 h-9 md:w-9 md:h-9"
          style={iconStyle}
        />
      );
    case 'scroll':
      return (
        <div 
          className="w-9 h-9 md:w-9 md:h-9 flex items-center justify-center -translate-y-[2px]"
          style={{ fontSize: '32px', ...iconStyle }}
        >
          <span className="md:text-[32px]">📜</span>
        </div>
      );
    default:
      return null;
  }
};

export const SocialLinks = () => {
  return (
    <motion.div
      variants={fadeUpVariants}
      custom={2.5}
      initial="hidden"
      animate="visible"
      className="mt-[30px] md:mt-9 ml-[-5px] md:ml-0 flex items-center justify-center gap-6 md:gap-7 md:translate-y-0"
    >
      {SOCIAL_LINKS.map((social, idx) => (
        <a
          key={idx}
          href={social.url}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-transform hover:scale-110"
          style={cursorStyle}
          aria-label={social.label}
        >
          <SocialIcon icon={social.icon} />
        </a>
      ))}
    </motion.div>
  );
};
