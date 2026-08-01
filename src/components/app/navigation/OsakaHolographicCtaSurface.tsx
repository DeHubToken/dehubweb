import { useEffect, useRef, useState } from 'react';
import { createFrameThrottle } from '@/lib/raf-throttle';

const VERTEX_SHADER = /* glsl */ `
  varying vec2 v_uv;
  varying vec3 v_normal;
  varying vec3 v_view;

  void main() {
    v_uv = uv;
    vec3 p = position;
    float front = step(0.75, normal.z);
    float dome = sin(uv.x * 3.14159265) * sin(uv.y * 3.14159265);
    p.z += front * dome * 0.075;

    vec4 view_position = modelViewMatrix * vec4(p, 1.0);
    v_normal = normalize(normalMatrix * normal);
    v_view = normalize(-view_position.xyz);
    gl_Position = projectionMatrix * view_position;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;

  uniform float u_time;
  uniform float u_hover;
  uniform vec2 u_pointer;

  varying vec2 v_uv;
  varying vec3 v_normal;
  varying vec3 v_view;

  void main() {
    vec3 n = normalize(v_normal);
    float fresnel = pow(1.0 - max(dot(n, v_view), 0.0), 2.2);

    vec3 night = vec3(0.038, 0.027, 0.071);
    vec3 smoke = vec3(0.105, 0.082, 0.155);
    vec3 rose = vec3(1.0, 0.34, 0.68);
    vec3 cyan = vec3(0.28, 0.82, 1.0);
    vec3 silver = vec3(0.88, 0.91, 1.0);

    float band_a = 0.5 + 0.5 * sin(
      (v_uv.x * 1.55 + v_uv.y * 0.42 + u_pointer.x * 0.12) * 18.0
      + u_time * 0.34
    );
    float band_b = 0.5 + 0.5 * sin(
      (v_uv.x * -0.68 + v_uv.y * 1.9 + u_pointer.y * 0.1) * 14.0
      - u_time * 0.22
    );
    float foil = smoothstep(0.2, 0.95, band_a * 0.62 + band_b * 0.38);

    float sweep_position = fract(u_time * 0.027) * 1.45 - 0.25;
    float sweep_distance = v_uv.x + v_uv.y * 0.18 - sweep_position;
    float sweep = exp(-sweep_distance * sweep_distance * 72.0);

    vec3 colour = mix(night, smoke, 0.56 + foil * 0.16);
    colour = mix(colour, cyan, foil * (0.09 + u_hover * 0.025));
    colour = mix(colour, rose, band_b * (0.08 + fresnel * 0.15));
    colour += silver * sweep * (0.14 + u_hover * 0.08);
    colour += mix(cyan, rose, band_a) * fresnel * 0.2;

    gl_FragColor = vec4(colour, 0.96);
  }
`;

interface OsakaHolographicCtaSurfaceProps {
  active: boolean;
}

/**
 * A single-draw-call holographic slab for the Osaka rail CTA.
 *
 * The button remains a normal DOM control. This surface is aria-hidden,
 * pointer-transparent and clipped by the button, so it cannot interfere with
 * focus, click handling or the theme's universal 16px bento geometry.
 */
export function OsakaHolographicCtaSurface({ active }: OsakaHolographicCtaSurfaceProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [reducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (!active || reducedMotion) return;
    const host = hostRef.current;
    const button = host?.parentElement;
    if (!host || !button) return;

    let cancelled = false;
    let destroyScene: (() => void) | undefined;

    const boot = async () => {
      const [THREE, sceneHelpers] = await Promise.all([
        import('three'),
        import('@/lib/three/scene-helpers'),
      ]);
      if (cancelled) return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: false,
          powerPreference: 'low-power',
        });
      } catch {
        return;
      }

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 10);
      camera.position.z = 3;
      const uniforms = {
        u_time: { value: 0 },
        u_hover: { value: 0 },
        u_pointer: { value: new THREE.Vector2(0, 0) },
      };
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthTest: true,
        depthWrite: true,
      });
      const geometry = new THREE.BoxGeometry(2, 2, 0.16, 28, 6, 2);
      const slab = new THREE.Mesh(geometry, material);
      scene.add(slab);

      renderer.setClearAlpha(0);
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      host.appendChild(renderer.domElement);

      let targetX = 0;
      let targetY = 0;
      let pointerX = 0;
      let pointerY = 0;
      let targetHover = 0;

      const onPointerMove = (event: PointerEvent) => {
        const rect = button.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
        targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      };
      const onPointerEnter = () => {
        targetHover = 1;
      };
      const onPointerLeave = () => {
        targetX = 0;
        targetY = 0;
        targetHover = 0;
      };
      button.addEventListener('pointermove', onPointerMove);
      button.addEventListener('pointerenter', onPointerEnter);
      button.addEventListener('pointerleave', onPointerLeave);

      const resize = () => {
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        const aspect = width / height;
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        sceneHelpers.capPixelRatio(renderer, width, height, 90_000, 1.5);

        const visibleHeight = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360);
        slab.scale.set((visibleHeight * aspect * 1.08) / 2, (visibleHeight * 1.08) / 2, 1);
      };
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      resize();

      const throttle = createFrameThrottle(30);
      const startedAt = performance.now();
      let raf = 0;
      let running = false;
      let isActive = () => true;

      const start = () => {
        if (running || cancelled) return;
        running = true;
        raf = requestAnimationFrame(render);
      };
      const render = (now: number) => {
        if (cancelled || !isActive()) {
          running = false;
          return;
        }
        raf = requestAnimationFrame(render);
        if (!throttle(now) || renderer.getContext().isContextLost()) return;

        pointerX += (targetX - pointerX) * 0.09;
        pointerY += (targetY - pointerY) * 0.09;
        uniforms.u_hover.value += (targetHover - uniforms.u_hover.value) * 0.1;
        uniforms.u_pointer.value.set(pointerX, pointerY);
        uniforms.u_time.value = (now - startedAt) / 1000;

        slab.rotation.y = pointerX * 0.045;
        slab.rotation.x = pointerY * -0.055;
        renderer.render(scene, camera);
      };

      const gate = sceneHelpers.createRenderGate(host, start);
      isActive = gate.isActive;
      start();

      destroyScene = () => {
        cancelAnimationFrame(raf);
        gate.destroy();
        resizeObserver.disconnect();
        button.removeEventListener('pointermove', onPointerMove);
        button.removeEventListener('pointerenter', onPointerEnter);
        button.removeEventListener('pointerleave', onPointerLeave);
        geometry.dispose();
        material.dispose();
        sceneHelpers.releaseContext(renderer);
        renderer.domElement.remove();
      };
    };

    void boot();
    return () => {
      cancelled = true;
      destroyScene?.();
    };
  }, [active, reducedMotion]);

  return (
    <span
      ref={hostRef}
      aria-hidden="true"
      data-osaka-holographic-cta
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]"
    />
  );
}
