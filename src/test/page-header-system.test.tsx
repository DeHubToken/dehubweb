import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageHeader } from '@/components/app/PageHeader';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  key: 'feed-entry',
  theme: 'immersive',
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => ({ key: mocks.key }),
}));
vi.mock('@/contexts/ThemeContext', () => ({ useAppTheme: () => ({ theme: mocks.theme }) }));
vi.mock('@/contexts/SidebarCollapseContext', () => ({ useSidebarCollapse: () => ({ isCollapsed: false }) }));

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.key = 'feed-entry';
  mocks.theme = 'immersive';
  window.history.replaceState({ idx: 1 }, '');
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '');
});

describe('Immersive page navigation', () => {
  it('uses a back control without the old title bar and preserves page actions', () => {
    const options = vi.fn();
    render(<PageHeader title="Profile" rightActions={<button onClick={options}>Options</button>} />);
    expect(screen.queryByRole('heading', { name: 'Profile' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(mocks.navigate).toHaveBeenCalledWith(-1);
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    expect(options).toHaveBeenCalledOnce();
  });

  it('returns directly opened profiles to the feed', () => {
    mocks.key = 'default';
    window.history.replaceState({ idx: 0 }, '');
    render(<PageHeader overlay />);
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/app', { replace: true });
  });

  it.each(['system', 'minimal', 'osaka'])('leaves a canonicalized direct profile in %s', (theme) => {
    mocks.theme = theme;
    // A canonical URL replacement has a new key, but no previous router entry.
    mocks.key = 'canonical-profile';
    window.history.replaceState({ idx: 0, key: mocks.key }, '');
    render(<PageHeader overlay />);
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/app', { replace: true });
  });

  it('falls back when history does not contain a router index', () => {
    window.history.replaceState({}, '');
    render(<PageHeader overlay fallbackRoute="/app/explore" />);
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/app/explore', { replace: true });
  });

  it('uses the supplied close action when a surface owns its navigation', () => {
    const close = vi.fn();
    render(<PageHeader overlay onBack={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(close).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it.each(['minimal', 'cosmic'])('retains the page title in %s', (theme) => {
    mocks.theme = theme;
    render(<PageHeader title="Profile" />);
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
  });
});
