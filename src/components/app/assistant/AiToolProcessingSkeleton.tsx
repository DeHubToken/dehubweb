/**
 * AI Tool Processing Skeleton
 * ============================
 * Animated skeleton that mimics a music/audio player with a progress bar,
 * shimmer effect, and percentage counter. Renders while AI tools process.
 */

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { MarkdownText } from '@/lib/markdown';

interface AiToolProcessingSkeletonProps {
  content: string;
  /** Estimated total processing time in seconds (default 60) */
  estimatedSeconds?: number;
}

export function AiToolProcessingSkeleton({
  content,
  estimatedSeconds = 60,
}: AiToolProcessingSkeletonProps) {
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      // Ease-out curve that approaches but never reaches 95%
      const pct = Math.min(95, 95 * (1 - Math.exp(-2.5 * elapsed / estimatedSeconds)));
      setProgress(pct);
    }, 200);
    return () => clearInterval(interval);
  }, [estimatedSeconds]);

  const barCount = 32;

  return (
    <div className="max-w-[85%] flex flex-col gap-2">
      {/* Status text */}
      <div className="bg-white/10 text-white rounded-2xl px-4 py-2.5">
        <MarkdownText content={content} className="text-sm" />
      </div>

      {/* Skeleton music player */}
      <div className="rounded-2xl overflow-hidden bg-white/5 border border-white/10 backdrop-blur-xl p-4 space-y-3">
        {/* Top row: play button skeleton + title skeleton */}
        <div className="flex items-center gap-3">
          {/* Play button skeleton */}
          <div className="w-10 h-10 rounded-full bg-white/10 shimmer-skeleton shrink-0" />
          {/* Title + artist */}
          <div className="flex-1 space-y-2">
            <div className="h-3 w-3/4 rounded-full bg-white/10 shimmer-skeleton" />
            <div className="h-2.5 w-1/2 rounded-full bg-white/8 shimmer-skeleton" style={{ animationDelay: '0.15s' }} />
          </div>
        </div>

        {/* Waveform bars — reveals left-to-right based on progress */}
        <div className="flex items-end gap-[2px] h-10 px-1">
          {Array.from({ length: barCount }).map((_, i) => {
            const barProgress = (i / barCount) * 100;
            const isRevealed = barProgress < progress;
            // Deterministic pseudo-random height
            const seed = Math.sin(i * 127.1 + 311.7) * 43758.5453;
            const h = 12 + (seed - Math.floor(seed)) * 28;

            return (
              <motion.div
                key={i}
                className="flex-1 rounded-full"
                initial={{ height: 4, opacity: 0.15 }}
                animate={{
                  height: isRevealed ? h : 4 + Math.random() * 6,
                  opacity: isRevealed ? 0.8 : 0.15,
                  backgroundColor: isRevealed
                    ? 'rgba(255,255,255,0.7)'
                    : 'rgba(255,255,255,0.15)',
                }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            );
          })}
        </div>

        {/* Progress bar + percentage */}
        <div className="space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-white/60 to-white/30"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3, ease: 'linear' }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/30 tabular-nums">0:00</span>
            <span className="text-xs text-white/50 font-medium tabular-nums">
              {Math.round(progress)}%
            </span>
            <span className="text-[10px] text-white/30 tabular-nums">--:--</span>
          </div>
        </div>

        {/* Bottom controls skeleton */}
        <div className="flex items-center justify-center gap-4 pt-1">
          <div className="w-6 h-6 rounded bg-white/8 shimmer-skeleton" />
          <div className="w-8 h-8 rounded-lg bg-white/10 shimmer-skeleton" />
          <div className="w-6 h-6 rounded bg-white/8 shimmer-skeleton" />
        </div>
      </div>

      <style>{`
        .shimmer-skeleton {
          position: relative;
          overflow: hidden;
        }
        .shimmer-skeleton::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255,255,255,0.08) 50%,
            transparent 100%
          );
          animation: shimmer 1.8s infinite;
        }
        @keyframes shimmer {
          0% { left: -100%; }
          100% { left: 200%; }
        }
      `}</style>
    </div>
  );
}
