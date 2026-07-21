import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useAppTheme } from '@/contexts/ThemeContext';
import { resolveThemeColor, type ThemeColorSpec } from '@/lib/theme-color';
import { capPixelRatio, createRenderGate, releaseContext } from '@/lib/three/scene-helpers';
import { createFrameThrottle } from '@/lib/raf-throttle';

/**
 * Globally rendered "Hazy Nights" nebula shader background — only active
 * when the appearance theme is set to "hazy". Sits behind all app content.
 */
export function HazyNightsBackground() {
  const { theme, themeHues, brandColors } = useAppTheme();
  if (theme !== 'hazy') return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    >
      <CelestialSphere colorValue={themeHues.hazy ?? 260} brandColors={brandColors} speed={1.2} zoom={1.5} particleSize={3.0} />
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

interface CelestialSphereProps {
  colorValue?: number;
  brandColors?: string[];
  speed?: number;
  zoom?: number;
  particleSize?: number;
}

// Saturation / lightness a normal hue renders at in this nebula shader.
const HAZY_BASELINE = { saturation: 0.7, lightness: 0.5 };

function CelestialSphere({
  colorValue = 260,
  brandColors = [],
  speed = 0.3,
  zoom = 1.5,
  particleSize = 3.0,
}: CelestialSphereProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  // The colour spec is pushed straight into shader uniforms so slider drags
  // don't tear down and rebuild the whole WebGL scene on every tick.
  const spec = resolveThemeColor(colorValue, HAZY_BASELINE, brandColors);
  const specRef = useRef(spec);
  specRef.current = spec;
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const redrawRef = useRef<(() => void) | null>(null);
  const brandKey = spec.brand.map((c) => c.join(',')).join(';');

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.u_hue.value = spec.hue;
    material.uniforms.u_sat.value = spec.saturation;
    material.uniforms.u_light.value = spec.lightness;
    material.uniforms.u_rainbow.value = spec.rainbow;
    applyBrandUniforms(material.uniforms, spec);
    // Repaint immediately so reduced-motion (static frame) users see it too.
    redrawRef.current?.();
  }, [spec.hue, spec.saturation, spec.lightness, spec.rainbow, spec.kind, brandKey]);

  useEffect(() => {
    if (!mountRef.current) return;
    const currentMount = mountRef.current;

    const mouse = new THREE.Vector2(0.5, 0.5);
    const mouseTarget = new THREE.Vector2(0.5, 0.5);

    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      precision highp float;
      varying vec2 vUv;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec2 u_mouse;
      uniform float u_hue;
      uniform float u_sat;
      uniform float u_light;
      uniform float u_rainbow;
      uniform float u_brand;
      uniform float u_brandCount;
      uniform vec3 u_brandColors[3];
      uniform float u_zoom;
      uniform float u_particle_size;

      vec3 hsl2rgb(vec3 c) {
        vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0), 6.0)-3.0)-1.0, 0.0, 1.0);
        return c.z * mix(vec3(1.0), rgb, c.y);
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

      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }

      float noise(vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);
        float a = random(i);
        float b = random(i + vec2(1.0, 0.0));
        float c = random(i + vec2(0.0, 1.0));
        float d = random(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.y * u.x;
      }

      float fbm(vec2 st) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 6; i++) {
          value += amplitude * noise(st);
          st *= 2.0;
          amplitude *= 0.5;
        }
        return value;
      }

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.y, u_resolution.x);
        uv *= u_zoom;

        // Local cursor response: the smoke bends into a gentle vortex around
        // the pointer (plus a slight inward pull), on top of the global pan.
        // Displacement is r * gaussian so it is zero at the cursor centre,
        // peaks nearby and fades out — no hard edge, no NaN.
        vec2 m = (u_mouse - 0.5 * u_resolution.xy) / min(u_resolution.y, u_resolution.x) * u_zoom;
        vec2 toM = uv - m;
        float influence = exp(-dot(toM, toM) * 5.0);
        uv += vec2(-toM.y, toM.x) * influence * 0.25;
        uv -= toM * influence * 0.10;

        vec2 mouse_normalized = u_mouse / u_resolution;
        uv += (mouse_normalized - 0.5) * 0.8;

        // Wafting drift — clouds slowly float in a wandering direction
        vec2 drift = vec2(
          u_time * 0.06 + sin(u_time * 0.15) * 0.25,
          u_time * 0.03 + cos(u_time * 0.11) * 0.20
        );

        // Domain warping — layered fbm displacing itself for smoky curls
        vec2 q = vec2(
          fbm(uv + drift),
          fbm(uv + drift + vec2(5.2, 1.3))
        );
        vec2 r = vec2(
          fbm(uv + 1.7 * q + vec2(1.7, 9.2) + drift * 0.5),
          fbm(uv + 1.7 * q + vec2(8.3, 2.8) + drift * 0.5 + u_time * 0.04)
        );
        float t = fbm(uv + 1.5 * r);

        // Soft cloud density with subtle flicker (low-freq brightness pulse)
        float flicker = 0.85 + 0.25 * fbm(uv * 0.6 + u_time * 0.35);
        float wisp    = 0.9 + 0.35 * sin(u_time * 1.7 + t * 6.28);
        float nebula  = pow(t, 1.7) * flicker * wisp;

        // Brand mode sweeps the profile palette across space + time (same
        // coordinate rainbow uses); rainbow sweeps the full spectrum; otherwise
        // the chosen hue drifts subtly with the smoke (r.x).
        vec3 color;
        if (u_brand > 0.5) {
          float t = fract(u_time * 0.03 + vUv.x * 0.6 + vUv.y * 0.4 + r.x * 0.25);
          color = brandAt(t);
        } else {
          float baseHue = u_rainbow > 0.5
            ? fract(u_time * 0.03 + vUv.x * 0.6 + vUv.y * 0.4 + r.x * 0.25)
            : (u_hue / 360.0 + r.x * 0.15);
          color = hsl2rgb(vec3(baseHue, u_sat, u_light));
        }
        color *= nebula * 2.5;

        float star_val = random(vUv * 500.0);
        if (star_val > 0.998) {
          float star_brightness = (star_val - 0.998) / 0.002;
          // twinkle stars in sync with the haze
          star_brightness *= 0.6 + 0.4 * sin(u_time * 3.0 + star_val * 100.0);
          color += vec3(star_brightness * u_particle_size);
        }

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // antialias off + a hard ~2 MP buffer cap (applied in resize()) keep this
    // heavy 6-octave fbm shader from melting weak GPUs on large displays.
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    currentMount.appendChild(renderer.domElement);

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        u_time: { value: 0.0 },
        u_resolution: { value: new THREE.Vector2() },
        u_mouse: { value: new THREE.Vector2() },
        u_hue: { value: specRef.current.hue },
        u_sat: { value: specRef.current.saturation },
        u_light: { value: specRef.current.lightness },
        u_rainbow: { value: specRef.current.rainbow },
        u_brand: { value: specRef.current.kind === 'brand' ? 1 : 0 },
        u_brandCount: { value: specRef.current.brand.length },
        u_brandColors: { value: [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1)] },
        u_zoom: { value: zoom },
        u_particle_size: { value: particleSize },
      },
    });
    materialRef.current = material;
    applyBrandUniforms(material.uniforms, specRef.current);
    redrawRef.current = () => renderer.render(scene, camera);

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const resize = () => {
      const { clientWidth, clientHeight } = currentMount;
      renderer.setSize(clientWidth, clientHeight);
      capPixelRatio(renderer, clientWidth, clientHeight);
      // u_resolution stays in CSS px so the nebula's pattern scale is unchanged
      // by the pixel-ratio cap (only the sampling resolution drops).
      material.uniforms.u_resolution.value.set(clientWidth, clientHeight);
      camera.updateProjectionMatrix();
      if (prefersReducedMotion) {
        renderer.render(scene, camera);
      }
    };


    const onMouseMove = (event: MouseEvent) => {
      const rect = currentMount.getBoundingClientRect();
      mouseTarget.x = event.clientX - rect.left;
      mouseTarget.y = currentMount.clientHeight - (event.clientY - rect.top);
    };

    window.addEventListener('resize', resize);
    if (!prefersReducedMotion) {
      window.addEventListener('mousemove', onMouseMove);
    }
    resize();

    let animationFrameId = 0;
    const clock = new THREE.Clock();
    // Cap the ambient redraw at ~60fps. ProMotion (the 15 Pro Max is 120 Hz)
    // fires rAF at 120/s; the extra frames aren't visible on this soft cloud
    // field but pay full shader fill-rate — a needless, continuous GPU load.
    // Drift stays wall-clock-correct: skipped frames just fold their elapsed
    // time into the next clock.getDelta().
    const shouldDraw = createFrameThrottle(60);
    const animate = () => {
      // Reduced motion: a single static frame, no loop.
      if (prefersReducedMotion) {
        renderer.render(scene, camera);
        return;
      }
      // Pause fully when the tab is hidden or the canvas is off-screen — the
      // gate restarts us via onResume. Stops the shader burning GPU in the bg.
      if (!gate.isActive()) {
        animationFrameId = 0;
        return;
      }
      if (shouldDraw(performance.now())) {
        // Delta-based so the drift speed is identical on 60Hz and 120Hz+
        // displays; clamp so a backgrounded tab doesn't jump on return.
        const delta = Math.min(clock.getDelta(), 0.1);
        // ease mouse toward cursor for a wafting, cloud-like response
        mouse.x += (mouseTarget.x - mouse.x) * 0.04;
        mouse.y += (mouseTarget.y - mouse.y) * 0.04;
        material.uniforms.u_mouse.value.set(mouse.x, mouse.y);
        material.uniforms.u_time.value += delta * 0.3 * speed;
        renderer.render(scene, camera);
      }
      animationFrameId = requestAnimationFrame(animate);
    };
    // Restart the loop when the tab/canvas becomes visible again.
    const gate = createRenderGate(currentMount, () => {
      if (!prefersReducedMotion && animationFrameId === 0) {
        clock.getDelta(); // drop the accumulated pause interval
        animate();
      }
    });
    if (prefersReducedMotion) {
      // Static frame with enough elapsed "time" that the clouds have structure.
      material.uniforms.u_time.value = 12.0;
    }
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(animationFrameId);
      gate.destroy();
      materialRef.current = null;
      redrawRef.current = null;
      if (renderer.domElement.parentNode === currentMount) {
        currentMount.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      releaseContext(renderer);
    };
  }, [speed, zoom, particleSize]);

  return <div ref={mountRef} className="w-full h-full" />;
}

export default HazyNightsBackground;
