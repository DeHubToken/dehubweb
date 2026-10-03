import { useEffect, useState } from 'react';
import { useCall } from '@/contexts/CallContext';
import { formatCallDuration } from '@/lib/call-duration';
import { visualActivity } from '@/lib/visual-activity';
import { useSyncExternalStore } from 'react';

export function CallDuration({ fallback }: { fallback: string }) {
  const { callStartedAt } = useCall();
  const active = useSyncExternalStore(visualActivity.subscribe, visualActivity.isForeground, () => true);
  const [, tick] = useState(0);
  useEffect(() => {
    if (callStartedAt == null || !active) return;
    const interval = setInterval(() => tick(previous => previous + 1), 1000);
    return () => clearInterval(interval);
  }, [callStartedAt, active]);
  return <>{callStartedAt == null ? fallback : formatCallDuration(callStartedAt)}</>;
}

