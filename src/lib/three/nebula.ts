import * as THREE from 'three';
import { NEBULA_CONFIG } from '@/config/hero-config';

export interface NebulaSystem {
  nebula: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
}

export const createNebula = (scene: THREE.Scene): NebulaSystem => {
  const { PARTICLE_COUNT, PARTICLE_SIZE, SPREAD, MIN_DISTANCE_FROM_CENTER } = NEBULA_CONFIG;

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
  scene.add(nebula);

  return { nebula, geometry, material };
};

export const animateNebula = (nebula: THREE.Points) => {
  nebula.rotation.y += 0.0002;
};
