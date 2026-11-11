import { cleanup, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthGate } from './AuthGate';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
import { __resetAfterSignInForTests, noteSignedOut, takeSheetAfterLeave } from '@/lib/after-sign-in';

const auth = vi.hoisted(() => ({
  openLoginModal: vi.fn(), isLoading: false, isAuthenticated: false,
}));
const sheet = vi.hoisted(() => ({ isLoginModalOpen: false }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth, useLoginSheet: () => sheet }));

let here = '';
function Where() {
  here = useLocation().pathname;
  return null;
}

function renderAt(path: string, active = true) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Where />
      <Routes>
        <Route path="/" element={<div>home</div>} />
        <Route
          path="/app/notifications"
          element={<CachedPageActiveContext.Provider value={active}><AuthGate /></CachedPageActiveContext.Provider>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetAfterSignInForTests();
  auth.isLoading = false;
  auth.isAuthenticated = false;
  sheet.isLoginModalOpen = false;
  here = '';
});
afterEach(cleanup);

it('shows no "Log in required" screen: steps home and asks for the sheet with this page to follow', () => {
  const view = renderAt('/app/notifications');
  expect(view.queryByRole('button')).toBeNull();
  expect(view.queryByText(/log in required/i)).toBeNull();
  expect(here).toBe('/');
  expect(takeSheetAfterLeave('/')).toBe('/app/notifications');
});

it('waits while auth is still loading', () => {
  auth.isLoading = true;
  renderAt('/app/notifications');
  expect(here).toBe('/app/notifications');
  expect(takeSheetAfterLeave('/')).toBeNull();
});

it('does nothing for a cached page in the background', () => {
  renderAt('/app/notifications', false);
  expect(here).toBe('/app/notifications');
});

it('leaves quietly after a sign-out instead of asking them straight back in', () => {
  noteSignedOut();
  renderAt('/app/notifications');
  expect(here).toBe('/');
  expect(takeSheetAfterLeave('/')).toBeNull();
});

it('leaves a sheet that is already up alone', () => {
  sheet.isLoginModalOpen = true;
  renderAt('/app/notifications');
  expect(here).toBe('/app/notifications');
});
