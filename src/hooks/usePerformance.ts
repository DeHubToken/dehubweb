
import { useEffect } from 'react';

// Simple performance monitoring
export const usePerformance = () => {
  useEffect(() => {
    // Track page load performance
    if (typeof window !== 'undefined' && 'performance' in window) {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'navigation') {
            const navEntry = entry as PerformanceNavigationTiming;
            console.log('Navigation timing:', {
              domContentLoaded: navEntry.domContentLoadedEventEnd - navEntry.domContentLoadedEventStart,
              loadComplete: navEntry.loadEventEnd - navEntry.loadEventStart,
              totalTime: navEntry.loadEventEnd - navEntry.fetchStart,
            });
          }
        });
      });

      observer.observe({ entryTypes: ['navigation'] });

      // Track Core Web Vitals if supported
      if ('web-vitals' in window) {
        // This would require the web-vitals library, but for now we'll use basic timing
        console.log('Performance monitoring active');
      }

      return () => {
        observer.disconnect();
      };
    }
  }, []);
};
