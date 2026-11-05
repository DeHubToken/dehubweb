import { describe, it, expect, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthContext } from '@/contexts/AuthContext';
import { useOwnProfileUrl } from '@/hooks/use-own-profile-url';
import {
  setOwnProfileHandle, isOwnHandlePath, isOwnProfilePath, isOwnHandle,
} from '@/lib/own-profile-path';

afterEach(() => setOwnProfileHandle(null));

describe('own profile path', () => {
  it('knows /<you> only once your handle is set, any casing', () => {
    expect(isOwnHandlePath('/MalDotEth')).toBe(false);
    setOwnProfileHandle('@maldoteth');
    expect(isOwnHandlePath('/MalDotEth')).toBe(true);
    expect(isOwnHandlePath('/maldoteth/')).toBe(true);
    expect(isOwnHandlePath('/someoneelse')).toBe(false);
    expect(isOwnProfilePath('/profile')).toBe(true);
    expect(isOwnProfilePath('/app/profile')).toBe(true);
    expect(isOwnHandle('MALDOTETH')).toBe(true);
  });

  it('ignores wallet addresses as handles', () => {
    setOwnProfileHandle('0x1234567890abcdef1234567890abcdef12345678');
    expect(isOwnHandlePath('/0x1234567890abcdef1234567890abcdef12345678')).toBe(false);
  });
});

function Where() {
  useOwnProfileUrl();
  const l = useLocation();
  return <span data-testid="at">{l.pathname + l.search + l.hash}</span>;
}

function renderAt(url: string, username: string | null, isAuthenticated = true) {
  const auth = { isAuthenticated, user: username ? { username } : null } as never;
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[url]}>
        <Routes><Route path="*" element={<Where />} /></Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('useOwnProfileUrl', () => {
  it('swaps /profile for /<you>, keeping the tab', async () => {
    const r = renderAt('/profile?tab=videos#x', 'maldoteth');
    await waitFor(() => expect(r.getByTestId('at').textContent).toBe('/maldoteth?tab=videos#x'));
  });
  it('swaps /app/profile too', async () => {
    const r = renderAt('/app/profile', 'maldoteth');
    await waitFor(() => expect(r.getByTestId('at').textContent).toBe('/maldoteth'));
  });
  it('leaves someone else\'s /profile?id= alone', () => {
    const r = renderAt('/profile?id=0xabc', 'maldoteth');
    expect(r.getByTestId('at').textContent).toBe('/profile?id=0xabc');
  });
  it('leaves /profile alone when signed out or without a username', () => {
    expect(renderAt('/profile', 'maldoteth', false).getByTestId('at').textContent).toBe('/profile');
  });
  it('waits for a username', () => {
    expect(renderAt('/profile', null).getByTestId('at').textContent).toBe('/profile');
  });
});
