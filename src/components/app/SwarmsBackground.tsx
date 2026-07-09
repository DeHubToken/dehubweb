import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { useAppTheme } from '@/contexts/ThemeContext';

/**
 * Globally rendered "Swarms" background — interactive particle nebula.
 * Only active when appearance theme is "swarms". Sits behind app content.
 */
export function SwarmsBackground() {
  const { theme } = useAppTheme();
  if (theme !== 'swarms') return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    >
      <GenerativeArtSceneV3 />
    </div>
  );
}

const config = {
  particles: {
    count: 50000,
    size: 0.02,
    boxSize: 5,
  },
  colors: {
    baseHue: 200,
    hueVariance: 20,
  },
  simulation: {
    noiseSpeed: 0.1,
    noiseScale: 1.2,
    mouseRepulsion: 0.005,
    friction: 0.95,
  },
  bloom: {
    strength: 0.6,
    radius: 0.4,
    threshold: 0.1,
  },
  camera: {
    initialDistance: 5,
    parallaxIntensity: 0.005,
  },
};

function GenerativeArtSceneV3() {
  const mountRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef(new THREE.Vector2(0, 0));

  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      currentMount.clientWidth / currentMount.clientHeight,
      0.1,
      1000,
    );
    camera.position.z = config.camera.initialDistance;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    currentMount.appendChild(renderer.domElement);

    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(currentMount.clientWidth, currentMount.clientHeight),
      config.bloom.strength,
      config.bloom.radius,
      config.bloom.threshold,
    );
    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);

    const particleCount = config.particles.count;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const baseColor = new THREE.Color();

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * config.particles.boxSize;
      positions[i3 + 1] = (Math.random() - 0.5) * config.particles.boxSize;
      positions[i3 + 2] = (Math.random() - 0.5) * config.particles.boxSize;

      const hue =
        (config.colors.baseHue + (Math.random() - 0.5) * config.colors.hueVariance) / 360;
      baseColor.setHSL(hue, 1.0, 0.6);
      colors[i3] = baseColor.r;
      colors[i3 + 1] = baseColor.g;
      colors[i3 + 2] = baseColor.b;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        u_pointSize: { value: config.particles.size * renderer.getPixelRatio() },
      },
      vertexShader: `
        attribute vec3 color;
        varying vec3 vColor;
        uniform float u_pointSize;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = u_pointSize * (10.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float strength = distance(gl_PointCoord, vec2(0.5));
          strength = 1.0 - step(0.5, strength);
          if (strength < 0.01) discard;
          gl_FragColor = vec4(vColor, strength);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);

    const clock = new THREE.Clock();

    const curlNoiseFn = (px: number, py: number, pz: number, speed: number, scale: number, out: THREE.Vector3) => {
      out.set(
        Math.sin(py * scale + speed),
        Math.cos(pz * scale + speed),
        Math.sin(px * scale + speed),
      );
      return out.normalize();
    };

    const tmpCurl = new THREE.Vector3();
    const tmpMouse = new THREE.Vector3();
    const tmpP = new THREE.Vector3();
    const tmpForce = new THREE.Vector3();

    let frameId = 0;
    const animate = () => {
      const elapsedTime = clock.getElapsedTime();
      const posAttr = particleSystem.geometry.attributes.position;
      const arr = posAttr.array as Float32Array;

      const mx = mouseRef.current.x * (config.particles.boxSize / 2);
      const my = mouseRef.current.y * (config.particles.boxSize / 2);
      tmpMouse.set(mx, my, 0);

      const speedTime = elapsedTime * config.simulation.noiseSpeed;
      const scale = config.simulation.noiseScale;
      const friction = config.simulation.friction;
      const repulsion = config.simulation.mouseRepulsion;
      const half = config.particles.boxSize / 2;

      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const px = arr[i3];
        const py = arr[i3 + 1];
        const pz = arr[i3 + 2];

        const curl = curlNoiseFn(px, py, pz, speedTime, scale, tmpCurl);

        tmpP.set(px, py, pz);
        const dx = px - tmpMouse.x;
        const dy = py - tmpMouse.y;
        const dz = pz - tmpMouse.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        let fx = 0, fy = 0, fz = 0;
        if (dist < 2) {
          const inv = 1 / (dist + 0.1) / (dist || 1);
          fx = dx * inv;
          fy = dy * inv;
          fz = dz * inv;
        }

        velocities[i3] = (velocities[i3] + curl.x * 0.001 + fx * repulsion) * friction;
        velocities[i3 + 1] = (velocities[i3 + 1] + curl.y * 0.001 + fy * repulsion) * friction;
        velocities[i3 + 2] = (velocities[i3 + 2] + curl.z * 0.001 + fz * repulsion) * friction;

        let nx = px + velocities[i3];
        let ny = py + velocities[i3 + 1];
        let nz = pz + velocities[i3 + 2];

        if (Math.abs(nx) > half) nx *= -1;
        if (Math.abs(ny) > half) ny *= -1;
        if (Math.abs(nz) > half) nz *= -1;

        arr[i3] = nx;
        arr[i3 + 1] = ny;
        arr[i3 + 2] = nz;
      }
      posAttr.needsUpdate = true;

      camera.position.x +=
        (mouseRef.current.x * config.camera.parallaxIntensity - camera.position.x) * 0.02;
      camera.position.y +=
        (-mouseRef.current.y * config.camera.parallaxIntensity - camera.position.y) * 0.02;
      camera.lookAt(scene.position);

      composer.render();
      frameId = requestAnimationFrame(animate);
      // silence unused
      void tmpForce;
    };
    animate();

    const handleResize = () => {
      const w = currentMount.clientWidth;
      const h = currentMount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      if (renderer.domElement.parentNode === currentMount) {
        currentMount.removeChild(renderer.domElement);
      }
      particleGeometry.dispose();
      particleMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0 w-full h-full" />;
}

export default SwarmsBackground;
