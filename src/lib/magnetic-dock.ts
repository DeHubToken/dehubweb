const DURATION = 950;

/** Animate the artwork already rendered by the header, at its measured size. */
export function playMagneticDock(root: HTMLElement, onComplete: () => void): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-entry-logo]'));
  const target = targets.find(el => {
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight && getComputedStyle(el).visibility !== 'hidden';
  });
  const art = target && Array.from(target.querySelectorAll<HTMLImageElement | HTMLCanvasElement>('img, canvas')).find(el => {
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return box.width > 0 && box.height > 0 && style.opacity !== '0' && style.display !== 'none';
  });
  // Immersive/deep-link layouts may deliberately have no visible logo.
  if (!target || !art || typeof root.animate !== 'function') {
    onComplete();
    return () => {};
  }
  const box = art.getBoundingClientRect();
  const overlay = document.createElement('div');
  overlay.dataset.magneticDock = '';
  overlay.setAttribute('aria-hidden', 'true');
  Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '10000', pointerEvents: 'auto' });
  const curtain = document.createElement('div');
  Object.assign(curtain.style, { position: 'absolute', inset: '0', background: 'var(--boot-bg, #000)' });
  const logo = document.createElement('img');
  try {
    logo.src = art instanceof HTMLCanvasElement ? art.toDataURL() : art.currentSrc || art.src;
  } catch {
    onComplete();
    return () => {};
  }
  logo.alt = '';
  Object.assign(logo.style, {
    position: 'absolute', left: `${box.left}px`, top: `${box.top}px`,
    width: `${box.width}px`, height: `${box.height}px`, objectFit: 'contain',
    filter: getComputedStyle(art).filter, transformOrigin: 'center',
  });
  overlay.append(curtain, logo);
  document.body.append(overlay);
  const visibility = target.style.visibility;
  target.style.visibility = 'hidden';
  const animations: Animation[] = [];
  let timer: ReturnType<typeof setTimeout>;
  let finished = false;
  const clean = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    animations.forEach(animation => animation.cancel());
    target.style.visibility = visibility;
    overlay.remove();
    window.removeEventListener('resize', complete);
    window.removeEventListener('pagehide', complete);
  };
  const complete = () => { clean(); onComplete(); };
  window.addEventListener('resize', complete, { once: true });
  window.addEventListener('pagehide', complete, { once: true });
  try {
    if (reduced) {
      logo.style.display = 'none';
      target.style.visibility = visibility;
      animations.push(curtain.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'both' }));
    } else {
      const dx = innerWidth / 2 - box.left - box.width / 2;
      const dy = innerHeight / 2 - box.top - box.height / 2;
      const scale = box.width > 80 ? 2.1 : 120 / box.width;
      const start = `translate(${dx}px, ${dy}px) scale(${scale})`;
      animations.push(logo.animate([
        { transform: start, offset: 0 },
        { transform: start, offset: .1 },
        { transform: `translate(${dx * .25 + 6}px, ${dy * .25}px) scale(1.2)`, offset: .67 },
        { transform: 'translate(0, -2px) scale(.99)', offset: .9 },
        { transform: 'translate(0, 0) scale(1)', offset: 1 },
      ], { duration: 740, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' }));
      animations.push(curtain.animate([{ opacity: 1 }, { opacity: 0 }], {
        delay: 260, duration: 480, easing: 'ease-out', fill: 'both',
      }));
      // Only cards move: transforming main would move its fixed/sticky chrome.
      Array.from(root.querySelectorAll<HTMLElement>('[data-post-id]')).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.top < innerHeight && rect.bottom > 0 && !el.parentElement?.closest('[data-post-id]');
      }).slice(0, 4).forEach((card, index) => {
        animations.push(card.animate([
          { opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'translateY(0)' },
        ], { delay: 300 + index * 55, duration: 450, easing: 'cubic-bezier(.25,.65,.25,1)', fill: 'both' }));
      });
    }
    timer = setTimeout(complete, reduced ? 180 : DURATION);
  } catch {
    complete();
  }
  return clean;
}
