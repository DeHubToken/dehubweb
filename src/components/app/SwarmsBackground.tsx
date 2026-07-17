import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { useAppTheme } from '@/contexts/ThemeContext';
import { resolveThemeColor, type ThemeColorSpec } from '@/lib/theme-color';
import { capPixelRatio, createRenderGate, releaseContext } from '@/lib/three/scene-helpers';

/**
 * Globally rendered "Swarms" background — interactive particle nebula.
 * Only active when appearance theme is "swarms". Sits behind app content.
 */
export function SwarmsBackground() {
  const { theme, themeHues, brandColors } = useAppTheme();
  if (theme !== 'swarms') return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    >
      <GenerativeArtSceneV3 colorValue={themeHues.swarms ?? config.colors.baseHue} brandColors={brandColors} />
    </div>
  );
}

/** Push a resolved brand palette into shader uniforms (padded to 3 slots). */
function applyBrandUniforms(uniforms: Record<string, THREE.IUniform>, spec: ThemeColorSpec) {
  uniforms.u_brand.value = spec.kind === 'brand' ? 1 : 0;
  uniforms.u_brandCount.value = spec.brand.length;
  const vecs = uniforms.u_brandColors.value as THREE.Vector3[];
  for (let i = 0; i < 3; i++) {
    const c = spec.brand[i] ?? spec.brand[spec.brand.length - 1] ?? [1, 1, 1];
    vecs[i].set(c[0], c[1], c[2]);
  }
}

// Saturation / lightness a normal hue renders particles at in this scene.
const SWARMS_BASELINE = { saturation: 1.0, lightness: 0.6 };

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

function GenerativeArtSceneV3({ colorValue = config.colors.baseHue, brandColors = [] }: { colorValue?: number; brandColors?: string[] }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef(new THREE.Vector2(0, 0));
  // The colour spec drives shader uniforms so slider drags recolour the live
  // particle system instead of rebuilding 50k particles and the WebGL context.
  const spec = resolveThemeColor(colorValue, SWARMS_BASELINE, brandColors);
  const specRef = useRef(spec);
  specRef.current = spec;
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const redrawRef = useRef<(() => void) | null>(null);
  const brandKey = spec.brand.map((c) => c.join(',')).join(';');

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.u_baseHue.value = spec.hue;
    material.uniforms.u_sat.value = spec.saturation;
    material.uniforms.u_light.value = spec.lightness;
    material.uniforms.u_rainbow.value = spec.rainbow;
    applyBrandUniforms(material.uniforms, spec);
    // Repaint immediately so reduced-motion (static frame) users see it too.
    redrawRef.current?.();
  }, [spec.hue, spec.saturation, spec.lightness, spec.rainbow, spec.kind, brandKey]);

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

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    // Cap the buffer at ~2 MP (applied before u_pointSize is derived from the
    // pixel ratio below, so on-screen point size stays constant).
    capPixelRatio(renderer, currentMount.clientWidth, currentMount.clientHeight);
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
    const hueOffsets = new Float32Array(particleCount);
    const velocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * config.particles.boxSize;
      positions[i3 + 1] = (Math.random() - 0.5) * config.particles.boxSize;
      positions[i3 + 2] = (Math.random() - 0.5) * config.particles.boxSize;

      hueOffsets[i] = (Math.random() - 0.5) * config.colors.hueVariance;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('aHueOffset', new THREE.BufferAttribute(hueOffsets, 1));

    const particleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        u_pointSize: { value: config.particles.size * renderer.getPixelRatio() },
        u_baseHue: { value: specRef.current.hue },
        u_sat: { value: specRef.current.saturation },
        u_light: { value: specRef.current.lightness },
        u_rainbow: { value: specRef.current.rainbow },
        u_brand: { value: specRef.current.kind === 'brand' ? 1 : 0 },
        u_brandCount: { value: specRef.current.brand.length },
        u_brandColors: { value: [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1)] },
        u_time: { value: 0.0 },
      },
      vertexShader: `
        attribute float aHueOffset;
        varying vec3 vColor;
        uniform float u_pointSize;
        uniform float u_baseHue;
        uniform float u_sat;
        uniform float u_light;
        uniform float u_rainbow;
        uniform float u_brand;
        uniform float u_brandCount;
        uniform vec3 u_brandColors[3];
        uniform float u_time;

        // HSL -> RGB, matching THREE.Color.setHSL(h, 1.0, 0.6)
        vec3 hsl2rgb(vec3 c) {
          vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
          return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
        }

        // Seamless cyclic sample across 1–3 brand colours (mirrors JS sampleBrandGradient).
        vec3 brandAt(float t) {
          vec3 c0 = u_brandColors[0];
          vec3 c1 = u_brandColors[1];
          vec3 c2 = u_brandColors[2];
          if (u_brandCount < 1.5) return c0;
          float x = fract(t);
          if (u_brandCount < 2.5) {
            float tt = 1.0 - abs(1.0 - 2.0 * x); // 0->1->0, no seam
            return mix(c0, c1, tt);
          }
          float seg = x * 3.0;
          float s = floor(seg);
          float f = seg - s;
          vec3 a = s < 0.5 ? c0 : (s < 1.5 ? c1 : c2);
          vec3 b = s < 0.5 ? c1 : (s < 1.5 ? c2 : c0);
          return mix(a, b, f);
        }

        void main() {
          if (u_brand > 0.5) {
            // Brand mode spreads the profile palette across the cloud, cycling
            // over time exactly like rainbow does with the spectrum.
            float t = fract((position.x + position.y + position.z) / 10.0 + u_time * 0.03);
            vColor = brandAt(t);
          } else {
            // Rainbow mode spreads hue across the particle cloud (by position),
            // slowly cycling over time; otherwise every particle shares the hue.
            float hue = u_rainbow > 0.5
              ? fract((position.x + position.y + position.z) / 10.0 + u_time * 0.03)
              : mod((u_baseHue + aHueOffset) / 360.0, 1.0);
            vColor = hsl2rgb(vec3(hue, u_sat, u_light));
          }
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
    materialRef.current = particleMaterial;
    applyBrandUniforms(particleMaterial.uniforms, specRef.current);
    redrawRef.current = () => composer.render();

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
      // Pause the whole loop (incl. the 50k-particle CPU sim below) when the tab
      // is hidden or the canvas is off-screen; the gate restarts us on return.
      if (!prefersReducedMotion && !gate.isActive()) {
        frameId = 0;
        return;
      }
      const elapsedTime = clock.getElapsedTime();
      particleMaterial.uniforms.u_time.value = elapsedTime;
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
      if (!prefersReducedMotion) {
        frameId = requestAnimationFrame(animate);
      }
      // silence unused
      void tmpForce;
    };
    const gate = createRenderGate(currentMount, () => {
      if (!prefersReducedMotion && frameId === 0) animate();
    });
    animate();

    const handleResize = () => {
      const w = currentMount.clientWidth;
      const h = currentMount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      capPixelRatio(renderer, w, h);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      if (prefersReducedMotion) {
        composer.render();
      }
    };
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('resize', handleResize);
    if (!prefersReducedMotion) {
      window.addEventListener('mousemove', handleMouseMove);
    }

    return () => {
      cancelAnimationFrame(frameId);
      gate.destroy();
      materialRef.current = null;
      redrawRef.current = null;
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      if (renderer.domElement.parentNode === currentMount) {
        currentMount.removeChild(renderer.domElement);
      }
      particleGeometry.dispose();
      particleMaterial.dispose();
      composer.dispose();
      releaseContext(renderer);
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0 w-full h-full" />;
}

export default SwarmsBackground;
