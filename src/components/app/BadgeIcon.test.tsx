import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadgeIcon } from './BadgeIcon';
import { badgeHoverArt } from '@/lib/badge-hover-art';
import { openBadgeShowcase } from '@/lib/badge-showcase';

vi.mock('@/hooks/use-badge-balance', () => ({
  useBadgeVisual: () => ({ url: '/assets/Octopus.webp', name: 'Octopus', big: false }),
}));
vi.mock('@/contexts/ThemeContext', () => ({ useAppTheme: () => ({ theme: 'system' }) }));
vi.mock('@/lib/badge-showcase', () => ({
  openBadgeShowcase: vi.fn(), preloadBadgeShowcase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));

let reducedMotion = false;
beforeEach(() => {
  reducedMotion = false;
  vi.clearAllMocks();
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: reducedMotion, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
});
afterEach(cleanup);

describe('badge hover playback', () => {
  it('loads a still while idle, plays with the glow on hover, and restores the same still on leave', () => {
    render(<BadgeIcon badgeBalance={500000} />);
    const art = badgeHoverArt('Octopus')!;
    const badge = screen.getByRole('button', { name: 'Octopus' });
    expect(screen.getByRole('img').getAttribute('src')).toBe(art.poster);
    const style = screen.getByRole('img').getAttribute('style');
    fireEvent.pointerEnter(badge);
    expect(screen.getByRole('img').getAttribute('src')).toBe(art.animation);
    expect(screen.getByRole('img').className).toContain('drop-shadow');
    expect(screen.getByRole('img').getAttribute('style')).toBe(style);
    fireEvent.pointerLeave(badge);
    expect(screen.getByRole('img').getAttribute('src')).toBe(art.poster);
    expect(screen.getByRole('img').className).not.toContain('drop-shadow');
  });

  it('keeps the glow and still image when reduced motion is enabled', () => {
    reducedMotion = true;
    render(<BadgeIcon badgeBalance={500000} />);
    fireEvent.pointerEnter(screen.getByRole('button'));
    expect(screen.getByRole('img').getAttribute('src')).toBe(badgeHoverArt('Octopus')!.poster);
    expect(screen.getByRole('img').className).toContain('drop-shadow');
  });

  it('plays on keyboard focus, opens the existing showcase, and stops on blur', () => {
    render(<BadgeIcon badgeBalance={500000} />);
    const badge = screen.getByRole('button');
    fireEvent.focus(badge);
    expect(screen.getByRole('img').getAttribute('src')).toBe(badgeHoverArt('Octopus')!.animation);
    fireEvent.keyDown(badge, { key: 'Enter' });
    expect(openBadgeShowcase).toHaveBeenCalledWith('Octopus', badge);
    fireEvent.blur(badge);
    expect(screen.getByRole('img').getAttribute('src')).toBe(badgeHoverArt('Octopus')!.poster);
  });

  it('falls back to the still when the animation fails to load', () => {
    render(<BadgeIcon badgeBalance={500000} />);
    fireEvent.pointerEnter(screen.getByRole('button'));
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img').getAttribute('src')).toBe(badgeHoverArt('Octopus')!.poster);
  });
});
