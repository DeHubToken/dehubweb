/**
 * The tip button's gem. Plain outline until this viewer tips the post, then it
 * turns into a filled diamond that swirls once and throws a ring of sparkles —
 * the same acknowledgement a reaction gets, so a tip never lands silently.
 */
import { motion, useReducedMotion } from 'framer-motion';
import { Gem, Sparkle } from 'lucide-react';

const SPARKLES = [0, 60, 120, 180, 240, 300].map((angle, i) => {
  const r = (angle * Math.PI) / 180;
  const d = i % 2 ? 15 : 19;
  return { x: Math.cos(r) * d, y: Math.sin(r) * d, size: i % 2 ? 6 : 8, delay: i * 0.035 };
});

export function TipGemIcon({ tipped, burstKey }: { tipped: boolean; burstKey: number }) {
  const reduceMotion = useReducedMotion();
  if (!tipped) return <Gem className="w-[17px] h-[17px] text-white" />;

  return (
    <span className="relative inline-flex w-[17px] h-[17px]">
      <motion.span
        key={`gem-${burstKey}`}
        className="inline-flex"
        initial={reduceMotion ? false : { rotate: -200, scale: 0.4 }}
        animate={reduceMotion ? {} : { rotate: [-200, 20, 0], scale: [0.4, 1.35, 1] }}
        transition={{ duration: 0.75, times: [0, 0.65, 1], ease: [0.22, 1, 0.36, 1] }}
      >
        <Gem className="w-[17px] h-[17px] fill-cyan-400 text-cyan-200 drop-shadow-[0_0_6px_rgba(34,211,238,0.7)]" />
      </motion.span>
      {!reduceMotion && SPARKLES.map((s, i) => (
        <motion.span
          key={`${burstKey}-${i}`}
          className="pointer-events-none absolute left-1/2 top-1/2"
          style={{ marginLeft: -s.size / 2, marginTop: -s.size / 2 }}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0, rotate: 0 }}
          animate={{
            opacity: [0, 1, 0],
            // Curve outward while turning, so the ring reads as a swirl.
            x: [0, s.y * 0.6, s.x],
            y: [0, -s.x * 0.6, s.y],
            scale: [0, 1.2, 0.4],
            rotate: [0, 180, 360],
          }}
          transition={{ duration: 0.8, delay: 0.15 + s.delay, ease: 'easeOut' }}
        >
          <Sparkle className="fill-cyan-200 text-cyan-100" style={{ width: s.size, height: s.size }} />
        </motion.span>
      ))}
    </span>
  );
}
