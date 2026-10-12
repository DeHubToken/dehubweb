import { useContext, useEffect, useRef, useState, type RefObject } from 'react';
import { PageHeader } from '@/components/app/PageHeader';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import './profile-collapse.css';

/** The cover, name and actions leave independently, as on a native profile. */
export function CollapsingProfileHeader({ headerRef, tabsPinned = false, tabsHeight = 56, name, handle, coverUrl, followAction }: {
  headerRef: RefObject<HTMLDivElement>;
  tabsPinned?: boolean;
  tabsHeight?: number;
  name: string;
  handle: string;
  coverUrl?: string;
  followAction?: ReactNode;
}) {
  const active = useContext(CachedPageActiveContext);
  const { theme } = useAppTheme();
  const barRef = useRef<HTMLDivElement>(null);
  const [surfaceVisible, setSurfaceVisible] = useState(false);
  useFeedSwallowClip(
    headerRef,
    '[data-profile-collapse][data-collapsed="true"]',
    [],
    { allThemes: true, edge: 'bottom', off: !surfaceVisible || tabsPinned },
  );

  useEffect(() => {
    const header = headerRef.current;
    const bar = barRef.current;
    if (!active || !header || !bar) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = bar.getBoundingClientRect().top - 4;
      const actions = header.querySelector('[data-profile-actions]');
      setSurfaceVisible(!!actions && actions.getBoundingClientRect().bottom <= top);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const resize = new ResizeObserver(schedule);
    resize.observe(header);
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule, { passive: true });
    schedule();
    return () => {
      resize.disconnect();
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  }, [active, headerRef, name, handle]);

  return (
    <div className="profile-collapse-anchor">
      <div ref={barRef} data-profile-collapse data-collapsed={surfaceVisible && !tabsPinned} data-tabs-pinned={tabsPinned} className="profile-collapse-bar" aria-hidden={tabsPinned}>
        {!tabsPinned && <>
        {(theme === 'system' || theme === 'immersive') && (
          <div className="profile-collapse-gap-guard" hidden={!surfaceVisible} aria-hidden />
        )}
        {/* Shared nav glass uses relative positioning; this plate must fill the compact bar. */}
        <div data-feed-nav className="profile-collapse-surface" style={{ position: 'absolute' }} hidden={!surfaceVisible} aria-hidden>
          <div data-nav-glass-backdrop />
        </div>
        <PageHeader overlay plainBack className={cn(
          '!right-auto',
          surfaceVisible
            ? '!top-2 !left-2'
            : '!top-3 !left-0 sm:!top-4 sm:!left-3',
          !surfaceVisible && (theme === 'system' || theme === 'immersive') && 'max-sm:!top-1',
        )} />
        <div className="profile-collapse-content">
          <div className="profile-collapse-identity" data-visible={surfaceVisible} aria-hidden={!surfaceVisible}>
            <p className="hidden md:block truncate text-base font-bold text-white">{name}</p>
            <p className="hidden md:block truncate text-xs text-zinc-400">{handle}</p>
          </div>
          {surfaceVisible && followAction && <div className="shrink-0">{followAction}</div>}
        </div>
        </>}
      </div>
    </div>
  );
}
