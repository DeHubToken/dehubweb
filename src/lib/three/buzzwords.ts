import * as THREE from 'three';
import { BUZZWORDS, FEATURED_BUZZWORDS, TIMING } from '@/config/hero-config';
import ftvLogo from '@/assets/ftv-logo.png';

export type SpriteType = 'background' | 'foreground';

// Image buzzwords that appear alongside text buzzwords
export const IMAGE_BUZZWORDS = [
  { src: ftvLogo, name: 'FTV' }
];

export interface BuzzwordSystem {
  sprites: THREE.Sprite[];
  types: SpriteType[];
  loaded: boolean;
}

const createTextSprite = (text: string, size: number): THREE.Sprite | null => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return null;

  const fontSize = Math.floor(size * 50);
  context.font = `bold ${fontSize}px Arial`;

  const textMetrics = context.measureText(text);
  const textWidth = textMetrics.width;

  const canvasWidth = Math.max(512, Math.ceil(textWidth * 1.2));
  const canvasHeight = 128;

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  context.fillStyle = 'rgba(255, 255, 255, 1.0)';
  context.font = `bold ${fontSize}px Arial`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending
  });

  const sprite = new THREE.Sprite(spriteMaterial);
  const aspectRatio = canvasWidth / 512;
  sprite.scale.set(size * 2.875 * aspectRatio, size * 0.71875, 1);

  return sprite;
};

const createImageSprite = (imageSrc: string, size: number): Promise<THREE.Sprite> => {
  return new Promise((resolve) => {
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(imageSrc, (texture) => {
      const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending
      });

      const sprite = new THREE.Sprite(spriteMaterial);
      // Scale to match text buzzword sizing
      sprite.scale.set(size * 0.375, size * 0.375, 1);
      resolve(sprite);
    });
  });
};

export const loadBuzzwords = (
  scene: THREE.Scene,
  buzzwordSystem: BuzzwordSystem
) => {
  if (buzzwordSystem.loaded) return;
  buzzwordSystem.loaded = true;

  const allBuzzwords = [...BUZZWORDS];
  const shuffled = [...allBuzzwords].sort(() => Math.random() - 0.5);

  // Load text buzzwords
  shuffled.forEach((word, index) => {
    setTimeout(() => {
      const isFeatured = FEATURED_BUZZWORDS.includes(word);
      let size = Math.random() * 0.5 + 0.5;
      if (size > 0.65) {
        size = 0.65 + (size - 0.65) * 0.6;
      }

      if (isFeatured) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;

        const fontSize = Math.floor(size * 50);
        context.font = `bold ${fontSize}px Arial`;
        const textMetrics = context.measureText(word);
        const textWidth = textMetrics.width;
        const canvasWidth = Math.max(512, Math.ceil(textWidth * 1.2));
        const canvasHeight = 128;

        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        context.fillStyle = 'rgba(255, 255, 255, 0.9)';
        context.font = `bold ${fontSize}px Arial`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(word, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          opacity: 0.7,
          blending: THREE.AdditiveBlending
        });

        const sprite = new THREE.Sprite(spriteMaterial);
        const aspectRatio = canvasWidth / 512;
        sprite.position.set(
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5,
          Math.random() * 2 + 1
        );
        sprite.scale.set(size * 2.875 * 0.65 * aspectRatio, size * 0.71875 * 0.65, 1);
        scene.add(sprite);
        buzzwordSystem.sprites.push(sprite);
        buzzwordSystem.types.push('foreground');
      } else {
        const sprite = createTextSprite(word, size);
        if (sprite) {
          sprite.position.set(
            (Math.random() - 0.5) * 12,
            (Math.random() - 0.5) * 12,
            Math.random() * -8 - 2
          );
          scene.add(sprite);
          buzzwordSystem.sprites.push(sprite);
          buzzwordSystem.types.push('background');
        }
      }
    }, index * TIMING.BUZZWORD_STAGGER);
  });

  // Load image buzzwords after text buzzwords
  const imageStartDelay = shuffled.length * TIMING.BUZZWORD_STAGGER;
  IMAGE_BUZZWORDS.forEach((imgBuzzword, index) => {
    setTimeout(async () => {
      const size = Math.random() * 0.3 + 0.5;
      const sprite = await createImageSprite(imgBuzzword.src, size);
      
      // Position in foreground like featured buzzwords
      sprite.position.set(
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5,
        Math.random() * 2 + 1
      );
      
      scene.add(sprite);
      buzzwordSystem.sprites.push(sprite);
      buzzwordSystem.types.push('foreground');
    }, imageStartDelay + index * TIMING.BUZZWORD_STAGGER);
  });
};

export const animateBuzzwords = (
  buzzwordSystem: BuzzwordSystem,
  elapsedTime: number
) => {
  buzzwordSystem.sprites.forEach((sprite, index) => {
    sprite.rotation.z = Math.sin(elapsedTime * 0.2 + index) * 0.1;

    const baseOpacity = buzzwordSystem.types[index] === 'foreground' ? 0.7 : 0.6;
    const staticNoise = Math.random() * 0.15;
    const scanlineFlicker = Math.sin(elapsedTime * 60 + index * 0.5) * 0.05;
    sprite.material.opacity = baseOpacity - staticNoise + scanlineFlicker;

    const jitterAmount = 0.008;
    sprite.position.x += (Math.random() - 0.5) * jitterAmount;
    sprite.position.y += (Math.random() - 0.5) * jitterAmount;
  });
};

export const triggerBuzzwordGlitch = (buzzwordSystem: BuzzwordSystem) => {
  let flickerCount = 0;
  const flickerInterval = setInterval(() => {
    buzzwordSystem.sprites.forEach((sprite) => {
      sprite.material.opacity = Math.random() > 0.5 ? 0.9 : 0.3;
      sprite.position.x += (Math.random() - 0.5) * 0.2;
      sprite.position.y += (Math.random() - 0.5) * 0.2;
    });
    flickerCount++;

    if (flickerCount > 6) {
      clearInterval(flickerInterval);
      buzzwordSystem.sprites.forEach((sprite, index) => {
        if (buzzwordSystem.types[index] === 'foreground') {
          sprite.position.set(
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5,
            Math.random() * 2 + 1
          );
          sprite.material.opacity = 0.8;
        } else {
          sprite.position.set(
            (Math.random() - 0.5) * 12,
            (Math.random() - 0.5) * 12,
            Math.random() * -8 - 2
          );
          sprite.material.opacity = 0.7;
        }
      });
    }
  }, 30);
};

export const disposeBuzzwords = (buzzwordSystem: BuzzwordSystem) => {
  buzzwordSystem.sprites.forEach(sprite => {
    if (sprite.material.map) {
      sprite.material.map.dispose();
    }
    sprite.material.dispose();
  });
};
