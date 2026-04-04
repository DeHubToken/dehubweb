import * as THREE from 'three';

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
  // Cap pixel ratio at 1.5 on mobile/low-end — halves GPU fill rate on Retina screens
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  camera.position.z = 5;

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

export const createResizeHandler = (
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer
) => {
  return () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
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
