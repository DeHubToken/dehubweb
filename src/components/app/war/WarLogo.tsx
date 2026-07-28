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
  uniform vec2 u_fit;
  uniform vec3 u_phosphor;
  uniform vec3 u_fringe;

  varying vec2 v_uv;

  void main() {
    // Aspect correction, equivalent to the object-contain the original <img>
    // used. Without it the quad stretches the mark across whatever box the
    // sidebar gives it, which distorted the wordmark and squashed the compact
    // mark into its 22px square. u_fit expands the sampled region on the axis
    // with slack, and anything landing outside the texture is dropped rather
    // than smeared by clamping.
    vec2 uv = (v_uv - 0.5) * u_fit + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;

    // Chromatic split: red and blue sampled a texel either side of green. Tiny
    // enough to read as refraction rather than a blur, and it is what makes the
    // mark look projected instead of printed.
    float shift = u_texel.x * 1.6;
    float r = texture2D(u_map, uv + vec2(shift, 0.0)).a;
    float g = texture2D(u_map, uv).a;
    float b = texture2D(u_map, uv - vec2(shift, 0.0)).a;
    float alpha = max(g, max(r, b));

    // Rim light from an alpha gradient. Sampling the neighbourhood and
    // subtracting the centre isolates the glyph edge, so the glow follows the
    // outline of the artwork and never bleeds into a rectangle.
    float ring = 0.0;
    ring = max(ring, texture2D(u_map, uv + vec2(u_texel.x * 2.0, 0.0)).a);
    ring = max(ring, texture2D(u_map, uv - vec2(u_texel.x * 2.0, 0.0)).a);
    ring = max(ring, texture2D(u_map, uv + vec2(0.0, u_texel.y * 2.0)).a);
    ring = max(ring, texture2D(u_map, uv - vec2(0.0, u_texel.y * 2.0)).a);
    float edge = clamp(ring - g, 0.0, 1.0);

    // Core is essentially white. An earlier mix sat at 62 percent white and
    // read as a dim green smudge at 22px, which is the size the collapsed rail
    // actually uses. The phosphor identity comes from the rim, the fringe and
    // the sweep, not from dyeing the mark itself.
    vec3 col = mix(u_phosphor, vec3(1.0), 0.88 * g);
    col += u_fringe * (r - b) * 0.9;
    col += u_phosphor * edge * 1.6;

    // Scan band travelling up the mark, and a slow brightness sway. Both are
    // multiplied into the alpha-masked colour, never added as a backdrop. The
    // sway floor is high enough that the mark never dips toward unreadable.
    float band = smoothstep(0.035, 0.0, abs(fract(u_time * 0.16) - uv.y));
    col += u_phosphor * band * 0.5;
    col *= 0.97 + 0.03 * sin(u_time * 1.7);

    // Horizontal tear lines: a couple of scanlines of the classic unstable
    // projection, kept subtle enough to survive at 22px tall.
    float tear = step(0.997, fract(sin(floor(uv.y * 90.0 + u_time * 6.0)) * 43758.5453));
    col += u_phosphor * tear * 0.18;

    // Alpha tracks the artwork's own coverage. Opacity was previously lost to
    // the same dimming that washed the colour out, which is why the collapsed
    // mark was hard to see at all.
    float a = alpha + edge * 0.5;
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
  // Bumped when a hidden host gains a box, to re-run the effect and build then.
  const [revealed, setRevealed] = useState(0);

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

    // The desktop sidebar renders BOTH marks and hides one with `display:none`,
    // swapping which as the rail collapses. Creating the scene regardless would
    // burn a GPU context and an rAF loop on something invisible, and contexts
    // are the scarce resource this theme has to budget (background, logo, boot
    // sequence and game all want one). So nothing is built until the host
    // actually has a box, and a hidden mark costs nothing at all.
    if (host.clientWidth === 0 || host.clientHeight === 0) {
      // A hidden element still reports a resize when it is revealed, which is
      // the signal to build. Re-running the effect is how that happens.
      const gate = new ResizeObserver(() => {
        if (host.clientWidth > 0 && host.clientHeight > 0) {
          gate.disconnect();
          setRevealed((n) => n + 1);
        }
      });
      gate.observe(host);
      return () => gate.disconnect();
    }

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
      // Aspect fit, recomputed whenever the texture arrives or the host
      // resizes. 1,1 means "fill", which is only correct when the box and the
      // artwork happen to share an aspect ratio.
      u_fit: { value: new THREE.Vector2(1, 1) },
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

    // Texture dimensions, once known. Kept out here so both the resize handler
    // and the texture callback can recompute the fit from whichever arrives
    // second.
    let texW = 0;
    let texH = 0;

    const applyFit = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      if (!texW || !texH) return;
      const boxAspect = w / h;
      const texAspect = texW / texH;
      // Expand the sampled region on whichever axis has slack, so the mark is
      // letterboxed inside its box rather than stretched to fill it.
      if (texAspect > boxAspect) {
        uniforms.u_fit.value.set(1, texAspect / boxAspect);
      } else {
        uniforms.u_fit.value.set(boxAspect / texAspect, 1);
      }
    };

    const resize = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      renderer.setSize(w, h, false);
      capPixelRatio(renderer, w, h, 400_000, 2);
      applyFit();
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
        texW = tex.image.width || 0;
        texH = tex.image.height || 0;
        uniforms.u_texel.value.set(
          1 / Math.max(1, texW),
          1 / Math.max(1, texH),
        );
        applyFit();
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
  }, [src, reduced, failed, revealed]);

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
