import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { NotificationBell } from '@/components/app/navigation/NotificationBell';
import { formatNotificationCount, setShowNotificationCount } from '@/lib/notification-count-pref';

describe('bell number setting', () => {
  beforeEach(() => localStorage.clear());

  it('shows only the glow by default', () => {
    render(<NotificationBell unread={7} />);
    expect(screen.queryByTestId('notification-bell-count')).toBeNull();
  });

  it('shows the number once the reader turns it on, and hides it again', () => {
    render(<NotificationBell unread={7} />);
    act(() => setShowNotificationCount(true));
    expect(screen.getByTestId('notification-bell-count').textContent).toBe('7');
    act(() => setShowNotificationCount(false));
    expect(screen.queryByTestId('notification-bell-count')).toBeNull();
  });

  it('nothing to count, nothing shown', () => {
    setShowNotificationCount(true);
    render(<NotificationBell unread={0} />);
    expect(screen.queryByTestId('notification-bell-count')).toBeNull();
  });

  it('caps at 99+', () => {
    expect(formatNotificationCount(140)).toBe('99+');
    expect(formatNotificationCount(3)).toBe('3');
  });
});
