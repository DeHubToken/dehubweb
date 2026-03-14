import { useState, useEffect, useRef } from 'react';
import { GLITCH_CHARS, TIMING } from '@/config/hero-config';

export interface GlitchState {
  masterGlitch: boolean;
  corruptedTitle: string;
  corruptedSubtitle: string;
  showPixelCorruption: boolean;
}

export const useGlitchEffect = (title: string = 'Welcome To', subtitle: string = 'Our World') => {
  const [masterGlitch, setMasterGlitch] = useState(false);
  const [corruptedTitle, setCorruptedTitle] = useState(title);
  const [corruptedSubtitle, setCorruptedSubtitle] = useState(subtitle);
  const [showPixelCorruption, setShowPixelCorruption] = useState(false);
  const glitchTimerRef = useRef<NodeJS.Timeout>();
  const cycleIntervalRef = useRef<NodeJS.Timeout>();
  const endGlitchTimerRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const corruptText = (text: string) => {
      const chars = text.split('');
      return chars.map(char => {
        if (Math.random() < 0.3 && char !== ' ') {
          return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
        }
        return char;
      }).join('');
    };

    const scheduleMasterGlitch = () => {
      glitchTimerRef.current = setTimeout(() => {
        // Start glitch
        setMasterGlitch(true);
        setShowPixelCorruption(true);

        // Corrupt title and subtitle
        setCorruptedTitle(corruptText(title));
        setCorruptedSubtitle(corruptText(subtitle));

        // Rapid cycling of values
        let cycleCount = 0;
        cycleIntervalRef.current = setInterval(() => {
          cycleCount++;
          setCorruptedTitle(corruptText(title));
          setCorruptedSubtitle(corruptText(subtitle));

          if (cycleCount >= 6) {
            if (cycleIntervalRef.current) {
              clearInterval(cycleIntervalRef.current);
            }
          }
        }, 50);

        // End glitch
        endGlitchTimerRef.current = setTimeout(() => {
          setMasterGlitch(false);
          setShowPixelCorruption(false);
          setCorruptedTitle(title);
          setCorruptedSubtitle(subtitle);
        }, TIMING.GLITCH_DURATION);

        // Schedule next glitch
        scheduleMasterGlitch();
      }, TIMING.GLITCH_INTERVAL);
    };

    scheduleMasterGlitch();

    return () => {
      if (glitchTimerRef.current) {
        clearTimeout(glitchTimerRef.current);
      }
      if (cycleIntervalRef.current) {
        clearInterval(cycleIntervalRef.current);
      }
      if (endGlitchTimerRef.current) {
        clearTimeout(endGlitchTimerRef.current);
      }
    };
  }, [title, subtitle]);

  return {
    masterGlitch,
    corruptedTitle,
    corruptedSubtitle,
    showPixelCorruption,
  };
};
