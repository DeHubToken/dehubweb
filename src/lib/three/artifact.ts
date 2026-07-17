import * as THREE from 'three';
import { SimplexNoise } from '@/lib/simplex-noise';
import { ARTIFACT_CONFIG } from '@/config/hero-config';

export interface ArtifactSystem {
  artifact: THREE.Mesh;
  geometry: THREE.IcosahedronGeometry;
  material: THREE.MeshStandardMaterial;
  logoMesh: THREE.Mesh;
  logoMaterial: THREE.MeshBasicMaterial;
  simplex: SimplexNoise;
  timers: NodeJS.Timeout[];
  intervals: NodeJS.Timeout[];
  isDisposed: boolean;
}

export const createArtifact = (
  scene: THREE.Scene,
  logoTexturePath: string
): ArtifactSystem => {
  const simplex = new SimplexNoise();

  // Create artifact geometry
  const geometry = new THREE.IcosahedronGeometry(ARTIFACT_CONFIG.RADIUS, ARTIFACT_CONFIG.DETAIL);
  geometry.setAttribute('originalPosition', geometry.attributes.position.clone());

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.1,
    roughness: 0.8,
    envMapIntensity: 0.5,
    transparent: true,
    opacity: 0.8,
    premultipliedAlpha: true
  });

  const artifact = new THREE.Mesh(geometry, material);
  scene.add(artifact);

  // Create center logo
  const textureLoader = new THREE.TextureLoader();
  const logoTexture = textureLoader.load(logoTexturePath);
  const logoGeometry = new THREE.PlaneGeometry(
    ARTIFACT_CONFIG.LOGO_SIZE,
    ARTIFACT_CONFIG.LOGO_SIZE
  );
  const logoMaterial = new THREE.MeshBasicMaterial({
    map: logoTexture,
    transparent: true,
    opacity: ARTIFACT_CONFIG.LOGO_OPACITY,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false
  });

  const logoMesh = new THREE.Mesh(logoGeometry, logoMaterial);
  logoMesh.position.set(0, 0, 0);
  logoMesh.renderOrder = 999;
  scene.add(logoMesh);

  return { 
    artifact, geometry, material, logoMesh, logoMaterial, simplex,
    timers: [], intervals: [], isDisposed: false 
  };
};

export const animateArtifact = (
  artifactSystem: ArtifactSystem,
  elapsedTime: number
) => {
  const { artifact, logoMesh, logoMaterial, simplex } = artifactSystem;

  // Rotate artifact
  artifact.rotation.y = 0.1 * elapsedTime;
  artifact.rotation.x = 0.1 * elapsedTime;

  // Sync logo rotation with artifact
  logoMesh.rotation.y = artifact.rotation.y;
  logoMesh.rotation.x = artifact.rotation.x;

  // Logo flicker effect
  const flickerSpeed = 2.5;
  const flickerAmount = 0.15;
  const flicker = 0.5 +
    Math.sin(elapsedTime * flickerSpeed) * flickerAmount * 0.5 +
    Math.sin(elapsedTime * flickerSpeed * 1.7) * flickerAmount * 0.3;
  logoMaterial.opacity = flicker;

  // Animate artifact displacement
  const positions = artifact.geometry.attributes.position;
  const originalPositions = artifact.geometry.attributes.originalPosition as THREE.BufferAttribute;
  
  for (let i = 0; i < positions.count; i++) {
    const ox = originalPositions.getX(i);
    const oy = originalPositions.getY(i);
    const oz = originalPositions.getZ(i);
    const noise = simplex.noise4D(ox * 0.5, oy * 0.5, oz * 0.5, elapsedTime * 0.15);
    const displacement = new THREE.Vector3(ox, oy, oz).normalize().multiplyScalar(noise * 0.2);
    positions.setX(i, ox + displacement.x);
    positions.setY(i, oy + displacement.y);
    positions.setZ(i, oz + displacement.z);
  }
  positions.needsUpdate = true;
};

export const triggerArtifactGlitch = (
  artifactSystem: ArtifactSystem,
  originalPosition: { x: number; y: number; z: number }
) => {
  if (artifactSystem.isDisposed) return;
  
  const { artifact } = artifactSystem;
  
  // Store original position
  const startPos = {
    x: artifact.position.x,
    y: artifact.position.y,
    z: artifact.position.z
  };

  // Random jump
  artifact.position.x += (Math.random() - 0.5) * 0.5;
  artifact.position.y += (Math.random() - 0.5) * 0.5;
  artifact.position.z += (Math.random() - 0.5) * 0.2;

  // Return with elastic easing
  const timer = setTimeout(() => {
    if (artifactSystem.isDisposed) return;
    
    const returnDuration = 100;
    const returnStartTime = Date.now();

    const returnInterval = setInterval(() => {
      if (artifactSystem.isDisposed) {
        clearInterval(returnInterval);
        return;
      }
      
      const elapsed = Date.now() - returnStartTime;
      const progress = Math.min(elapsed / returnDuration, 1);

      // Elastic easing out
      const easeProgress = progress === 1
        ? 1
        : 1 - Math.pow(2, -10 * progress) * Math.sin((progress * 10 - 0.75) * (2 * Math.PI) / 3);

      artifact.position.x = startPos.x + (originalPosition.x - startPos.x) * easeProgress;
      artifact.position.y = startPos.y + (originalPosition.y - startPos.y) * easeProgress;
      artifact.position.z = startPos.z + (originalPosition.z - startPos.z) * easeProgress;

      if (progress >= 1) {
        clearInterval(returnInterval);
      }
    }, 16);
    artifactSystem.intervals.push(returnInterval);
  }, 100);
  artifactSystem.timers.push(timer);
};

export const disposeArtifact = (artifactSystem: ArtifactSystem) => {
  artifactSystem.isDisposed = true;
  
  // Clear all timers and intervals
  artifactSystem.timers.forEach(timer => clearTimeout(timer));
  artifactSystem.intervals.forEach(interval => clearInterval(interval));
  artifactSystem.timers = [];
  artifactSystem.intervals = [];
  
  artifactSystem.geometry.dispose();
  artifactSystem.material.dispose();
  if (artifactSystem.logoMaterial.map) {
    artifactSystem.logoMaterial.map.dispose();
  }
  artifactSystem.logoMaterial.dispose();
};
