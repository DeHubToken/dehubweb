import { useContext, useEffect, useRef, useState, type RefObject } from 'react';
import { PageHeader } from '@/components/app/PageHeader';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
import type { ReactNode } from 'react';
import './profile-collapse.css';

/** The cover, name and actions leave independently, as on a native profile. */
export function CollapsingProfileHeader({ headerRef, name, handle, followAction }: {
  headerRef: RefObject<HTMLDivElement>;
  name: string;
  handle: string;
  followAction?: ReactNode;
}) {
  const active = useContext(CachedPageActiveContext);
  const barRef = useRef<HTMLDivElement>(null);
  const [identityVisible, setIdentityVisible] = useState(false);
  const [actionsVisible, setActionsVisible] = useState(false);

  useEffect(() => {
    const header = headerRef.current;
    const bar = barRef.current;
    if (!active || !header || !bar) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const bottom = bar.getBoundingClientRect().bottom;
      const cover = header.querySelector('[data-profile-cover]');
      const identity = header.querySelector('[data-profile-identity]');
      const actions = header.querySelector('[data-profile-actions]');
      const coverBottom = cover?.getBoundingClientRect().bottom ?? Infinity;
      bar.style.setProperty('--profile-frost', String(Math.max(0, Math.min(1, (bottom + 48 - coverBottom) / 48))));
      setIdentityVisible(!!identity && identity.getBoundingClientRect().bottom <= bottom);
      setActionsVisible(!!actions && actions.getBoundingClientRect().bottom <= bottom);
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
      <div ref={barRef} data-profile-collapse className="profile-collapse-bar">
        <div data-page-bento data-keep-bento className="profile-collapse-frost" aria-hidden />
        <PageHeader overlay className="!top-2 !left-2 !right-auto" />
        <div className="profile-collapse-content">
          <div className="profile-collapse-identity" data-visible={identityVisible} aria-hidden={!identityVisible}>
            <p className="truncate text-sm sm:text-base font-bold text-white">{name}</p>
            <p className="truncate text-xs text-zinc-400">{handle}</p>
          </div>
          {actionsVisible && followAction && <div className="shrink-0">{followAction}</div>}
        </div>
      </div>
    </div>
  );
}
