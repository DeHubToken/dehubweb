"use client";

import { useLocation, Link } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { useEffect } from "react";
import { motion } from "framer-motion";
import { WarningGraphic } from "@/components/ui/warning-graphic";

const NotFound = () => {
  const { t } = useTranslation();
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  const fadeUpVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.2 + 0.5,
        duration: 1,
        ease: [0.23, 0.86, 0.39, 0.96] as [number, number, number, number],
      },
    }),
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      {/* Content */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4">
        {/* Warning graphic */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mb-8"
        >
          <WarningGraphic
            width={400}
            height={130}
            color="#ffffff"
            animationSpeed={1.2}
          />
        </motion.div>

        <motion.h1
          custom={0}
          variants={fadeUpVariants}
          initial="hidden"
          animate="visible"
          className="mb-4 text-[100px] sm:text-[140px] md:text-[180px] font-black tracking-tighter leading-none"
          style={{
            fontFamily: "'Exo', sans-serif",
            color: 'white',
            textShadow: '0 0 20px rgba(255, 255, 255, 0.3), 0 0 40px rgba(255, 255, 255, 0.15)',
          }}
        >
          404
        </motion.h1>

        <motion.p
          custom={1}
          variants={fadeUpVariants}
          initial="hidden"
          animate="visible"
          className="mb-8 text-xl sm:text-2xl md:text-3xl font-bold tracking-widest uppercase"
          style={{
            fontFamily: "'Exo', sans-serif",
            color: 'rgba(255, 255, 255, 0.7)',
            textShadow: '0 0 10px rgba(255, 255, 255, 0.2)',
          }}
        >
          {t('notFound.title')}
        </motion.p>

        <motion.div
          custom={2}
          variants={fadeUpVariants}
          initial="hidden"
          animate="visible"
        >
          <Link
            to="/"
            className="group relative inline-flex items-center gap-2 px-8 py-4 text-lg font-bold uppercase tracking-wider transition-all duration-300 hover:scale-105"
            style={{
              fontFamily: "'Exo', sans-serif",
              color: 'white',
              textShadow: '0 0 10px rgba(255, 255, 255, 0.3)',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              background: 'rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <span className="relative z-10">{t('notFound.returnHome')}</span>
            <div className="absolute inset-0 bg-white/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          </Link>
        </motion.div>
      </div>
    </div>
  );
};

export default NotFound;
