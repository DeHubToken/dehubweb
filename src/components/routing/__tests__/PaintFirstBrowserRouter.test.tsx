import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { PaintFirstBrowserRouter } from '../PaintFirstBrowserRouter';

let navigate!: ReturnType<typeof useNavigate>;
function Probe() {
  navigate = useNavigate();
  const location = useLocation();
  const type = useNavigationType();
  return <div data-testid="where">{`${location.pathname}${location.search}|${type}`}</div>;
}

const frames: FrameRequestCallback[] = [];
beforeEach(() => {
  window.history.replaceState(null, '', '/app');
  vi.useFakeTimers();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { frames.push(cb); return frames.length; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});
afterEach(() => {
  frames.length = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.getElementById('dehub-navigation-pending')?.remove();
});

const flushFrame = () => act(() => { frames.splice(0).forEach(cb => cb(0)); vi.runAllTimers(); });
const pending = () => document.querySelector('[data-navigation-pending]');

function renderApp() {
  render(
    <PaintFirstBrowserRouter>
      <Routes><Route path="*" element={<Probe />} /></Routes>
    </PaintFirstBrowserRouter>,
  );
}

it('paints the logo before rendering the next page, then takes it down', () => {
  renderApp();
  expect(screen.getByTestId('where').textContent).toBe('/app|POP');
  act(() => navigate('/someone'));
  expect(window.location.pathname).toBe('/someone');
  expect(pending()).not.toBeNull();
  expect(screen.getByTestId('where').textContent).toBe('/app|POP');
  flushFrame();
  expect(screen.getByTestId('where').textContent).toBe('/someone|PUSH');
  expect(pending()).toBeNull();
  expect(window.history.state).toMatchObject({ idx: 1 });
});

it('applies replaces and same-page changes at once', () => {
  renderApp();
  act(() => navigate('/app?tab=videos'));
  expect(screen.getByTestId('where').textContent).toBe('/app?tab=videos|PUSH');
  expect(pending()).toBeNull();
  act(() => navigate('/other', { replace: true }));
  expect(screen.getByTestId('where').textContent).toBe('/other|REPLACE');
});

it('shows the logo on Back too', () => {
  renderApp();
  act(() => navigate('/someone'));
  flushFrame();
  window.history.replaceState({ idx: 0, key: 'default', usr: null }, '', '/app');
  act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
  expect(pending()).not.toBeNull();
  flushFrame();
  expect(screen.getByTestId('where').textContent).toBe('/app|POP');
  expect(pending()).toBeNull();
});
