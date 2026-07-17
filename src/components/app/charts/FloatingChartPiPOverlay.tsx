/**
 * Floating Chart PiP Overlay
 * ===========================
 * Renders all active floating chart PiP widgets.
 * Placed at app root level so charts persist across navigation.
 */

import { useChartPiP } from '@/contexts/ChartPiPContext';
import { FloatingChartPiP } from './FloatingChartPiP';
import { AnimatePresence } from 'framer-motion';

export function FloatingChartPiPOverlay() {
  const { chartPiPs, removeChartPiP, updateChartPiP } = useChartPiP();

  if (chartPiPs.length === 0) return null;

  return (
    <AnimatePresence>
      {chartPiPs.map((item, index) => (
        <FloatingChartPiP
          key={item.id}
          item={item}
          index={index}
          onClose={removeChartPiP}
          onUpdate={updateChartPiP}
        />
      ))}
    </AnimatePresence>
  );
}
