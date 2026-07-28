import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createFrameThrottle } from '@/lib/raf-throttle';
import { capPixelRatio, releaseContext } from '@/lib/three/scene-helpers';

/**
 * War theme brand mark, rendered as a hologram.
 * ==============================================
 * Replaces the plain <img> under the War theme with a WebGL surface that
 * treats the logo's own alpha channel as the hologram.
 *
 * WHY NOT A CSS FILTER
 * --------------------
 * The first attempt tinted the PNG with a sepia/hue-rotate chain and stacked
 * drop-shadows behind it. On a transparent mark that reads as a glowing slab
 * sitting behind the artwork rather than the artwork itself emitting, because
 * the bloom is a blur of the whole element rather than anything derived from
 * the glyph. Every effect here is multiplied by the texture's alpha instead,
 * and the rim light is computed from an alpha gradient, so nothing is ever
 * painted outside the mark's own silhouette. There is no box.
 *
 * The scene is two triangles and one texture: an orthographic camera and a
 * full-frustum quad, so cost is a single small draw call regardless of the
 * logo's display size.
 */

const VERT = /* glsl */ `
  varying vec2 v_uv;
  void main() {
    v_uv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;

  uniform sampler2D u_map;
  uniform float u_time;
  uniform vec2 u_texel;
  uniform vec3 u_phosphor;
  uniform vec3 u_fringe;

  varying vec2 v_uv;

  void main() {
    // Chromatic split: red and blue sampled a texel either side of green. Tiny
    // enough to read as refraction rather than a blur, and it is what makes the
    // mark look projected instead of printed.
    float shift = u_texel.x * 1.6;
    float r = texture2D(u_map, v_uv + vec2(shift, 0.0)).a;
    float g = texture2D(u_map, v_uv).a;
    float b = texture2D(u_map, v_uv - vec2(shift, 0.0)).a;
    float alpha = max(g, max(r, b));

    // Rim light from an alpha gradient. Sampling the neighbourhood and
    // subtracting the centre isolates the glyph edge, so the glow follows the
    // outline of the artwork and never bleeds into a rectangle.
    float ring = 0.0;
    ring = max(ring, texture2D(u_map, v_uv + vec2(u_texel.x * 2.0, 0.0)).a);
    ring = max(ring, texture2D(u_map, v_uv - vec2(u_texel.x * 2.0, 0.0)).a);
    ring = max(ring, texture2D(u_map, v_uv + vec2(0.0, u_texel.y * 2.0)).a);
    ring = max(ring, texture2D(u_map, v_uv - vec2(0.0, u_texel.y * 2.0)).a);
    float edge = clamp(ring - g, 0.0, 1.0);

    // Core stays near white so the mark reads as emissive rather than dyed;
    // the phosphor colour arrives through the fringe, the rim and the sweep.
    vec3 col = mix(u_phosphor, vec3(1.0), 0.62 * g);
    col += u_fringe * (r - b) * 0.9;
    col += u_phosphor * edge * 1.5;

    // Scan band travelling up the mark, and a slow brightness sway. Both are
    // multiplied into the alpha-masked colour, never added as a backdrop.
    float band = smoothstep(0.035, 0.0, abs(fract(u_time * 0.16) - v_uv.y));
    col += u_phosphor * band * 0.55;
    col *= 0.92 + 0.08 * sin(u_time * 1.7);

    // Horizontal tear lines: a couple of scanlines of the classic unstable
    // projection, kept subtle enough to survive at 22px tall.
    float tear = step(0.997, fract(sin(floor(v_uv.y * 90.0 + u_time * 6.0)) * 43758.5453));
    col += u_phosphor * tear * 0.2;

    float a = alpha + edge * 0.55 + band * alpha * 0.3;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

interface WarLogoProps {
  /** Source of the mark. Its alpha channel IS the hologram. */
  src: string;
  alt: string;
  className?: string;
}

export function WarLogo({ src, alt, className }: WarLogoProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Any failure path (no WebGL, texture blocked, context lost) falls back to
  // the untouched image rather than leaving a hole where the brand should be.
  const [failed, setFailed] = useState(false);

  const [reduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (reduced || failed) return;
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      setFailed(true);
      return;
    }

    const scene = new THREE.Scene();
    // Orthographic and frustum-sized: the quad always exactly fills the canvas,
    // so the logo's aspect ratio is whatever the host element already is.
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const uniforms = {
      u_map: { value: null as THREE.Texture | null },
      u_time: { value: 0 },
      u_texel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
      u_phosphor: { value: new THREE.Color(0.24, 0.96, 0.56) },
      u_fringe: { value: new THREE.Color(0.31, 0.89, 0.88) },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(quad);

    renderer.setClearAlpha(0);
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    let disposed = false;
    let texture: THREE.Texture | null = null;

    const resize = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      renderer.setSize(w, h, false);
      capPixelRatio(renderer, w, h, 400_000, 2);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    new THREE.TextureLoader().load(
      src,
      (tex) => {
        if (disposed) {
          tex.dispose();
          return;
        }
        // The shader reads alpha directly, so the texture must not be colour
        // managed on the way in.
        tex.colorSpace = THREE.NoColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        texture = tex;
        uniforms.u_map.value = tex;
        uniforms.u_texel.value.set(
          1 / Math.max(1, tex.image.width),
          1 / Math.max(1, tex.image.height),
        );
      },
      undefined,
      () => setFailed(true),
    );

    const clock = new THREE.Clock();
    const throttle = createFrameThrottle(30);
    let raf = 0;
    const animate = (now: number) => {
      raf = requestAnimationFrame(animate);
      if (!uniforms.u_map.value) return;
      if (!throttle(now)) return;
      if (renderer.getContext().isContextLost()) return;
      uniforms.u_time.value = clock.getElapsedTime();
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      texture?.dispose();
      quad.geometry.dispose();
      material.dispose();
      releaseContext(renderer);
      renderer.domElement.remove();
    };
  }, [src, reduced, failed]);

  // Reduced motion, or anything that went wrong: the plain mark, unfiltered.
  if (reduced || failed) {
    return <img src={src} alt={alt} className={className} decoding="async" />;
  }

  return (
    <div
      ref={hostRef}
      className={className}
      role="img"
      aria-label={alt}
      data-war-logo
    />
  );
}

export default WarLogo;
