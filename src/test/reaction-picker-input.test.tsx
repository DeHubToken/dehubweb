import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/locales/en.json';
import { ReactionPicker } from '@/components/app/cards/ReactionPicker';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('.').reduce<any>((node, part) => node?.[part], en) ?? key,
  }),
}));

afterEach(() => {
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
