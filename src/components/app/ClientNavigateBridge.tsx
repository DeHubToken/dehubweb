import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setClientNavigate } from '@/lib/client-navigate';

/**
 * Publishes the router's `navigate` to lib/client-navigate so code rendered
 * outside React — post bodies, mostly — can route without touching
 * `history.pushState` itself. Renders nothing; mount once inside the router.
 */
export function ClientNavigateBridge(): null {
  const navigate = useNavigate();

  useEffect(() => {
    setClientNavigate(navigate);
    return () => setClientNavigate(null);
  }, [navigate]);

  return null;
}
