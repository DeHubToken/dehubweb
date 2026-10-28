import type { Socket } from 'socket.io-client';

/**
 * Bring a socket back when the viewer does. Socket.IO gives up after its
 * reconnection attempts, and a background tab can burn through them (timers
 * throttled, network suspended), leaving a live's chat and viewer count dead
 * until a refresh. Coming back to the tab, or the network coming back,
 * restarts it. A socket closed on purpose stays closed.
 */
export function reviveOnReturn(socket: Socket): void {
  if (typeof window === 'undefined') return;
  const revive = () => {
    if (document.visibilityState === 'hidden') return;
    if (!socket.connected && !socket.active) socket.connect();
  };
  const onVisibility = () => { if (document.visibilityState === 'visible') revive(); };
  const onDisconnect = (reason: string) => {
    if (reason !== 'io client disconnect') return;
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', revive);
    socket.off('disconnect', onDisconnect);
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', revive);
  socket.on('disconnect', onDisconnect);
}
