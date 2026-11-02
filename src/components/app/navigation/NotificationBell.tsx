import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Bell from '@/components/ui/cut-icons/alerts';
import { BELL_SIDE_RIPPLE_PATHS, notificationBellMotion } from '@/lib/notification-bell-motion';
import './notification-bell.css';

export function NotificationBell({ unread = 0, size = 26, active = true }: {
  unread?: number;
  size?: number;
  active?: boolean;
}) {
  const profile = notificationBellMotion(unread);
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(() => !document.hidden);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = typeof IntersectionObserver === 'undefined' ? null
      : new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (observer) observer.observe(element);
    else setVisible(true);
    const update = () => setForeground(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  const style = {
    width: size, height: size,
    '--bell-swing': `${profile.swing}deg`,
    '--bell-opacity': profile.opacity,
    '--bell-reach': `${profile.reach * size / 26}px`,
    '--bell-cycle': `${profile.cycleMs}ms`,
    '--bell-glow': `${profile.intensity}px`,
    '--bell-size': `${size}px`,
  } as CSSProperties;
  return (
    <span ref={ref} className="notification-bell" style={style} aria-hidden="true"
      data-unread={profile.unread > 0} data-unread-count={profile.unread} data-running={active && visible && foreground}>
      <span className="notification-bell__swing">
        {profile.unread > 0 && <span className="notification-bell__rim"><Bell size={size} /></span>}
        <Bell size={size} />
        {profile.unread > 0 && <span className="notification-bell__hot"><Bell size={size} /></span>}
        {profile.unread > 0 && BELL_SIDE_RIPPLE_PATHS.map((path, side) => [0, 1].map(echo => (
          <span key={`${side}-${echo}`} className="notification-bell__wave" data-side={side} data-echo={echo}>
            <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
              <path d={path} stroke="var(--bell-red)" strokeWidth={profile.stroke} strokeLinecap="round" />
            </svg>
          </span>
        )))}
      </span>
    </span>
  );
}
