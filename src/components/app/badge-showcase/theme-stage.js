import { createBadgeScene } from './theme-scene';

/** One finite timeline per interaction; no idle render loop or network assets. */
export class ThemeStage {
  constructor(canvas, options) {
    const scene = createBadgeScene(canvas, options.theme);
    const context = canvas.getContext('2d');
    const target = options.interactionElement || canvas;
    const loads = new Map();
    let items = [], index = 0, disposed = false, serial = 0, frame = 0;
    let width = 1, height = 1, elapsed = 0, previous = 0, pending = null, held = true;
    let closing = null, hasArt = false;
    const reduce = () => !!options.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const local = box => {
      if (!box) return null;
      const rect = canvas.getBoundingClientRect();
      return { x: box.x - rect.left, y: box.y - rect.top, size: box.size };
    };
    const hero = () => local(options.hero());
    const ease = t => 1 - Math.pow(1 - t, 3);
    function stop() { cancelAnimationFrame(frame); frame = 0; }
    function settle() {
      const callback = pending;
      pending = null;
      stop();
      if (!disposed && hasArt) scene.still();
      callback?.();
    }
    function fail() {
      stop(); pending = null; closing = null;
      if (!disposed) options.onError?.();
    }
    function wake() {
      if (!disposed && !frame && !document.hidden && (pending || closing)) {
        previous = performance.now();
        frame = requestAnimationFrame(tick);
      }
    }
    function tick(now) {
      frame = 0;
      if (disposed || document.hidden) return;
      elapsed += Math.min(50, Math.max(0, now - previous)) / 1000;
      previous = now;
      try {
        if (closing) {
          const p = Math.min(1, elapsed / .56), e = ease(p), from = hero(), to = closing.home;
          scene.still({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e - Math.sin(p * Math.PI) * 28, size: from.size + (to.size - from.size) * e });
          if (p === 1) { const done = closing.done; closing = null; done(); return; }
        } else if (pending) {
          if (elapsed >= scene.duration() || reduce()) return settle();
          scene.draw(elapsed);
        } else return;
      } catch { fail(); return; }
      frame = requestAnimationFrame(tick);
    }
    function layout() {
      if (disposed) return;
      width = Math.max(1, canvas.clientWidth); height = Math.max(1, canvas.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene.geometry(width, height, hero());
      if (!held && hasArt) {
        if (pending) scene.draw(elapsed);
        else scene.still();
      }
    }
    async function load(src, normalize = true) {
      const key = `${normalize}:${src}`;
      if (!loads.has(key)) {
        const promise = new Promise((resolve, reject) => {
          const image = new Image(); image.crossOrigin = 'anonymous';
          const timer = setTimeout(() => { image.src = ''; reject(new Error('Badge artwork timed out')); }, 8000);
          image.onerror = () => { clearTimeout(timer); reject(new Error('Badge artwork unavailable')); };
          image.onload = () => {
            clearTimeout(timer);
            if (!normalize) return resolve(image);
            const art = document.createElement('canvas'); art.width = art.height = 256;
            art.getContext('2d').drawImage(image, 0, 0, 256, 256);
            resolve(art);
          };
          image.src = src;
        });
        loads.set(key, promise);
        promise.catch(() => loads.delete(key));
      }
      return loads.get(key);
    }
    async function prepare(nextIndex, fromArt, version) {
      if (!items[nextIndex]) return false;
      const [next, old, ice] = await Promise.all([
        load(items[nextIndex].src),
        fromArt ? load(fromArt) : load(items[nextIndex].src),
        scene.iceSource ? load(scene.iceSource, false) : null,
      ]);
      if (disposed || version !== serial) return false;
      if (ice) scene.setIce(ice);
      scene.prepare(old, next); hasArt = true; index = nextIndex;
      layout();
      return true;
    }
    function play(from, promote, callback) {
      stop(); closing = null; held = false; elapsed = 0;
      scene.start(local(from), promote); pending = callback || (() => {});
      layout();
      if (reduce()) settle();
      else { scene.draw(0); wake(); }
    }
    this.setItems = next => { items = next.slice(); };
    this.preload = next => { if (!disposed && items[next]) void load(items[next].src).catch(() => {}); };
    this.show = async (next, configuration = {}) => {
      const version = ++serial;
      stop(); pending = null; closing = null;
      held = !!configuration.hold;
      try {
        if (!await prepare(next, null, version)) return disposed || version !== serial;
        if (held) scene.clear();
        else if (configuration.instant || reduce()) scene.still();
        else play(options.hero(), false);
        return true;
      } catch { if (version === serial) fail(); return false; }
    };
    this.open = async ({ from, fromArt, promote, onLanded }) => {
      const version = ++serial;
      if (!await prepare(index, fromArt, version)) return;
      // A first badge has no predecessor to destroy; use its arrival instead.
      play(from, !!promote && !!fromArt, onLanded);
    };
    this.reveal = () => {};
    this.skip = settle;
    this.layout = layout;
    this.close = (home, onClosed) => {
      ++serial; stop(); pending = null; held = false;
      if (reduce() || !hasArt) { onClosed(); return; }
      elapsed = 0; closing = { home: local(home), done: onClosed }; wake();
    };
    const pointer = event => {
      if (held || closing) return;
      options.onInteract?.();
      if (pending) { settle(); return; }
      const box = options.hero();
      if (event.clientX >= box.x && event.clientX <= box.x + box.size && event.clientY >= box.y && event.clientY <= box.y + box.size) options.onTap?.();
      else options.onMiss?.();
    };
    const visibility = () => document.hidden ? stop() : wake();
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motionChanged = () => { if (reduce() && pending) settle(); };
    target.addEventListener('pointerup', pointer);
    document.addEventListener('visibilitychange', visibility);
    motion.addEventListener('change', motionChanged);
    const observer = new ResizeObserver(layout); observer.observe(canvas);
    this.dispose = () => {
      disposed = true; ++serial; stop(); pending = null; closing = null;
      observer.disconnect(); target.removeEventListener('pointerup', pointer);
      document.removeEventListener('visibilitychange', visibility); motion.removeEventListener('change', motionChanged);
      loads.clear(); scene.dispose(); canvas.width = canvas.height = 1;
    };
    layout();
  }
}
