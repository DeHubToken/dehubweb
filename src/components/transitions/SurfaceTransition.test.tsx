import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { SurfaceTransition } from './SurfaceTransition';

const { t } = vi.hoisted(() => ({ t: (_: string, options: { defaultValue: string }) => options.defaultValue }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t }) }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: { div: ({ children }: { children: ReactNode }) => <div>{children}</div> },
  useReducedMotion: () => false,
}));

it('paints a destination shell without rendering the outgoing feed again', () => {
  const sourceRender = vi.fn();
  const destinationRender = vi.fn();
  const frame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  function Source() {
    useLocation();
    sourceRender();
    return <main data-main-panel>Feed</main>;
  }
  function Destination() { destinationRender(); return <main data-main-panel>Post content</main>; }
  function App() {
    const navigate = useNavigate();
    return <>
      <button onClick={() => navigate('/app/post/1')}>Open</button>
      <SurfaceTransition>{location => <Routes location={location}>
        <Route path="/app" element={<Source />} />
        <Route path="/app/post/1" element={<Destination />} />
      </Routes>}</SurfaceTransition>
    </>;
  }
  const { unmount } = render(<MemoryRouter initialEntries={['/app']}><App /></MemoryRouter>);
  try {
    expect(sourceRender).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText('Open'));
    expect(document.querySelector('.app-route-loading-shell strong')?.textContent).toBe('Post');
    expect(sourceRender).toHaveBeenCalledOnce();
    expect(destinationRender).not.toHaveBeenCalled();
  } finally {
    unmount();
    frame.mockRestore();
    cancel.mockRestore();
  }
});
