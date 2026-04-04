import { motion } from 'framer-motion';
import { SOCIAL_LINKS } from '@/config/hero-config';

const fadeUpVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i,
      duration: 1.5,
      ease: [0.23, 0.86, 0.39, 0.96] as [number, number, number, number],
    },
  }),
};

const cursorStyle = {
  cursor:
    "url(\"data:image/svg+xml,%3Csvg width='12' height='12' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='12' height='12' fill='white' fill-opacity='0.9' /%3E%3C/svg%3E\") 6 6, auto",
};

const iconClass =
  'w-9 h-9 md:w-9 md:h-9 [filter:drop-shadow(0_0_8px_rgba(255,255,255,0.6))]';

/** Inline SVGs avoid ~700KB+ of oversized PNGs (trace: ImageDelivery insight). */
const SocialIcon = ({ icon }: { icon: string }) => {
  const svgProps = {
    className: iconClass,
    viewBox: '0 0 24 24',
    fill: 'currentColor',
    'aria-hidden': true as const,
  };

  switch (icon) {
    case 'send':
      return (
        <svg {...svgProps}>
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      );
    case 'twitter':
      return (
        <svg {...svgProps}>
          <path d="M18.244 2.25h3.48l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case 'instagram':
      return (
        <svg {...svgProps}>
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 1-2.881 0 1.44 1.44 0 0 1 2.881 0z" />
        </svg>
      );
    case 'music':
      return (
        <svg {...svgProps}>
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.01-1-.01-1.49.18-1.89 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48.04 2.96.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
        </svg>
      );
    case 'scroll':
      return (
        <div
          className="w-9 h-9 md:w-9 md:h-9 flex items-center justify-center -translate-y-[2px] [filter:drop-shadow(0_0_8px_rgba(255,255,255,0.6))]"
          style={{ fontSize: '32px' }}
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
      className="mt-[30px] md:mt-9 ml-[-5px] md:ml-0 flex items-center justify-center gap-6 md:gap-7 md:translate-y-0 text-white"
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
