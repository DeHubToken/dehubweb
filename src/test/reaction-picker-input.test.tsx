import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReactionPicker } from '@/components/app/cards/ReactionPicker';

afterEach(cleanup);

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
