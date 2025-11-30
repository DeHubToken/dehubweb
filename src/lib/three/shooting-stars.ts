import * as THREE from 'three';
import { SHOOTING_STAR_CONFIG, TIMING } from '@/config/hero-config';

export interface ShootingStar {
  line: THREE.Line;
  lineMaterial: THREE.LineBasicMaterial;
  geometry: THREE.BufferGeometry;
  active: boolean;
  progress: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
}

export const createShootingStars = (scene: THREE.Scene): ShootingStar[] => {
  const { COUNT, TAIL_POINT_COUNT } = SHOOTING_STAR_CONFIG;
  const shootingStars: ShootingStar[] = [];

  for (let i = 0; i < COUNT; i++) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(TAIL_POINT_COUNT * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x88ffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      linewidth: 2
    });

    const line = new THREE.Line(geometry, lineMaterial);
    scene.add(line);

    shootingStars.push({
      line,
      lineMaterial,
      geometry,
      active: false,
      progress: 0,
      start: new THREE.Vector3(),
      end: new THREE.Vector3()
    });
  }

  return shootingStars;
};

export const spawnShootingStars = (
  shootingStars: ShootingStar[],
  elapsedTime: number,
  lastSpawnTime: { value: number }
) => {
  if (elapsedTime - lastSpawnTime.value > TIMING.SHOOTING_STAR_INTERVAL) {
    lastSpawnTime.value = elapsedTime;

    const numStars = SHOOTING_STAR_CONFIG.MIN_STARS_PER_EVENT +
      Math.floor(Math.random() * (SHOOTING_STAR_CONFIG.MAX_STARS_PER_EVENT - SHOOTING_STAR_CONFIG.MIN_STARS_PER_EVENT + 1));

    let spawned = 0;
    for (let i = 0; i < shootingStars.length && spawned < numStars; i++) {
      if (!shootingStars[i].active) {
        const star = shootingStars[i];
        const delay = spawned * 0.1;

        setTimeout(() => {
          star.active = true;
          star.progress = 0;

          const startAngle = Math.random() * Math.PI * 2;
          const startRadius = 4 + Math.random() * 4;
          star.start.set(
            Math.cos(startAngle) * startRadius,
            4 + Math.random() * 4,
            Math.sin(startAngle) * startRadius
          );

          const distance = 10 + Math.random() * 5;
          star.end.set(
            star.start.x + Math.cos(startAngle + Math.PI / 4) * distance,
            star.start.y - distance * 0.7,
            star.start.z + Math.sin(startAngle + Math.PI / 4) * distance
          );
        }, delay * 1000);

        spawned++;
      }
    }
  }
};

export const animateShootingStars = (shootingStars: ShootingStar[], delta: number) => {
  const { TAIL_POINT_COUNT } = SHOOTING_STAR_CONFIG;

  shootingStars.forEach((star) => {
    if (star.active) {
      star.progress += delta / TIMING.SHOOTING_STAR_DURATION;

      if (star.progress >= 1) {
        star.active = false;
        star.lineMaterial.opacity = 0;
      } else {
        const positions = star.geometry.attributes.position.array as Float32Array;

        for (let i = 0; i < TAIL_POINT_COUNT; i++) {
          const tailProgress = star.progress - (i / TAIL_POINT_COUNT) * 0.15;
          if (tailProgress >= 0) {
            const tailPos = new THREE.Vector3().lerpVectors(
              star.start,
              star.end,
              tailProgress
            );
            positions[i * 3] = tailPos.x;
            positions[i * 3 + 1] = tailPos.y;
            positions[i * 3 + 2] = tailPos.z;
          } else {
            positions[i * 3] = star.start.x;
            positions[i * 3 + 1] = star.start.y;
            positions[i * 3 + 2] = star.start.z;
          }
        }
        star.geometry.attributes.position.needsUpdate = true;

        let opacity = 1;
        if (star.progress < 0.1) {
          opacity = star.progress / 0.1;
        } else if (star.progress > 0.85) {
          opacity = (1 - star.progress) / 0.15;
        }
        star.lineMaterial.opacity = opacity;
      }
    }
  });
};

export const disposeShootingStars = (shootingStars: ShootingStar[]) => {
  shootingStars.forEach(star => {
    star.geometry.dispose();
    star.lineMaterial.dispose();
  });
};
