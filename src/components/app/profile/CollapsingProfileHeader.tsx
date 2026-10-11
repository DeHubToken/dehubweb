import { useContext, useEffect, useRef, useState, type RefObject } from 'react';
import { PageHeader } from '@/components/app/PageHeader';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
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
  const barRef = useRef<HTMLDivElement>(null);
  const [surfaceVisible, setSurfaceVisible] = useState(false);

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
      <div ref={barRef} data-profile-collapse data-collapsed={surfaceVisible} data-joined={surfaceVisible && tabsPinned} className="profile-collapse-bar">
        <div className="profile-collapse-gap-guard" hidden={!surfaceVisible} aria-hidden>
          {coverUrl && <img src={coverUrl} alt="" className="profile-collapse-cover" />}
        </div>
        <div className="profile-collapse-surface" style={tabsPinned ? { bottom: -tabsHeight - 4 } : undefined} hidden={!surfaceVisible} aria-hidden>
          {coverUrl && <img src={coverUrl} alt="" className="profile-collapse-cover" />}
        </div>
        <PageHeader overlay plainBack className="!top-2 !left-1 !right-auto" />
        <div className="profile-collapse-content">
          <div className="profile-collapse-identity" data-visible={surfaceVisible} aria-hidden={!surfaceVisible}>
            <p className="truncate text-sm sm:text-base font-bold text-white">{name}</p>
            <p className="truncate text-xs text-zinc-400">{handle}</p>
          </div>
          {surfaceVisible && followAction && <div className="shrink-0">{followAction}</div>}
        </div>
      </div>
    </div>
  );
}
