import { lazy, Suspense } from 'react';
import { useCall } from '@/contexts/CallContext';

const VoiceCallModal = lazy(() => import('./VoiceCallModal'));
const VideoCallModal = lazy(() => import('./VideoCallModal'));
const CallMiniPlayer = lazy(() => import('./CallMiniPlayer').then(m => ({ default: m.CallMiniPlayer })));

/** Keep incoming coordination mounted; download call surfaces only for a call. */
export function CallModalsHost() {
  const { currentCall, isMinimized } = useCall();
  if (!currentCall) return null;
  return <Suspense fallback={null}>
    {isMinimized ? <CallMiniPlayer /> : currentCall.call_type === 'video' ? <VideoCallModal /> : <VoiceCallModal />}
  </Suspense>;
}
