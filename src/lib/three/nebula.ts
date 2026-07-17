import * as THREE from 'three';
import { NEBULA_CONFIG } from '@/config/hero-config';
import { resolveThemeColor, hslToRgb, sampleBrandGradient, THEME_COLOR } from '@/lib/theme-color';

// Easter egg images
import easterEgg1 from '@/assets/easter-eggs/easter-egg-1.png';
import easterEgg2 from '@/assets/easter-eggs/easter-egg-2.png';
import easterEgg3 from '@/assets/easter-eggs/easter-egg-3.png';
import easterEgg4 from '@/assets/easter-eggs/easter-egg-4.png';

// Special nebula easter egg
import thirdEye from '@/assets/easter-eggs/third-eye.jpg';

const EASTER_EGG_IMAGES = [easterEgg1, easterEgg2, easterEgg3, easterEgg4];
const SPECIAL_EASTER_EGG_COUNT = 20;

export interface NebulaSystem {
  nebula: THREE.Points;
  nebulaGroup: THREE.Group;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  /** Per-particle base brightness (0–1), used to recolour by theme hue. */
  tones: Float32Array;
  easterEggs: THREE.Sprite[];
  specialEasterEggs: THREE.Sprite[];
  timers: NodeJS.Timeout[];
  intervals: NodeJS.Timeout[];
  isDisposed: boolean;
}

// Saturation / lightness a normal hue tints the nebula at.
const NEBULA_BASELINE = { saturation: 0.8, lightness: 0.6 };

/**
 * Recolour an existing nebula in place from a theme-colour value (see
 * theme-color.ts). Cheap enough to run live on every slider tick — it only
 * rewrites the colour buffer, no geometry or WebGL-context rebuild.
 */
export const applyNebulaColor = (system: NebulaSystem, colorValue: number, brandColors: string[] = []) => {
  const spec = resolveThemeColor(colorValue, NEBULA_BASELINE, brandColors);
  const tones = system.tones;
  const count = tones.length;
  const colorArray = system.geometry.attributes.color.array as Float32Array;

  for (let i = 0; i < count; i++) {
    let r: number, g: number, b: number;
    if (spec.kind === 'rainbow') {
      [r, g, b] = hslToRgb(i / count, 0.9, 0.6);
    } else if (spec.kind === 'brand') {
      // Spread the brand palette across the particle cloud, mirroring rainbow.
      [r, g, b] = sampleBrandGradient(spec.brand, i / count);
    } else if (spec.kind === 'white') {
      r = g = b = 1;
    } else if (spec.kind === 'black') {
      // Charcoal rather than true black so additive particles still show.
      r = g = b = 0.22;
    } else {
      [r, g, b] = hslToRgb(spec.hue / 360, spec.saturation, spec.lightness);
    }
    const tone = tones[i];
    colorArray[i * 3 + 0] = r * tone;
    colorArray[i * 3 + 1] = g * tone;
    colorArray[i * 3 + 2] = b * tone;
  }
  system.geometry.attributes.color.needsUpdate = true;
};

export const createNebula = (scene: THREE.Scene, colorValue: number = THEME_COLOR.WHITE, brandColors: string[] = []): NebulaSystem => {
  const { PARTICLE_COUNT, PARTICLE_SIZE, SPREAD, MIN_DISTANCE_FROM_CENTER } = NEBULA_CONFIG;

  // Create a group to hold nebula and easter eggs together
  const nebulaGroup = new THREE.Group();

  const geometry = new THREE.BufferGeometry();
  const posArray = new Float32Array(PARTICLE_COUNT * 3);
  const colorArray = new Float32Array(PARTICLE_COUNT * 3);
  // Per-particle base brightness — 2/3 bright, 1/3 dim — preserved so the
  // nebula can be recoloured by theme hue without losing its tonal texture.
  const tones = new Float32Array(PARTICLE_COUNT);
  const toneChoices = [1.0, 1.0, 0x50 / 0xff];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    let x, y, z, distFromCenter;
    do {
      x = (Math.random() - 0.5) * SPREAD;
      y = (Math.random() - 0.5) * SPREAD;
      z = (Math.random() - 0.5) * SPREAD;
      distFromCenter = Math.sqrt(x * x + y * y + z * z);
    } while (distFromCenter < MIN_DISTANCE_FROM_CENTER);

    posArray[i * 3 + 0] = x;
    posArray[i * 3 + 1] = y;
    posArray[i * 3 + 2] = z;

    tones[i] = toneChoices[Math.floor(Math.random() * toneChoices.length)];
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));

  const material = new THREE.PointsMaterial({
    size: PARTICLE_SIZE,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.8
  });

  const nebula = new THREE.Points(geometry, material);
  nebulaGroup.add(nebula);

  // Create easter egg sprites at fixed visible positions
  // Positioned in front quadrants so they're always visible from camera at z=5
  const easterEggs: THREE.Sprite[] = [];
  const textureLoader = new THREE.TextureLoader();

  // Fixed positions: spread around the visible area, in front of center
  const easterEggPositions = [
    { x: -4, y: 3, z: 2 },   // Top-left front
    { x: 4, y: 2, z: 1 },    // Top-right front  
    { x: -3, y: -3, z: 2 },  // Bottom-left front
    { x: 5, y: -2, z: 1 },   // Bottom-right front
  ];

  EASTER_EGG_IMAGES.forEach((imagePath, index) => {
    const texture = textureLoader.load(imagePath);
    texture.colorSpace = THREE.SRGBColorSpace;
    
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0, // Start invisible, loaded later
      blending: THREE.AdditiveBlending,
    });

    const sprite = new THREE.Sprite(spriteMaterial);
    
    const pos = easterEggPositions[index];
    sprite.position.set(pos.x, pos.y, pos.z);
    sprite.scale.set(0.1875, 0.1875, 1); // Small easter eggs

    nebulaGroup.add(sprite);
    easterEggs.push(sprite);
  });

  // Create special nebula easter eggs (third eye) - 20 positions (4 guaranteed front, 16 random)
  const specialEasterEggs: THREE.Sprite[] = [];
  const thirdEyeTexture = textureLoader.load(thirdEye);
  thirdEyeTexture.colorSpace = THREE.SRGBColorSpace;

  // Fixed front positions for guaranteed visibility
  const specialFrontPositions = [
    { x: -2, y: 1.5, z: 1.5 },   // Upper-left front
    { x: 2.5, y: -1, z: 1 },     // Lower-right front
    { x: -3, y: -2, z: 2 },      // Lower-left front
    { x: 3, y: 2.5, z: 1.5 },    // Upper-right front
  ];

  for (let i = 0; i < SPECIAL_EASTER_EGG_COUNT; i++) {
    const spriteMaterial = new THREE.SpriteMaterial({
      map: thirdEyeTexture,
      transparent: true,
      opacity: 0, // Start invisible
      blending: THREE.AdditiveBlending,
    });

    const sprite = new THREE.Sprite(spriteMaterial);
    
    let x, y, z;
    if (i < 4) {
      // First 4: fixed front positions for guaranteed visibility
      const pos = specialFrontPositions[i];
      x = pos.x;
      y = pos.y;
      z = pos.z;
    } else {
      // Remaining 16: random positions throughout nebula
      let distFromCenter;
      do {
        x = (Math.random() - 0.5) * SPREAD;
        y = (Math.random() - 0.5) * SPREAD;
        z = (Math.random() - 0.5) * SPREAD;
        distFromCenter = Math.sqrt(x * x + y * y + z * z);
      } while (distFromCenter < MIN_DISTANCE_FROM_CENTER);
    }

    sprite.position.set(x, y, z);
    sprite.scale.set(0.08, 0.08, 1); // Tiny, like nebula particles

    nebulaGroup.add(sprite);
    specialEasterEggs.push(sprite);
  }

  scene.add(nebulaGroup);

  const system: NebulaSystem = {
    nebula, nebulaGroup, geometry, material, tones, easterEggs, specialEasterEggs,
    timers: [], intervals: [], isDisposed: false,
  };
  // Paint the initial per-particle colours from the requested theme colour.
  applyNebulaColor(system, colorValue, brandColors);
  return system;
};

// Load easter eggs with fade-in effect (call after delay)
export const loadEasterEggs = (nebulaSystem: NebulaSystem) => {
  if (nebulaSystem.isDisposed) return;
  
  // Portrait easter eggs
  nebulaSystem.easterEggs.forEach((sprite, index) => {
    const timer = setTimeout(() => {
      if (nebulaSystem.isDisposed) return;
      let opacity = 0;
      const fadeIn = setInterval(() => {
        if (nebulaSystem.isDisposed) {
          clearInterval(fadeIn);
          return;
        }
        opacity += 0.025;
        if (opacity >= 0.25) {
          opacity = 0.25;
          clearInterval(fadeIn);
        }
        (sprite.material as THREE.SpriteMaterial).opacity = opacity;
      }, 50);
      nebulaSystem.intervals.push(fadeIn);
    }, index * 200);
    nebulaSystem.timers.push(timer);
  });

  // Special nebula easter eggs (third eye) - staggered fade in
  nebulaSystem.specialEasterEggs.forEach((sprite, index) => {
    const timer = setTimeout(() => {
      if (nebulaSystem.isDisposed) return;
      let opacity = 0;
      const fadeIn = setInterval(() => {
        if (nebulaSystem.isDisposed) {
          clearInterval(fadeIn);
          return;
        }
        opacity += 0.02;
        if (opacity >= 0.15) {
          opacity = 0.15;
          clearInterval(fadeIn);
        }
        (sprite.material as THREE.SpriteMaterial).opacity = opacity;
      }, 40);
      nebulaSystem.intervals.push(fadeIn);
    }, 500 + index * 100);
    nebulaSystem.timers.push(timer);
  });
};

export const animateNebula = (nebulaSystem: NebulaSystem) => {
  nebulaSystem.nebulaGroup.rotation.y += 0.0002;
};

export const disposeNebula = (nebulaSystem: NebulaSystem) => {
  nebulaSystem.isDisposed = true;
  
  // Clear all timers and intervals
  nebulaSystem.timers.forEach(timer => clearTimeout(timer));
  nebulaSystem.intervals.forEach(interval => clearInterval(interval));
  nebulaSystem.timers = [];
  nebulaSystem.intervals = [];
  
  nebulaSystem.geometry.dispose();
  nebulaSystem.material.dispose();
  nebulaSystem.easterEggs.forEach((sprite) => {
    sprite.material.map?.dispose();
    sprite.material.dispose();
  });
  nebulaSystem.specialEasterEggs.forEach((sprite) => {
    sprite.material.map?.dispose();
    sprite.material.dispose();
  });
};
