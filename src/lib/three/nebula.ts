import * as THREE from 'three';
import { NEBULA_CONFIG } from '@/config/hero-config';

// Easter egg images
import easterEgg1 from '@/assets/easter-eggs/easter-egg-1.png';
import easterEgg2 from '@/assets/easter-eggs/easter-egg-2.png';
import easterEgg3 from '@/assets/easter-eggs/easter-egg-3.png';
import easterEgg4 from '@/assets/easter-eggs/easter-egg-4.png';

const EASTER_EGG_IMAGES = [easterEgg1, easterEgg2, easterEgg3, easterEgg4];

export interface NebulaSystem {
  nebula: THREE.Points;
  nebulaGroup: THREE.Group;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  easterEggs: THREE.Sprite[];
}

export const createNebula = (scene: THREE.Scene): NebulaSystem => {
  const { PARTICLE_COUNT, PARTICLE_SIZE, SPREAD, MIN_DISTANCE_FROM_CENTER } = NEBULA_CONFIG;

  // Create a group to hold nebula and easter eggs together
  const nebulaGroup = new THREE.Group();

  const geometry = new THREE.BufferGeometry();
  const posArray = new Float32Array(PARTICLE_COUNT * 3);
  const colorArray = new Float32Array(PARTICLE_COUNT * 3);
  const nebulaColors = [
    new THREE.Color(0xffffff),
    new THREE.Color(0xffffff),
    new THREE.Color(0x505050)
  ];

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

    const randomColor = nebulaColors[Math.floor(Math.random() * nebulaColors.length)];
    colorArray[i * 3 + 0] = randomColor.r;
    colorArray[i * 3 + 1] = randomColor.g;
    colorArray[i * 3 + 2] = randomColor.b;
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
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
    });

    const sprite = new THREE.Sprite(spriteMaterial);
    
    const pos = easterEggPositions[index];
    sprite.position.set(pos.x, pos.y, pos.z);
    sprite.scale.set(0.25, 0.25, 1); // Small easter eggs

    nebulaGroup.add(sprite);
    easterEggs.push(sprite);
  });

  scene.add(nebulaGroup);

  return { nebula, nebulaGroup, geometry, material, easterEggs };
};

export const animateNebula = (nebulaSystem: NebulaSystem) => {
  nebulaSystem.nebulaGroup.rotation.y += 0.0002;
};

export const disposeNebula = (nebulaSystem: NebulaSystem) => {
  nebulaSystem.geometry.dispose();
  nebulaSystem.material.dispose();
  nebulaSystem.easterEggs.forEach((sprite) => {
    sprite.material.map?.dispose();
    sprite.material.dispose();
  });
};
