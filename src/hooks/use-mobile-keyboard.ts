import { useState, useEffect } from 'react';

/**
 * Hook to detect when the mobile virtual keyboard is visible
 * Uses visualViewport API and falls back to window resize detection
 */
export function useMobileKeyboard() {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    // Only run on mobile devices
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile) return;

    const threshold = 150; // Minimum height difference to consider keyboard open

    // Use visualViewport API if available (more reliable)
    if (window.visualViewport) {
      const viewport = window.visualViewport;
      const initialHeight = viewport.height;

      const handleResize = () => {
        const heightDiff = initialHeight - viewport.height;
        setIsKeyboardOpen(heightDiff > threshold);
      };

      viewport.addEventListener('resize', handleResize);
      return () => viewport.removeEventListener('resize', handleResize);
    }

    // Fallback for older browsers
    const initialHeight = window.innerHeight;

    const handleResize = () => {
      const heightDiff = initialHeight - window.innerHeight;
      setIsKeyboardOpen(heightDiff > threshold);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isKeyboardOpen;
}
