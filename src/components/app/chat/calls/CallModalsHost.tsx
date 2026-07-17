import VoiceCallModal from './VoiceCallModal';
import VideoCallModal from './VideoCallModal';
import { CallMiniPlayer } from './CallMiniPlayer';

/**
 * Renders global voice/video call UI. Must be inside CallProvider.
 */
export function CallModalsHost() {
  return (
    <>
      <VoiceCallModal />
      <VideoCallModal />
      <CallMiniPlayer />
    </>
  );
}
