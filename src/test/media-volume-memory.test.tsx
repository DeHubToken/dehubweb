import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { getMediaVolume, getVideoPreferences, setVolume, setMediaMuted, useMediaVolume, useMediaMuted } from '@/lib/video-preferences';
function Player({ name }: { name: string }) {
  const volume = useMediaVolume(), muted = useMediaMuted();
  return <output data-player={name}>{volume}:{String(muted)}</output>;
}
it('updates already-mounted posts and seeds the next post without waiting for storage', () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
  act(() => root.render(<><Player name="video" /><Player name="audio" /></>));
  act(() => { setVolume(0.23); setMediaMuted(false); });
  expect([...node.querySelectorAll('output')].map(x => x.textContent)).toEqual(['0.23:false', '0.23:false']);
  act(() => root.render(<><Player name="video" /><Player name="audio" /><Player name="next" /></>));
  expect(node.querySelector('[data-player="next"]')?.textContent).toBe('0.23:false');
  act(() => setMediaMuted(true));
  expect([...node.querySelectorAll('output')].map(x => x.textContent)).toEqual(['0.23:true', '0.23:true', '0.23:true']);
  expect(getMediaVolume()).toBe(0.23);
  act(() => { setVolume(0); setMediaMuted(false); });
  expect(node.querySelector('[data-player="next"]')?.textContent).toBe('0:false');
  act(() => root.unmount()); node.remove();
});
it('persists the level and mute choice when leaving the page', () => {
  setVolume(0.31); setMediaMuted(true); window.dispatchEvent(new Event('pagehide'));
  const saved = JSON.parse(localStorage.getItem('video-preferences')!);
  expect(saved.volume).toBe(0.31); expect(saved.mediaMuted).toBe(true);
  expect(getVideoPreferences().volume).toBe(0.31);
});
it('clamps volume adjustments to the player range', () => {
  setVolume(2); expect(getMediaVolume()).toBe(1);
  setVolume(-1); expect(getMediaVolume()).toBe(0);
});
