import { motion } from 'framer-motion';

interface HeroTitleProps {
  masterGlitch: boolean;
  corruptedTitle: string;
  corruptedSubtitle: string;
  title?: string;
  subtitle?: string;
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
  title = 'A New World',
  subtitle = 'Awaits'
}: HeroTitleProps) => {
  return (
    <motion.h1
      className={`font-exo text-[2.7rem] sm:text-5xl md:text-7xl lg:text-8xl font-bold uppercase tracking-wider text-white md:scale-[1.15] lg:scale-110 ${masterGlitch ? 'glitch-active' : ''}`}
      style={{ textShadow: '0 0 8px rgba(255, 255, 255, 0.7), 0 0 15px rgba(255, 255, 255, 0.5), 0 0 25px rgba(255, 255, 255, 0.5)' }}
    >
      <motion.span variants={fadeUpVariants} custom={0.5} initial="hidden" animate="visible" className="block">
        {masterGlitch ? corruptedTitle : title}
      </motion.span>
      <motion.span variants={fadeUpVariants} custom={1.5} initial="hidden" animate="visible" className="block -mt-6 md:-mt-2">
        {masterGlitch ? corruptedSubtitle : subtitle}
      </motion.span>
    </motion.h1>
  );
};
