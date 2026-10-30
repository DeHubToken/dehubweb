import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MagneticDockEntry } from './MagneticDockEntry';

const state = vi.hoisted(() => ({ authenticated: true, loading: false, pathname: '/app', cover: false, mobile: true, play: vi.fn(() => vi.fn()) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: state.authenticated, isLoading: state.loading, requiresUsername: false }) }));
vi.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: state.pathname }) }));
vi.mock('@/lib/magnetic-dock', () => ({ playMagneticDock: state.play }));
vi.mock('@/lib/mobile-boot-cover', () => ({ takeMobileBootCover: () => { const visible = state.cover; state.cover = false; return visible; } }));
beforeEach(() => {
  state.authenticated = true; state.loading = false; state.pathname = '/app'; state.cover = false; state.mobile = true;
  state.play.mockClear();
  vi.stubGlobal('matchMedia', () => ({ matches: state.mobile }));
  document.body.innerHTML = '<div id="app-root"></div>';
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

it('never starts a loader over an already-ready page, including returning home', () => {
  const view = render(<MagneticDockEntry />);
  state.pathname = '/app/messages'; view.rerender(<MagneticDockEntry />);
  state.pathname = '/app'; view.rerender(<MagneticDockEntry />);
  view.unmount(); render(<MagneticDockEntry />);
  expect(state.play).not.toHaveBeenCalled();
});
it('does not replay after signing in during the session', () => {
  state.authenticated = false;
  const view = render(<MagneticDockEntry />);
  state.authenticated = true; view.rerender(<MagneticDockEntry />);
  expect(state.play).not.toHaveBeenCalled();
});
it('docks an existing slow-start cover only on mobile', () => {
  state.cover = true;
  const view = render(<MagneticDockEntry />);
  expect(state.play).toHaveBeenCalledTimes(1);
  view.unmount(); state.cover = true; state.mobile = false;
  render(<MagneticDockEntry />);
  expect(state.play).toHaveBeenCalledTimes(1);
});
