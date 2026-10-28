import { describe, expect, it, vi } from 'vitest';
import { createVisualActivity } from '@/lib/visual-activity';
import { reviveOnReturn } from '@/lib/socket-revive';
import type { Socket } from 'socket.io-client';

describe('a live in a background tab', () => {
  it('keeps playing when the tab is hidden or the window loses focus', () => {
    const activity = createVisualActivity();
    activity.setForeground(false);
    activity.setFocused(false);
    expect(activity.isFeedPlaybackAllowed()).toBe(false);
    expect(activity.isLivePlaybackAllowed()).toBe(true);
    activity.setCall(true, true);
    expect(activity.isLivePlaybackAllowed()).toBe(false);
    activity.dispose();
  });

  it('reconnects a socket that gave up while the tab was away, but not one closed on purpose', () => {
    const handlers: Record<string, (reason: string) => void> = {};
    const socket = {
      connected: false,
      active: false,
      connect: vi.fn(),
      on: (event: string, fn: (reason: string) => void) => { handlers[event] = fn; },
      off: vi.fn(),
    } as unknown as Socket;
    reviveOnReturn(socket);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(socket.connect).toHaveBeenCalledTimes(1);
    handlers.disconnect('io client disconnect');
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });
});
