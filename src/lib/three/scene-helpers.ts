import * as THREE from 'three';
import { isBackgroundPaused, subscribeBackgroundPaused } from '@/lib/background-gate';

export interface SceneSetup {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
}

export const createScene = (canvas: HTMLCanvasElement): SceneSetup => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: window.devicePixelRatio < 2, // skip antialiasing on hi-DPI (looks fine, saves GPU)
    alpha: true,
    powerPreference: 'high-performance',
  });

  renderer.setSize(window.innerWidth, window.innerHeight);
  // Cap pixel ratio at 1.5 on mobile/low-end AND cap the total buffer at ~2 MP
  // so a large desktop display can't blow the GPU fill rate.
  capPixelRatio(renderer, window.innerWidth, window.innerHeight, 2_000_000, 1.5);
  camera.position.z = 5;

  // Harden against context loss: calling preventDefault() on `webglcontextlost`
  // tells the browser the context is restorable and, crucially, stops the lost
  // context from throwing on the next GL call (which would otherwise bubble to a
  // React error boundary). Repeated theme switches can churn contexts toward the
  // browser's ~16-context ceiling; if one is dropped, the loop just idles
  // instead of crashing the tab. Callers should also gate rendering on
  // `renderer.getContext().isContextLost()` (see createRenderGate consumers).
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault(), false);

  return { scene, camera, renderer };
};

export const createLighting = (scene: THREE.Scene) => {
  const pointLight = new THREE.PointLight(0xffffff, 1.5, 100);
  pointLight.position.set(0, 0, 7);
  scene.add(pointLight);

  const ambientLight = new THREE.AmbientLight(0x404040, 3);
  scene.add(ambientLight);

  return { pointLight, ambientLight };
};

/**
 * Cap a renderer's drawing buffer to ~`maxPixels` total, regardless of display
 * size. The buffer is `cssW·ratio × cssH·ratio`, so `ratio = sqrt(maxPixels /
 * (cssW·cssH))` pins the total at `maxPixels`; we also never upscale past the
 * device's own pixel ratio. This is the single biggest GPU-fill-rate win for the
 * full-screen shader backgrounds (a 4K display would otherwise render 8-33M px
 * per frame with the heavy fbm shaders — enough to hang weak GPUs). three.js's
 * `setPixelRatio` re-runs `setSize` internally, so call this AFTER `setSize`.
 */
export const capPixelRatio = (
  renderer: THREE.WebGLRenderer,
  cssWidth: number,
  cssHeight: number,
  maxPixels = 2_000_000,
  maxRatio = Infinity,
) => {
  const dpr = window.devicePixelRatio || 1;
  const area = Math.max(1, cssWidth * cssHeight);
  renderer.setPixelRatio(Math.min(dpr, maxRatio, Math.sqrt(maxPixels / area)));
};

/**
 * A pause gate for animation loops: stops rendering when the tab is hidden or
 * the target element scrolls out of view, and calls `onResume` when it becomes
 * active again. The animate loop early-returns on `!isActive()`; `onResume`
 * restarts it. Prevents heavy shader/particle loops from burning GPU/CPU while
 * off-screen. (Full-screen `fixed` backgrounds stay intersecting, so for those
 * the visibility half does the real work — but the IO half is free and correct
 * once these mount behind a scrolling docs page.)
 */
export const createRenderGate = (
  target: Element,
  onResume: () => void,
): { isActive: () => boolean; destroy: () => void } => {
  let inView = true;
  let visible = document.visibilityState === 'visible';
  let unpaused = !isBackgroundPaused();

  const active = () => inView && visible && unpaused;

  const io = new IntersectionObserver(([entry]) => {
    const next = entry?.isIntersecting ?? true;
    const wasActive = active();
    inView = next;
    if (!wasActive && active()) onResume();
  });
  io.observe(target);

  const onVisibility = () => {
    const next = document.visibilityState === 'visible';
    const wasActive = active();
    visible = next;
    if (!wasActive && active()) onResume();
  };
  document.addEventListener('visibilitychange', onVisibility);

  // Pause while a full-page surface (docs/blog) is composited over the canvas.
  const unsubscribePause = subscribeBackgroundPaused((paused) => {
    const wasActive = active();
    unpaused = !paused;
    if (!wasActive && active()) onResume();
  });

  return {
    isActive: active,
    destroy: () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribePause();
    },
  };
};

/** Fully release a renderer's WebGL context on unmount (avoids context leaks
 *  when switching themes repeatedly). `forceContextLoss` triggers
 *  WEBGL_lose_context; `dispose` frees the renderer's own GL resources. */
export const releaseContext = (renderer: THREE.WebGLRenderer) => {
  try {
    renderer.forceContextLoss();
  } catch {
    // ignore — some drivers throw if the context is already lost
  }
  renderer.dispose();
};

export const createResizeHandler = (
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer
) => {
  return () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    capPixelRatio(renderer, window.innerWidth, window.innerHeight, 2_000_000, 1.5);
  };
};

export const setupMouseInteraction = () => {
  let mouseX = 0;
  let mouseY = 0;
  let isTouching = false;

  const handleMouseMove = (event: MouseEvent) => {
    mouseX = (event.clientX - window.innerWidth / 2) / 100;
    mouseY = (event.clientY - window.innerHeight / 2) / 100;
  };

  const handleTouchStart = (event: TouchEvent) => {
    event.preventDefault();
    isTouching = true;
  };

  const handleTouchMove = (event: TouchEvent) => {
    if (!isTouching) return;
    event.preventDefault();
    const touch = event.touches[0];
    mouseX = (touch.clientX - window.innerWidth / 2) / 100;
    mouseY = (touch.clientY - window.innerHeight / 2) / 100;
  };

  const handleTouchEnd = () => {
    isTouching = false;
  };

  const addListeners = () => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);
  };

  const removeListeners = () => {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('touchstart', handleTouchStart);
    window.removeEventListener('touchmove', handleTouchMove);
    window.removeEventListener('touchend', handleTouchEnd);
  };

  const getMousePosition = () => ({ mouseX, mouseY });

  return { addListeners, removeListeners, getMousePosition };
};
