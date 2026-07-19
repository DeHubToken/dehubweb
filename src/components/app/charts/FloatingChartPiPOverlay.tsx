/**
 * Floating Chart PiP Overlay
 * ===========================
 * Renders all active floating chart PiP widgets.
 * Placed at app root level so charts persist across navigation.
 */

import { lazy, Suspense } from 'react';
import { useChartPiP } from '@/contexts/ChartPiPContext';
import { AnimatePresence } from 'framer-motion';

// Lazy: FloatingChartPiP drags recharts (+lodash, ~500 kB raw) into whatever
// chunk imports it — and this overlay is mounted eagerly from AppLayout. The
// chart code only downloads when a chart is actually popped out.
const FloatingChartPiP = lazy(() =>
  import('./FloatingChartPiP').then(m => ({ default: m.FloatingChartPiP }))
);

export function FloatingChartPiPOverlay() {
  const { chartPiPs, removeChartPiP, updateChartPiP } = useChartPiP();

  if (chartPiPs.length === 0) return null;

  return (
    <Suspense fallback={null}>
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
    </Suspense>
  );
}
