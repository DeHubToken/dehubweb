import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { clearTapPendingLogo } from '@/lib/tap-pending-logo';

/** Takes the press logo down as soon as the new page has committed. */
export function TapPendingLogoBridge() {
  const { key } = useLocation();
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    clearTapPendingLogo();
  }, [key]);
  return null;
}
