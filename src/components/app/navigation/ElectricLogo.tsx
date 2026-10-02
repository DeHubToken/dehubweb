import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ElectricFrame } from './logo-electricity';
const idleFrame: ElectricFrame = { bolts: [], x: 0, y: 0, charged: false, held: false };

/** Idle costs no animation frames. Normal taps keep the existing action. */
export function ElectricLogo({ children, active = true }: { children: ReactNode; active?: boolean }) {
  const root = useRef<HTMLSpanElement>(null);
  const [frame, setFrame] = useState(idleFrame);
  const raf = useRef(0), start = useRef<number | null>(null), suppress = useRef(false);
  const reduced = useRef(false);
  const stop = () => { if (start.current !== null) suppress.current = performance.now() - start.current >= 3000; start.current = null; cancelAnimationFrame(raf.current); raf.current = 0; setFrame(idleFrame); };
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { reduced.current = query.matches; }; update(); query.addEventListener('change', update);
    const hide = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hide); window.addEventListener('blur', stop);
    return () => { cancelAnimationFrame(raf.current); query.removeEventListener('change', update); document.removeEventListener('visibilitychange', hide); window.removeEventListener('blur', stop); };
  }, []);
  useEffect(() => { if (!active) stop(); }, [active]);
  const begin = () => {
    if (!active || start.current !== null) return;
    suppress.current = false; start.current = performance.now(); const pressStart = start.current;
    setFrame({ ...idleFrame, held: true });
    void import('./logo-electricity').then(({ createElectricity }) => {
      if (start.current !== pressStart) return;
      const electricity = createElectricity();
      const tick = (now: number) => { if (start.current !== pressStart) return; setFrame(electricity(now - pressStart, reduced.current)); raf.current = requestAnimationFrame(tick); };
      raf.current = requestAnimationFrame(tick);
    }).catch(() => { /* A failed optional chunk leaves the tap action usable. */ });
  };
  useEffect(() => {
    const button = root.current?.closest('button');
    if (!button) return;
    const down = (event: KeyboardEvent) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); begin(); } };
    const up = (event: KeyboardEvent) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); const short = start.current !== null && performance.now() - start.current < 3000; stop(); if (short) button.click(); } };
    button.addEventListener('keydown', down); button.addEventListener('keyup', up); button.addEventListener('blur', stop);
    return () => { button.removeEventListener('keydown', down); button.removeEventListener('keyup', up); button.removeEventListener('blur', stop); };
  }, [active]);
  return <span ref={root}
    onPointerDown={e => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); begin(); }}
    onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onBlur={stop}
    onContextMenu={e => e.preventDefault()}
    onClickCapture={e => { if (suppress.current) { e.preventDefault(); e.stopPropagation(); suppress.current = false; } }}
    style={{ display: 'inline-flex', position: 'relative', touchAction: 'none', userSelect: 'none', transform: `translate(${frame.x * .375}px,${frame.y * .375}px)` }}>
    <span style={{ display: 'inline-flex', filter: frame.held ? frame.charged ? 'drop-shadow(-1px 0 2px #72d9ff) drop-shadow(1px 0 2px #ffe86c)' : 'drop-shadow(0 0 2px white) drop-shadow(0 0 4px #ffffffaa)' : undefined }}>{children}</span>
    {frame.bolts.length > 0 && <svg aria-hidden="true" viewBox="-44 -38 88 76" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
      {frame.bolts.map((b, i) => <g key={i} opacity={b.opacity} fill="none" strokeLinejoin="miter" strokeLinecap="round"><polyline points={b.points.map(p => p.join(',')).join(' ')} stroke={b.colour} strokeWidth={b.width + 2} opacity={.2}/><polyline points={b.points.map(p => p.join(',')).join(' ')} stroke={b.colour} strokeWidth={b.width}/><polyline points={b.points.map(p => p.join(',')).join(' ')} stroke="white" strokeWidth={.45}/></g>)}
    </svg>}
  </span>;
}
