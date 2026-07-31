/**
 * Subscribe to a CSS media query from JS.
 *
 * The editor shell decides some layout in JS as well as CSS (which panel is
 * mounted, not merely which is visible), and those two decisions have to agree.
 * Reading the same breakpoint through matchMedia is how they stay in step.
 */
import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
