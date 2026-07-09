import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useAppTheme } from '@/contexts/ThemeContext';

/**
 * Globally rendered "Hazy Nights" nebula shader background — only active
 * when the appearance theme is set to "hazy". Sits behind all app content.
 */
export function HazyNightsBackground() {
  const { theme } = useAppTheme();
  if (theme !== 'hazy') return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    >
      <CelestialSphere hue={260} speed={0.3} zoom={1.5} particleSize={3.0} />
    </div>
  );
}

interface CelestialSphereProps {
  hue?: number;
  speed?: number;
  zoom?: number;
  particleSize?: number;
}

function CelestialSphere({
  hue = 260,
  speed = 0.3,
  zoom = 1.5,
  particleSize = 3.0,
}: CelestialSphereProps) {
  const mountRef = useRef<HTMLDivElement>(null);

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
      uniform float u_zoom;
      uniform float u_particle_size;

      vec3 hsl2rgb(vec3 c) {
        vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0), 6.0)-3.0)-1.0, 0.0, 1.0);
        return c.z * mix(vec3(1.0), rgb, c.y);
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

        vec3 color = hsl2rgb(vec3(u_hue / 360.0 + r.x * 0.15, 0.7, 0.5));
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

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    currentMount.appendChild(renderer.domElement);

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        u_time: { value: 0.0 },
        u_resolution: { value: new THREE.Vector2() },
        u_mouse: { value: new THREE.Vector2() },
        u_hue: { value: hue },
        u_zoom: { value: zoom },
        u_particle_size: { value: particleSize },
      },
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const resize = () => {
      const { clientWidth, clientHeight } = currentMount;
      renderer.setSize(clientWidth, clientHeight);
      material.uniforms.u_resolution.value.set(clientWidth, clientHeight);
      camera.updateProjectionMatrix();
    };

    const onMouseMove = (event: MouseEvent) => {
      const rect = currentMount.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
      material.uniforms.u_mouse.value.set(mouse.x, currentMount.clientHeight - mouse.y);
    };

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouseMove);
    resize();

    let animationFrameId = 0;
    const animate = () => {
      material.uniforms.u_time.value += 0.005 * speed;
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(animationFrameId);
      if (renderer.domElement.parentNode === currentMount) {
        currentMount.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [hue, speed, zoom, particleSize]);

  return <div ref={mountRef} className="w-full h-full" />;
}

export default HazyNightsBackground;
