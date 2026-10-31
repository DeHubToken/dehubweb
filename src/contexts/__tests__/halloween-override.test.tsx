import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { screen } from '@testing-library/dom';

vi.mock('@/contexts/UserPreferencesContext', () => ({
  useSyncedPreference: () => ({ push: () => undefined }),
}));

import { ThemeProvider, useAppTheme } from '@/contexts/ThemeContext';
import { isHalloweenDay, msUntilLocalMidnight } from '@/lib/halloween-override';

let pick: (v: string) => void = () => undefined;
function Probe() {
  const { theme, setTheme } = useAppTheme();
  pick = setTheme;
  return <span data-testid="theme">{theme}</span>;
}

describe('Halloween 2026 Horror override', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('dehub.theme', 'hazy');
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => vi.useRealTimers());

  it('only runs on 31 Oct 2026 local time', () => {
    expect(isHalloweenDay(new Date(2026, 9, 31, 0, 0, 1))).toBe(true);
    expect(isHalloweenDay(new Date(2026, 9, 31, 23, 59, 59))).toBe(true);
    expect(isHalloweenDay(new Date(2026, 10, 1, 0, 0, 0))).toBe(false);
    expect(isHalloweenDay(new Date(2026, 9, 30, 23, 59, 59))).toBe(false);
    expect(isHalloweenDay(new Date(2027, 9, 31, 12))).toBe(false);
    expect(msUntilLocalMidnight(new Date(2026, 9, 31, 23, 0))).toBe(3600_000);
  });

  it('paints Horror without touching the saved theme, and a pick opts out', () => {
    vi.setSystemTime(new Date(2026, 9, 31, 18, 0));
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId('theme').textContent).toBe('horror');
    expect(localStorage.getItem('dehub.theme')).toBe('hazy');

    act(() => pick('osaka'));
    expect(screen.getByTestId('theme').textContent).toBe('osaka');
    expect(localStorage.getItem('dehub.halloween2026.optOut')).toBe('1');
  });

  it('gives back the saved theme once the local date is past Halloween', () => {
    vi.setSystemTime(new Date(2026, 10, 1, 0, 5));
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId('theme').textContent).toBe('hazy');
  });
});
