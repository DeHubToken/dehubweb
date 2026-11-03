import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CollapsingProfileHeader } from '@/components/app/profile/CollapsingProfileHeader';

vi.mock('@/components/app/PageHeader', () => ({ PageHeader: () => <button>Back</button> }));
let theme = 'system';
vi.mock('@/contexts/ThemeContext', () => ({ useAppTheme: () => ({ theme }) }));
afterEach(() => { cleanup(); theme = 'system'; });

it('shows only a floating Back until the tabs row pins, with no compact bar in between', () => {
  const { container, rerender } = render(<CollapsingProfileHeader />);
  expect(screen.getByText('Back')).toBeVisible();
  expect(container.querySelector('.profile-collapse-surface')).toBeNull();
  expect(container.querySelector('.profile-collapse-identity')).toBeNull();
  rerender(<CollapsingProfileHeader tabsPinned />);
  const bar = container.querySelector<HTMLElement>('[data-profile-collapse]')!;
  expect(bar).toHaveAttribute('data-tabs-pinned', 'true');
  expect(bar).toHaveAttribute('aria-hidden', 'true');
  expect(screen.queryByText('Back')).toBeNull();
});

it.each(['hazy', 'cosmic', 'osaka', 'jungle', 'light'])('never paints a bar surface on %s', (nextTheme) => {
  theme = nextTheme;
  const { container } = render(<CollapsingProfileHeader />);
  expect(container.querySelector('[data-feed-nav]')).toBeNull();
  expect(container.querySelector('.profile-collapse-cover')).toBeNull();
});
