/** A local, origin-independent backdrop shared by both web maintenance screens. */
export function attachMaintenanceMotion(root) {
  if (!root) return () => {};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  let frame = 0, x = 0, y = 0;
  const paint = () => {
    frame = 0;
    root.style.setProperty('--maintenance-x', `${x}px`);
    root.style.setProperty('--maintenance-y', `${y}px`);
  };
  const reset = () => { x = 0; y = 0; if (!frame) frame = requestAnimationFrame(paint); };
  const move = event => {
    if (reduced.matches || !fine.matches || event.pointerType === 'touch') return;
    x = (event.clientX / innerWidth - .5) * 48;
    y = (event.clientY / innerHeight - .5) * 36;
    if (!frame) frame = requestAnimationFrame(paint);
  };
  window.addEventListener('pointermove', move, { passive: true });
  document.documentElement.addEventListener('pointerleave', reset);
  window.addEventListener('blur', reset);
  reduced.addEventListener('change', reset);
  fine.addEventListener('change', reset);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('pointermove', move);
    document.documentElement.removeEventListener('pointerleave', reset);
    window.removeEventListener('blur', reset);
    reduced.removeEventListener('change', reset);
    fine.removeEventListener('change', reset);
    root.style.removeProperty('--maintenance-x');
    root.style.removeProperty('--maintenance-y');
  };
}
