import { useEffect, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useAppTheme } from '../ThemeContext';

vi.mock('@/contexts/UserPreferencesContext', () => ({
  useSyncedPreference: () => ({ push: vi.fn() }),
}));
vi.mock('@/lib/theme-css', () => ({ loadThemeCss: () => null }));

describe('theme switching', () => {
  it('keeps the screen mounted and commits system chrome before the next frame', () => {
    localStorage.clear();
    let mounts = 0;
    let unmounts = 0;
    function Screen() {
      const { theme, setTheme } = useAppTheme();
      const [draft, setDraft] = useState('');
      useEffect(() => {
        mounts++;
        return () => { unmounts++; };
      }, []);
      return <><input aria-label="Draft" value={draft} onChange={e => setDraft(e.target.value)} /><button onClick={() => setTheme(theme === 'minimal' ? 'system' : 'minimal')}>Switch</button></>;
    }
    const app = render(<ThemeProvider><Screen /></ThemeProvider>);
    fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'unsent draft' } });
    for (const theme of ['minimal', 'system', 'minimal', 'system']) {
      fireEvent.click(screen.getByText('Switch'));
      expect(document.documentElement.dataset.theme).toBe(theme);
      expect(localStorage.getItem('dehub.theme')).toBe(theme);
      expect((screen.getByLabelText('Draft') as HTMLInputElement).value).toBe('unsent draft');
    }
    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);
    app.unmount();
  });
});
