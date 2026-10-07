import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { useAutoplayPausePrompt } from '../use-autoplay-pause-prompt';
import { AUTOPLAY_PAUSE_CONFIRM_MS, AUTOPLAY_PROMPT_STORAGE_KEY } from '@/lib/autoplay-pause-prompt';

const prefs = vi.hoisted(() => ({ autoplayEnabled: true, setAutoplayEnabled: vi.fn() }));
vi.mock('@/contexts/AutoplayContext', () => ({ useAutoplay: () => prefs }));
vi.mock('@/i18n', () => ({ default: { t: (key: string) => key } }));
vi.mock('sonner', () => ({ toast: { message: vi.fn(), dismiss: vi.fn() } }));
afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

it('ignores undone pauses, shows one toast, and applies its switch to the real preference setter', async () => {
  vi.useFakeTimers();
  localStorage.clear();
  const { result, rerender, unmount } = renderHook(
    ({ id }) => useAutoplayPausePrompt(id), { initialProps: { id: 'reaction' } },
  );
  act(() => result.current.recordPause());
  act(() => { vi.advanceTimersByTime(300); result.current.cancelPause(); });
  act(() => vi.advanceTimersByTime(AUTOPLAY_PAUSE_CONFIRM_MS));
  for (const id of ['a', 'b']) {
    rerender({ id });
    act(() => result.current.recordPause());
    act(() => vi.advanceTimersByTime(AUTOPLAY_PAUSE_CONFIRM_MS));
  }
  expect(toast.message).not.toHaveBeenCalled();
  rerender({ id: 'c' });
  act(() => result.current.recordPause());
  // A quick scroll removes the paused player before the confirmation timer.
  unmount();
  expect(toast.message).toHaveBeenCalledTimes(1);
  expect(Number(localStorage.getItem(AUTOPLAY_PROMPT_STORAGE_KEY))).toBeGreaterThan(0);
  const options = vi.mocked(toast.message).mock.calls[0][1]!;
  await act(async () => { render(<>{options.description}</>); });
  fireEvent.click(screen.getByRole('switch', { name: 'settings.autoPlay' }));
  expect(prefs.setAutoplayEnabled).toHaveBeenCalledWith(false);
  expect(toast.dismiss).toHaveBeenCalledWith('autoplay-pause-prompt');
});
