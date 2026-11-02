import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { beginMobileBootWait, takeMobileBootCover } from './mobile-boot-cover';

let mobile = true;
beforeEach(() => {
  vi.useFakeTimers();
  mobile = true;
  vi.stubGlobal('matchMedia', () => ({ matches: mobile }));
  history.replaceState(null, '', '/app');
  localStorage.clear();
  localStorage.setItem('dehub_token', 'existing-session');
});
afterEach(() => {
  takeMobileBootCover();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('never shows an animation when initial dependencies load quickly', () => {
  const ready = beginMobileBootWait();
  vi.advanceTimersByTime(399);
  ready();
  vi.advanceTimersByTime(5000);
  expect(takeMobileBootCover()).toBe(false);
  expect(document.querySelector('[data-mobile-boot-cover]')).toBeNull();
});

it('hands off only an already-visible slow-start loader, exactly once', () => {
  const ready = beginMobileBootWait();
  vi.advanceTimersByTime(400);
  expect(document.querySelector('[data-mobile-boot-cover]')).not.toBeNull();
  ready();
  expect(takeMobileBootCover()).toBe(true);
  // Returning from messages, profiles, or a remounted home has no loader to claim.
  history.pushState(null, '', '/app/messages');
  expect(takeMobileBootCover()).toBe(false);
  history.pushState(null, '', '/app');
  expect(takeMobileBootCover()).toBe(false);
});

it('does not show on desktop, guest loads, or direct non-feed routes', () => {
  mobile = false;
  beginMobileBootWait()();
  mobile = true;
  localStorage.clear();
  beginMobileBootWait()();
  localStorage.setItem('dehub_token', 'existing-session');
  history.replaceState(null, '', '/app/messages');
  beginMobileBootWait()();
  vi.advanceTimersByTime(1000);
  expect(takeMobileBootCover()).toBe(false);
});

it('expires instead of replaying later after a failed startup', () => {
  const ready = beginMobileBootWait();
  vi.advanceTimersByTime(400);
  ready();
  vi.advanceTimersByTime(1500);
  expect(takeMobileBootCover()).toBe(false);
});
