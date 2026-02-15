import { motion } from 'framer-motion';

interface HeroTitleProps {
  masterGlitch: boolean;
  corruptedTitle: string;
  corruptedSubtitle: string;
  title?: string;
  subtitle?: string;
  className?: string;
}

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

export const HeroTitle = ({
  masterGlitch,
  corruptedTitle,
  corruptedSubtitle,
  className = '',
  title = 'A New World',
  subtitle = 'Awaits'
}: HeroTitleProps) => {
  // Split title for mobile 3-line layout
  const titleWords = title.split(' ');
  const mobileLine1 = titleWords.slice(0, 2).join(' '); // "A New"
  const mobileLine2 = titleWords.slice(2).join(' '); // "World"

  return (
    <motion.h1
      className={`font-exo text-[4.6rem] sm:text-5xl md:text-7xl lg:text-8xl font-bold uppercase tracking-wider text-white md:scale-[1.15] lg:scale-110 translate-y-[30px] sm:translate-y-0 ${masterGlitch ? 'glitch-active' : ''} ${className}`}
      style={{ textShadow: '0 0 8px rgba(255, 255, 255, 0.7), 0 0 15px rgba(255, 255, 255, 0.5), 0 0 25px rgba(255, 255, 255, 0.5)' }}
    >
      {/* Mobile: 3 lines */}
      <motion.span variants={fadeUpVariants} custom={0.5} initial="hidden" animate="visible" className="block sm:hidden -mt-8">
        {masterGlitch ? corruptedTitle.split(' ').slice(0, 2).join(' ') : mobileLine1}
      </motion.span>
      <motion.span variants={fadeUpVariants} custom={0.8} initial="hidden" animate="visible" className="block sm:hidden -mt-6">
        {masterGlitch ? corruptedTitle.split(' ').slice(2).join(' ') : mobileLine2}
      </motion.span>
      <motion.span variants={fadeUpVariants} custom={1.1} initial="hidden" animate="visible" className="block sm:hidden -mt-6">
        {masterGlitch ? corruptedSubtitle : subtitle}
      </motion.span>

      {/* Tablet/Desktop: 2 lines */}
      <motion.span variants={fadeUpVariants} custom={0.5} initial="hidden" animate="visible" className="hidden sm:block">
        {masterGlitch ? corruptedTitle : title}
      </motion.span>
      <motion.span variants={fadeUpVariants} custom={1.5} initial="hidden" animate="visible" className="hidden sm:block -mt-6 md:-mt-2">
        {masterGlitch ? corruptedSubtitle : subtitle}
      </motion.span>
    </motion.h1>
  );
};