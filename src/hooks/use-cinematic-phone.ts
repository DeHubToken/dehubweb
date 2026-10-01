import { useEffect, useState } from 'react';
import { useAppTheme } from '@/contexts/ThemeContext';

const PHONE_QUERY = '(max-width: 639px)';

/**
 * True on phones in the System theme, where the feeds use the full-width
 * "cinematic" layouts (same breakpoint as the cinematic CSS in index.css).
 */
export function useCinematicPhone(): boolean {
  const { theme } = useAppTheme();
  const [isPhone, setIsPhone] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(PHONE_QUERY);
    const onChange = () => setIsPhone(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isPhone && theme === 'system';
}
