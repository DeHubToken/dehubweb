import { useCallback, useEffect, useRef, useState } from 'react';
import { readMaintenanceStatus, type MaintenanceStatus } from '@/lib/maintenance-status';

export function useMaintenanceStatus() {
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef(false);
  const pending = useRef<Promise<MaintenanceStatus | null> | null>(null);
  const check = useCallback(() => {
    if (pending.current) return pending.current;
    setChecking(true);
    pending.current = readMaintenanceStatus().then(status => {
      if (active.current) {
        if (status) setEnabled(status.enabled);
        setFailed(status === null);
        setChecking(false);
      }
      pending.current = null;
      return status;
    });
    return pending.current;
  }, []);
  useEffect(() => {
    active.current = true;
    void check();
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active.current = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);
  return { enabled, checking, failed, check };
}
