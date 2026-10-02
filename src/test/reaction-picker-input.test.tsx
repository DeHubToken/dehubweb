import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/locales/en.json';
import { ReactionPicker } from '@/components/app/cards/ReactionPicker';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('.').reduce<any>((node, part) => node?.[part], en) ?? key,
  }),
}));

beforeEach(() => {
  // Match the browser's breakpoint result to the viewport used by each case.
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: query === '(max-width: 767px)' && window.innerWidth < 768,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  window.innerWidth = 1024;
});

describe('reaction picker activation', () => {
  it('casts once for pointer release followed by the browser click', () => {
    const onSelect = vi.fn();
    render(<ReactionPicker open current={null} onSelect={onSelect} onClose={() => {}} />);
    const love = screen.getByRole('menuitemradio', { name: 'Love' });
    fireEvent.pointerDown(love);
    fireEvent.pointerUp(love);
    fireEvent.click(love, { detail: 1 });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('love');
  });

  it('keeps keyboard and assistive activation working', () => {
    const onSelect = vi.fn();
    render(<ReactionPicker open current={null} onSelect={onSelect} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Love' }), { detail: 0 });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('love');
  });

  it('supports releasing a hold-and-slide without a click', () => {
    const onSelect = vi.fn();
    render(<ReactionPicker open current={null} onSelect={onSelect} onClose={() => {}} />);
    fireEvent.pointerUp(screen.getByRole('menuitemradio', { name: 'Love' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('love');
  });

  it('opens the breakdown once per pointer gesture', () => {
    const onShowInfo = vi.fn();
    render(<ReactionPicker open current={null} onSelect={() => {}} onClose={() => {}} onShowInfo={onShowInfo} />);
    const info = screen.getByRole('menuitem', { name: 'See who reacted' });
    fireEvent.pointerUp(info);
    fireEvent.click(info, { detail: 1 });
    expect(onShowInfo).toHaveBeenCalledTimes(1);
  });
});

describe('reaction drawer on a phone', () => {
  it('shows every reaction in a drawer and closes from the backdrop', () => {
    window.innerWidth = 390;
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<ReactionPicker open current="love" onSelect={onSelect} onClose={onClose} onShowInfo={() => {}} />);
    const drawer = document.querySelector('[data-reaction-drawer]');
    expect(drawer).not.toBeNull();
    expect(screen.getAllByRole('menuitemradio').length).toBeGreaterThan(1);
    expect(screen.getByRole('menuitemradio', { name: 'Love' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitem', { name: 'See who reacted' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Love' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('love');
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('one tray for every reaction', () => {
  it('puts 👎 last, after a divider, on the desktop tray', () => {
    render(<ReactionPicker open current={null} onSelect={() => {}} onClose={() => {}} />);
    const options = screen.getAllByRole('menuitemradio');
    expect(options).toHaveLength(10);
    expect(options[0]).toHaveAccessibleName('Like');
    expect(options[9]).toHaveAccessibleName('Dislike');
    const divider = document.querySelector('[data-reaction-divider]');
    expect(divider).not.toBeNull();
    expect(divider!.nextElementSibling).toBe(options[9]);
  });

  it('casts a dislike from the tray', () => {
    const onSelect = vi.fn();
    render(<ReactionPicker open current={null} onSelect={onSelect} onClose={() => {}} />);
    fireEvent.pointerUp(screen.getByRole('menuitemradio', { name: 'Dislike' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('dislike');
  });

  it('prints each total under its emoji, zero dimmed', () => {
    render(
      <ReactionPicker open current="dislike" counts={{ like: 19, love: 1, dislike: 2 }} onSelect={() => {}} onClose={() => {}} />,
    );
    const dislike = screen.getByRole('menuitemradio', { name: 'Dislike — 2 reactions' });
    expect(dislike).toHaveAttribute('aria-checked', 'true');
    const count = dislike.querySelector('[data-reaction-count]')!;
    expect(count.textContent).toBe('2');
    // Under the emoji, in the flow of the button — not pinned to a corner.
    expect(count.className).not.toMatch(/\babsolute\b/);
    const hot = screen.getByRole('menuitemradio', { name: 'Hot — 0 reactions' });
    expect(hot.querySelector('[data-reaction-count]')).toHaveAttribute('data-zero', 'true');
  });

  it('can still show one side alone', () => {
    render(<ReactionPicker open polarity="positive" current={null} onSelect={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole('menuitemradio', { name: 'Dislike' })).toBeNull();
    expect(document.querySelector('[data-reaction-divider]')).toBeNull();
  });

  it('includes 👎 and its total in the phone drawer', () => {
    window.innerWidth = 390;
    const onSelect = vi.fn();
    render(
      <ReactionPicker open current={null} counts={{ like: 4, dislike: 3 }} onSelect={onSelect} onClose={() => {}} />,
    );
    expect(document.querySelector('[data-reaction-drawer]')).not.toBeNull();
    const options = screen.getAllByRole('menuitemradio');
    expect(options).toHaveLength(10);
    const dislike = screen.getByRole('menuitemradio', { name: 'Dislike' });
    expect(options[9]).toBe(dislike);
    expect(dislike.querySelector('[data-reaction-count]')!.textContent).toBe('3');
    fireEvent.click(dislike);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('dislike');
  });
});
