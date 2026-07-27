import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useAppTheme } from '@/contexts/ThemeContext';
import { capPixelRatio, createRenderGate, releaseContext } from '@/lib/three/scene-helpers';
import { createFrameThrottle } from '@/lib/raf-throttle';

/**
 * Globally rendered "War" background - a Modern-Warfare-style tactical map
 * readout. It sits at z-index 0 behind a social feed, so every decision below
 * is biased toward "legible chrome behind content", never "hero visual".
 *
 * LAYER STACK (renderOrder in brackets, all transparent, painter-sorted):
 *   [-1] sky      - one full-screen triangle: atmosphere wash + horizon line.
 *   [ 0] fill     - terrain surface. depthWrite ON. This is the only pass that
 *                   writes depth, and it exists so ridges OCCLUDE the lattice
 *                   behind them. Carries contour isolines, the sector grid and
 *                   the range-scan band.
 *   [ 1] lines    - the survey lattice as LineSegments with a hand-authored
 *                   rectilinear index (no diagonals, no double-drawn edges).
 *   [ 2] structs  - instanced wireframe boxes standing on the heightfield, so
 *                   the eye has verticals to measure scale against.
 *   [ 3] radar    - range-ring dial painted on the ground, depth-tested.
 *   [ 4] motes    - airborne dust drifting with the ground, not rising embers.
 *   [ 5] leaders  - vertical hairlines from ground up to each HUD marker.
 *   [ 6] markers  - instanced HUD glyphs + mono-caps labels at CONSTANT pixel
 *                   size (a real HUD does not shrink with distance).
 *
 * COST BUDGET (desktop 16:9, "high" tier, per frame):
 *   vertices  ~9.1k in the fill pass + ~9.1k in the line pass = ~18.3k
 *             invocations, each doing ONE bilinear texture fetch for height
 *             instead of the 8 sin() calls the previous revision ran. The old
 *             build issued 270,000 wireframe indices per frame with 8 sin()
 *             each; this is roughly a 15x reduction in terrain vertex work.
 *   segments  ~18.1k GL_LINES (was ~135k, half of them duplicate interior
 *             edges that additive-blended to double brightness).
 *   draw      8 calls. Instancing keeps markers+labels to one call and
 *             leaders/structures to one each.
 *   fragment  the fill pass is the only wide shader; ~35 ALU + 4 derivatives
 *             over roughly the lower 60% of a pixel-ratio-capped 2 MP frame.
 *   mobile    the plane is sized to the viewport cone, so a portrait phone
 *             builds ~3.2k vertices instead of ~9k, and "low" tier drops to a
 *             1.2 MP / 1.25x buffer at 30 fps with motes off.
 *
 * NO POST-PROCESSING. Glow is done in-shader (an exp() falloff painted inside
 * the same draw call) because the reference vocabulary is a tight 1-3 px halo
 * on a hard 1px core, which is the opposite of what UnrealBloomPass produces,
 * and because this canvas is alpha:true and composites over CSS - routing it
 * through a render target would change how that compositing works for a small
 * aesthetic gain that is first on the demotion ladder anyway.
 *
 * Unlike Cosmic/Hazy/Swarms/LavaLamp this theme is NOT hue-customisable: the
 * olive-and-HUD-cyan palette IS the theme, so there is no ThemeColorPicker
 * entry for it and no colour uniforms are wired to themeHues.
 */
export function WarBackground() {
  const { theme } = useAppTheme();
  if (theme !== 'war') return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    >
      <WarScene />
    </div>
  );
}

/* ==========================================================================
   Palette
   ==========================================================================
   These shaders write gl_FragColor straight into the sRGB-encoded default
   framebuffer with no <colorspace_fragment> include, so no linear -> sRGB
   encode ever happens. Constructing colours the usual way
   (`new THREE.Color('#4fe3e0')`) would store the LINEAR-sRGB triple and ship
   it verbatim, displaying as roughly #15C1BE: darker and greener than the
   --war-hud the CSS chrome paints. Building them in the working space with
   LinearSRGBColorSpace suppresses the convert, so the canvas accent matches
   war-theme.css exactly. Keep these numbers in sync with the token block at
   the top of src/styles/war-theme.css.
   ========================================================================== */

const warColor = (r: number, g: number, b: number): THREE.Color =>
  new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.LinearSRGBColorSpace);

/** Locked palette. One accent. Mirrors the tokens in styles/war-theme.css. */
export const WAR_PALETTE = {
  hud: warColor(79, 227, 224), // --war-hud, the single accent
  hudDim: warColor(44, 132, 131), // --war-hud-dim, inactive strokes
  olive: warColor(47, 58, 36), // --war-olive
  deep: warColor(8, 14, 13), // valley fill
  sky: warColor(10, 21, 19), // horizon / fog colour
} as const;

/* ==========================================================================
   Fixed scene constants
   ========================================================================== */

const VIEW_FOV = 58; // vertical fov, degrees
const TAN_HALF_FOV = Math.tan((VIEW_FOV * Math.PI) / 360);

const CAM_Y = 4.5;
const CAM_Z = 14;
const CAM_PITCH = -0.16; // radians, negative = looking down

const GROUND_Y = -3; // world y of the undisplaced terrain plane
const MESH_Z = -46; // world z of the terrain plane centre
const TERRAIN_DEPTH = 120; // world units along the view axis
const HEIGHT_AMP = 6.5;
const FIELD_SPAN = 210; // world units per heightfield tile repeat
const FOG_DENSITY = 0.0165; // exp-squared fog; ~97% opaque by 120 units
const SCROLL_SPEED = 3.1; // world units per second the ground travels
const SECTOR_SIZE = 20; // minor sector cell, world units

/** Ellipse (plane-local) inside which the terrain is flattened. Centred on the
 *  camera's own ground projection, elongated along the view axis, so the band
 *  of screen where feed copy sits always has calm ground behind it. */
const BASIN_CENTER_Y = MESH_Z - CAM_Z + 16; // 16 world units ahead of camera
const BASIN_RADIUS_X = 30;
const BASIN_RADIUS_Y = 34;

/** One clock drives everything: the radar completes a revolution every 6 s and
 *  the ground range-scan one outward pass every 12 s, so every second radar
 *  revolution coincides with a ground sweep and the two read as one system
 *  rather than two unrelated screensavers. */
const SWEEP_PERIOD = 6;
const SCAN_PERIOD = 12;

/** Composition time used for the single static frame under reduced motion.
 *  Hoisted so a resize redraw is pixel-identical to the first paint. */
const STATIC_T = 6;

/** Streaming spans for the recycled world-space props. */
const MARKER_SPAN = 150;
const MARKER_RECYCLE_Z = CAM_Z - 6;
const STRUCT_SPAN = 170;
const STRUCT_RECYCLE_Z = CAM_Z - 22;

/** Marker glyph half-size and label box, in CSS pixels. Constant on screen.
 *  LABEL_W:LABEL_H matches the atlas cell aspect (88:26) so text is never
 *  stretched, and lands the baked 16px type at roughly 9px on screen. */
const MARKER_PX = 13;
const LABEL_W = 51;
const LABEL_H = 15;

/** Mote sprite size in CSS pixels before the pixel-ratio correction. */
const MOTE_PX = 2.4;

/* ==========================================================================
   Device tier + budgets
   ==========================================================================
   Feature detection alone mispredicts constantly on Android, so this is only
   the STARTING budget - the measured demotion ladder in the render loop is
   what actually protects users (see LADDER below).
   ========================================================================== */

type Tier = 'low' | 'mid' | 'high';

function detectTier(): Tier {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  const mem = nav.deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (nav.connection?.saveData === true || mem <= 2 || cores <= 4) return 'low';
  if (window.matchMedia('(pointer: coarse)').matches || mem <= 4) return 'mid';
  return 'high';
}

interface Budget {
  /** Target world-unit size of one lattice cell. Drives the vertex count. */
  cell: number;
  markers: number;
  structures: number;
  motes: number;
  fps: number;
  maxPixels: number;
  maxRatio: number;
  /** Horizon haze multiplier. Pure fill rate, so it is the first thing cut. */
  haze: number;
  /** Sector-grid gain. 0 skips the two derivative pairs in the fill shader. */
  grid: number;
}

const BUDGETS: Record<Tier, Budget> = {
  low: {
    cell: 2.9,
    markers: 8,
    structures: 4,
    motes: 0,
    fps: 30,
    maxPixels: 1_200_000,
    maxRatio: 1.25,
    haze: 0,
    grid: 0,
  },
  mid: {
    cell: 2.15,
    markers: 14,
    structures: 8,
    motes: 300,
    fps: 60,
    maxPixels: 2_000_000,
    maxRatio: 1.5,
    haze: 0.35,
    grid: 1,
  },
  high: {
    cell: 1.7,
    markers: 24,
    structures: 14,
    motes: 700,
    fps: 60,
    maxPixels: 2_000_000,
    maxRatio: 1.5,
    haze: 1,
    grid: 1,
  },
};

/* ==========================================================================
   Heightfield
   ==========================================================================
   Baked ONCE at mount into a 256x256 R8 DataTexture (64 KB VRAM, ~5 ms of
   main thread). The vertex shader then does a single bilinear fetch instead of
   two octaves of value noise, i.e. one texture read replaces 8 sin() calls.
   The float source array is kept so CPU-side consumers (marker and structure
   placement, and any future gameplay) read ground height from the exact same
   field the shader draws.
   ========================================================================== */

const FIELD_RES = 256;

interface Heightfield {
  texture: THREE.DataTexture;
  data: Float32Array;
  /** Bilinear sample in tile units (wraps), matching texture2D exactly. */
  sample: (u: number, v: number) => number;
  dispose: () => void;
}

function fieldHash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177)) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

/** Periodic value noise. `cells` divides FIELD_RES, so the tile wraps cleanly
 *  and RepeatWrapping never shows a seam. */
function periodicNoise(u: number, v: number, cells: number, seed: number): number {
  const x = u * cells;
  const y = v * cells;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % cells) + cells) % cells;
  const x1 = (x0 + 1) % cells;
  const y0 = ((iy % cells) + cells) % cells;
  const y1 = (y0 + 1) % cells;
  const n00 = fieldHash(x0, y0, seed);
  const n10 = fieldHash(x1, y0, seed);
  const n01 = fieldHash(x0, y1, seed);
  const n11 = fieldHash(x1, y1, seed);
  return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy;
}

function createHeightfield(res: number): Heightfield {
  const data = new Float32Array(res * res);
  const bytes = new Uint8Array(res * res);
  const octaves = [
    { cells: 8, amp: 1, seed: 11 },
    { cells: 16, amp: 0.46, seed: 29 },
    { cells: 32, amp: 0.2, seed: 53 },
  ];
  let norm = 0;
  for (let o = 0; o < octaves.length; o++) norm += octaves[o].amp;

  for (let j = 0; j < res; j++) {
    const v = j / res;
    for (let i = 0; i < res; i++) {
      const u = i / res;
      let h = 0;
      for (let o = 0; o < octaves.length; o++) {
        h += periodicNoise(u, v, octaves[o].cells, octaves[o].seed) * octaves[o].amp;
      }
      h /= norm;
      // Widen the valleys and sharpen the ridges so contour isolines band the
      // way survey data does instead of pooling in the mid tones.
      h = h * h * (3 - 2 * h);
      h = Math.pow(h, 1.25);
      const k = j * res + i;
      data[k] = h;
      bytes[k] = Math.max(0, Math.min(255, Math.round(h * 255)));
    }
  }

  const texture = new THREE.DataTexture(bytes, res, res, THREE.RedFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  const sample = (u: number, v: number): number => {
    const fx = (((u % 1) + 1) % 1) * res - 0.5;
    const fy = (((v % 1) + 1) % 1) * res - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const i0 = ((x0 % res) + res) % res;
    const i1 = (i0 + 1) % res;
    const j0 = ((y0 % res) + res) % res;
    const j1 = (j0 + 1) % res;
    const a = data[j0 * res + i0];
    const b = data[j0 * res + i1];
    const c = data[j1 * res + i0];
    const d = data[j1 * res + i1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };

  return { texture, data, sample, dispose: () => texture.dispose() };
}

/* ==========================================================================
   Terrain geometry
   ==========================================================================
   PlaneGeometry supplies position + uv + the triangle index used by the fill
   pass. The line pass gets a SECOND BufferGeometry that SHARES the same
   position BufferAttribute (one VBO on the GPU) with a hand-authored
   rectilinear index: horizontal edges then vertical edges, every edge exactly
   once. `material.wireframe = true` would instead emit (a,b, b,c, c,a) per
   triangle - every interior edge twice, plus each quad's diagonal - which is
   both ~2x the raster work and the wrong vocabulary (a triangulated low-poly
   net rather than a rectilinear survey lattice).
   ========================================================================== */

interface TerrainGeometry {
  fill: THREE.BufferGeometry;
  lines: THREE.BufferGeometry;
  /** Actual world-unit spacing along the view axis. The lattice scroll wraps
   *  by exactly this, so it must match the geometry, not the requested cell. */
  cell: number;
  segments: number;
  vertices: number;
}

function buildTerrainGeometry(width: number, depth: number, cell: number): TerrainGeometry {
  const segX = Math.max(8, Math.round(width / cell));
  const segY = Math.max(8, Math.round(depth / cell));
  const nx = segX + 1;
  const ny = segY + 1;

  const fill = new THREE.PlaneGeometry(width, depth, segX, segY);

  const segments = ny * segX + nx * segY;
  const index = new Uint32Array(segments * 2);
  let p = 0;
  for (let r = 0; r < ny; r++) {
    const row = r * nx;
    for (let c = 0; c < segX; c++) {
      index[p++] = row + c;
      index[p++] = row + c + 1;
    }
  }
  for (let c = 0; c < nx; c++) {
    for (let r = 0; r < segY; r++) {
      index[p++] = r * nx + c;
      index[p++] = (r + 1) * nx + c;
    }
  }

  const lines = new THREE.BufferGeometry();
  lines.setAttribute('position', fill.getAttribute('position'));
  lines.setIndex(new THREE.BufferAttribute(index, 1));

  return { fill, lines, cell: depth / segY, segments, vertices: nx * ny };
}

/** How wide the ground plane has to be for its far edge to still cover the
 *  viewport cone. Clamped so a portrait phone does not pay for a plane it
 *  cannot see and an ultrawide does not blow the vertex budget. */
function requiredTerrainWidth(aspect: number): number {
  const a = Math.min(Math.max(aspect, 1), 2.7);
  const w = 92 * a * TAN_HALF_FOV * 2 * 1.18;
  return Math.min(340, Math.max(104, w));
}

/* ==========================================================================
   Label atlas
   ==========================================================================
   ONE 88x208 CanvasTexture (73 KB), 8 rows of mono-caps strings. Bare shapes
   read as generic sci-fi; mono-caps text is what reads as tactical. Characters
   are drawn one at a time at a fixed advance because ctx.letterSpacing is not
   available everywhere and the wide tracking is the whole point. The cell is
   sized to the widest string so the label quad wastes no width, and the atlas
   is baked at roughly 1.7x the on-screen size so it downsamples cleanly.
   ========================================================================== */

const LABEL_ROWS = 8;
const LABEL_TEXT = ['TGT-01', 'WPT', 'LOCK', 'SCAN', 'SECTOR', 'ELEV', 'RNG', 'NO SIG'];
const ATLAS_W = 88;
const ATLAS_CELL_H = 26;
const ATLAS_ADVANCE = 13;

function createLabelAtlas(): THREE.Texture | null {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_CELL_H * LABEL_ROWS;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  ctx.font =
    "600 16px ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

  for (let row = 0; row < LABEL_ROWS; row++) {
    const text = LABEL_TEXT[row] ?? '';
    const baseline = row * ATLAS_CELL_H + 19;
    let x = 3;
    for (let i = 0; i < text.length; i++) {
      ctx.fillText(text[i], x, baseline);
      x += ATLAS_ADVANCE;
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  // v = 0 is the TOP of the canvas, which makes the row maths in the marker
  // vertex shader a plain (row + 1 - uv.y) / rows.
  texture.flipY = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/* ==========================================================================
   Shader source
   ========================================================================== */

/** Shared displacement + basin, injected into both terrain vertex shaders and
 *  (basin only) into the prop shaders so props sit on the same ground. */
const BASIN_GLSL = /* glsl */ `
  uniform vec2 u_basinCenter;
  uniform vec2 u_basinRadii;

  float warBasin(vec2 local) {
    vec2 d = (local - u_basinCenter) / u_basinRadii;
    return smoothstep(0.25, 1.0, length(d));
  }
`;

/** Luminance clamp. Nothing in this scene may put more than u_maxLuma behind
 *  free-floating body copy, so the WCAG guarantee is structural rather than a
 *  matter of authoring taste. Additive layers scale alpha, the normal-blended
 *  fill scales colour (its blend attenuates the backdrop, so bounding the
 *  source colour is the correct bound on the result). */
const LUMA_GLSL = /* glsl */ `
  const vec3 WAR_LUMA = vec3(0.2126, 0.7152, 0.0722);
  float warClampAlpha(vec3 col, float alpha, float maxLuma) {
    float l = dot(col * alpha, WAR_LUMA);
    float over = max(l - maxLuma, 0.0);
    return alpha * (1.0 - over / max(l, 1e-4));
  }
  vec3 warClampColor(vec3 col, float maxLuma) {
    float l = dot(col, WAR_LUMA);
    return col * min(1.0, maxLuma / max(l, 1e-4));
  }
`;

const TERRAIN_VERT = /* glsl */ `
  uniform sampler2D u_height;
  uniform float u_travel;
  uniform float u_cell;
  uniform float u_uvScale;
  uniform float u_amp;
  ${BASIN_GLSL}

  varying float v_h;
  varying float v_disp;
  varying float v_depth;
  varying vec2 v_local;

  void main() {
    // Scroll the LATTICE, wrapped to exactly one cell, so the grid visibly
    // travels toward the camera. Wrapping on the cell makes the uniform grid
    // seamless by construction, and sampling the height in the un-wrapped
    // ground frame keeps terrain features locked to the ground while the
    // lattice slides over them.
    float shift = mod(u_travel, u_cell);
    vec2 local = vec2(position.x, position.y - shift);
    vec2 ground = vec2(local.x, local.y + u_travel);

    float h = texture2D(u_height, ground * u_uvScale).r;
    float basin = warBasin(local);
    float disp = h * u_amp * basin;

    vec4 mv = modelViewMatrix * vec4(local.x, local.y, disp, 1.0);

    v_h = h * basin;
    v_disp = disp;
    v_depth = -mv.z;
    v_local = local;
    gl_Position = projectionMatrix * mv;
  }
`;

const TERRAIN_FILL_FRAG = /* glsl */ `
  uniform vec3 u_hud;
  uniform vec3 u_hudDim;
  uniform vec3 u_olive;
  uniform vec3 u_deep;
  uniform vec3 u_sky;
  uniform vec2 u_basinCenter;
  uniform float u_scanPhase;
  uniform float u_sectorTravel;
  uniform float u_gridGain;
  uniform float u_fogDensity;
  uniform float u_maxLuma;
  uniform float u_gain;
  ${LUMA_GLSL}

  varying float v_h;
  varying float v_disp;
  varying float v_depth;
  varying vec2 v_local;

  void main() {
    // Deliberately NEAR-BLACK. This pass exists to occlude, not to add
    // brightness: keeping the substrate dark is what leaves the isolines and
    // the sector grid enough local contrast to read once the luminance clamp
    // below trims the peaks.
    vec3 col = mix(u_deep, u_olive, smoothstep(0.06, 0.62, v_h)) * 0.45;

    // Contour isolines. A survey readout bands elevation into discrete lines;
    // a continuous colour ramp does not read as one.
    float e = v_h * 15.0;
    float aa = fwidth(e) * 1.3;
    float f = fract(e);
    float iso = 1.0 - smoothstep(0.0, aa, min(f, 1.0 - f));
    float E = e * 0.2;
    float aaM = fwidth(E) * 1.3;
    float fM = fract(E);
    float major = 1.0 - smoothstep(0.0, aaM, min(fM, 1.0 - fM));
    col = mix(col, u_hudDim * 0.6, clamp(iso * 0.45 + major * 0.55, 0.0, 1.0));

    // Sector grid: the map's coordinate frame. Deliberately NOT offset by the
    // lattice scroll - it drifts at a quarter of the ground speed so it reads
    // as a slowly updating coordinate system rather than motion lines.
    float grid = 0.0;
    if (u_gridGain > 0.0) {
      vec2 g = vec2(v_local.x, v_local.y + u_sectorTravel) / 20.0;
      vec2 gm = abs(fract(g) - 0.5);
      float ga = max(fwidth(g.x), fwidth(g.y)) * 1.2;
      float minor = 1.0 - smoothstep(0.0, ga, min(gm.x, gm.y));
      vec2 G = g * 0.2;
      vec2 Gm = abs(fract(G) - 0.5);
      float Ga = max(fwidth(G.x), fwidth(G.y)) * 1.2;
      float maj = 1.0 - smoothstep(0.0, Ga, min(Gm.x, Gm.y));
      grid = (minor * 0.3 + maj) * u_gridGain;
    }
    col += u_hud * grid * 0.22;

    // Range scan, one outward pass per SCAN_PERIOD, emanating from the
    // camera's own ground point on the shared sweep clock.
    float r = length(v_local - u_basinCenter);
    float wave = fract(u_scanPhase - r * 0.0125);
    float band = smoothstep(0.0, 0.05, wave) * (1.0 - smoothstep(0.05, 0.2, wave));
    col += u_hud * band * 0.32;

    // Exp-squared fog dissolving INTO the horizon colour, plus a height-fog
    // mist so ridges punch out of a low haze instead of every line fading
    // uniformly. Four instructions, the cheapest atmosphere available.
    float fog = 1.0 - exp(-pow(v_depth * u_fogDensity, 2.0));
    float mist = exp(-max(v_disp, 0.0) * 0.35);
    col = mix(col, u_sky, fog * 0.85);

    float alpha = (0.72 + band * 0.1) * (1.0 - fog) * mix(1.0, 0.62, mist) * u_gain;
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(warClampColor(col, u_maxLuma), clamp(alpha, 0.0, 1.0));
  }
`;

const TERRAIN_LINE_FRAG = /* glsl */ `
  uniform vec3 u_hud;
  uniform vec3 u_hudDim;
  uniform vec2 u_basinCenter;
  uniform float u_scanPhase;
  uniform float u_fogDensity;
  uniform float u_maxLuma;
  uniform float u_gain;
  ${LUMA_GLSL}

  varying float v_h;
  varying float v_disp;
  varying float v_depth;
  varying vec2 v_local;

  void main() {
    vec3 col = mix(u_hudDim, u_hud, smoothstep(0.12, 0.8, v_h));

    float r = length(v_local - u_basinCenter);
    float wave = fract(u_scanPhase - r * 0.0125);
    float band = smoothstep(0.0, 0.05, wave) * (1.0 - smoothstep(0.05, 0.2, wave));
    col += u_hud * band * 0.7;

    float fog = 1.0 - exp(-pow(v_depth * u_fogDensity, 2.0));
    float near = mix(0.22, 1.0, smoothstep(5.0, 26.0, v_depth));

    float alpha = (0.26 + v_h * 0.46 + band * 0.55) * (1.0 - fog) * near * u_gain;
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(col, clamp(warClampAlpha(col, alpha, u_maxLuma), 0.0, 1.0));
  }
`;

const SKY_VERT = /* glsl */ `
  varying vec2 v_ndc;
  void main() {
    v_ndc = position.xy;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 u_hud;
  uniform vec3 u_sky;
  uniform float u_horizonY;
  uniform float u_haze;
  uniform float u_flash;
  uniform float u_maxLuma;
  uniform float u_gain;
  ${LUMA_GLSL}

  varying vec2 v_ndc;

  void main() {
    float d = v_ndc.y - u_horizonY;

    float core = 1.0 - smoothstep(0.0, 0.0045, abs(d));   // hard 1-2px line
    float haze = exp(-max(d, 0.0) * 20.0) * 0.2 * u_haze; // bloom above only
    float spill = exp(-max(-d, 0.0) * 9.0) * 0.09;        // faint ground spill
    float wash = exp(-max(d, 0.0) * 2.2) * 0.32;          // atmosphere

    vec3 col = mix(u_sky, u_hud, clamp(core * 0.92 + haze * 0.5, 0.0, 1.0));
    float alpha = (core * 0.5 * (0.72 + u_flash * 0.55) + haze + spill + wash * 0.26) * u_gain;
    if (alpha < 0.003) discard;

    gl_FragColor = vec4(col, clamp(warClampAlpha(col, alpha, u_maxLuma), 0.0, 1.0));
  }
`;

const RADAR_VERT = /* glsl */ `
  varying vec2 v_uv;
  void main() {
    v_uv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RADAR_FRAG = /* glsl */ `
  uniform vec3 u_hud;
  uniform float u_sweepPhase;
  uniform float u_maxLuma;
  uniform float u_gain;
  ${LUMA_GLSL}

  varying vec2 v_uv;

  void main() {
    vec2 p = v_uv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;

    // Range rings.
    float rings = abs(sin(r * 16.0));
    float ringMask = (1.0 - smoothstep(0.0, 0.2, rings)) * (1.0 - r);

    // Radial tick marks around the outer bezel - the detail that turns a set
    // of circles into a dial.
    float ang = atan(p.y, p.x);
    float ticks = abs(fract(ang * 5.7295779 + 0.5) - 0.5);
    float tickMask = (1.0 - smoothstep(0.0, 0.06, ticks)) * smoothstep(0.72, 0.86, r) * (1.0 - smoothstep(0.92, 1.0, r));

    // Sweep wedge on the shared 6 s clock, decaying into a trail so the
    // rotation direction is readable.
    float sweep = ang + 3.14159265;
    float head = mod(u_sweepPhase * 6.2831853, 6.2831853);
    float trail = mod(head - sweep, 6.2831853);
    float wedge = exp(-trail * 2.4) * (1.0 - smoothstep(0.75, 1.0, r));

    float a = (ringMask * 0.2 + tickMask * 0.34 + wedge * 0.42) * (1.0 - smoothstep(0.62, 1.0, r)) * u_gain;
    if (a < 0.003) discard;

    gl_FragColor = vec4(u_hud, clamp(warClampAlpha(u_hud, a, u_maxLuma), 0.0, 1.0));
  }
`;

const MOTE_VERT = /* glsl */ `
  uniform float u_time;
  uniform float u_travel;
  uniform float u_size;
  uniform float u_span;
  uniform float u_camZ;
  uniform float u_dpr;
  attribute float a_seed;
  varying float v_fade;

  void main() {
    vec3 p = position;
    // Drift WITH the ground plus a lateral wind term, so this reads as
    // airborne dust in the air the camera is moving through rather than as
    // embers rising out of the floor.
    p.z = mod(p.z + u_travel * 0.55, u_span) - u_span + u_camZ + 8.0;
    p.x += sin(u_time * 0.21 + a_seed * 6.2831853) * 1.6;
    p.y += sin(u_time * 0.13 + a_seed * 12.566) * 0.5;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float depth = -mv.z;
    v_fade = smoothstep(3.0, 16.0, depth) * (1.0 - smoothstep(38.0, 95.0, depth));
    gl_PointSize = clamp(u_size * (30.0 / max(depth, 1.0)), 1.0, 6.0 * u_dpr);
    gl_Position = projectionMatrix * mv;
  }
`;

const MOTE_FRAG = /* glsl */ `
  uniform vec3 u_hud;
  varying float v_fade;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = (1.0 - smoothstep(0.12, 0.5, d)) * v_fade * 0.34;
    if (a < 0.004) discard;
    gl_FragColor = vec4(u_hud, a);
  }
`;

/** Shared prop placement: markers, their leaders and the structures all sit on
 *  the same displaced ground and stream toward the camera at the ground speed,
 *  so their sampled height stays valid for their whole life. */
const PROP_PLACE_GLSL = /* glsl */ `
  uniform float u_travel;
  uniform float u_meshZ;
  uniform float u_meshY;
  uniform float u_amp;
  ${BASIN_GLSL}

  vec3 warPropBase(vec3 offset) {
    float worldZ = offset.z + u_travel;
    vec2 local = vec2(offset.x, u_meshZ - worldZ);
    float baseY = u_meshY + offset.y * u_amp * warBasin(local);
    return vec3(offset.x, baseY, worldZ);
  }
`;

const MARKER_VERT = /* glsl */ `
  ${PROP_PLACE_GLSL}
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform float u_markerPx;
  uniform float u_labelW;
  uniform float u_labelH;
  uniform float u_fogNear;
  uniform float u_fogFar;

  attribute float a_part;      // 0 = glyph quad, 1 = label quad
  attribute vec3 a_offset;     // x, raw height 0..1, base z
  attribute vec4 a_meta;       // kind, label row, lift, acquire time

  varying vec2 v_uv;
  varying float v_part;
  varying float v_kind;
  varying float v_fade;

  void main() {
    vec3 base = warPropBase(a_offset);
    vec3 world = vec3(base.x, base.y + a_meta.z, base.z);

    vec4 mv = modelViewMatrix * vec4(world, 1.0);
    vec4 clip = projectionMatrix * mv;
    float depth = -mv.z;

    // Lock-on: the frame arrives oversized and snaps inward over 260 ms.
    float state = clamp((u_time - a_meta.w) / 0.26, 0.0, 1.0);
    float ease = 1.0 - pow(1.0 - state, 4.0);
    float scale = mix(2.6, 1.0, ease);

    v_part = a_part;
    v_kind = a_meta.x;
    v_fade = (1.0 - smoothstep(u_fogNear, u_fogFar, depth)) * ease;

    // Constant PIXEL size: a HUD annotation does not shrink with distance.
    vec2 px;
    if (a_part < 0.5) {
      px = position.xy * u_markerPx * scale;
      v_uv = uv;
    } else {
      px = vec2(u_markerPx * scale + 7.0 + uv.x * u_labelW, (uv.y - 0.5) * u_labelH);
      v_uv = vec2(uv.x, (a_meta.y + 1.0 - uv.y) / ${LABEL_ROWS}.0);
    }

    if (clip.w <= 0.05) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // cull behind the camera
    } else {
      clip.xy += px / u_resolution * 2.0 * clip.w;
      gl_Position = clip;
    }
  }
`;

const MARKER_FRAG = /* glsl */ `
  uniform sampler2D u_atlas;
  uniform vec3 u_hud;
  uniform float u_labelOn;
  uniform float u_flash;
  uniform float u_gain;

  varying vec2 v_uv;
  varying float v_part;
  varying float v_kind;
  varying float v_fade;

  float warGlyph(vec2 p, float kind) {
    float aa = 0.1;
    // 0 - diamond target
    float g0 = 1.0 - smoothstep(0.0, aa, abs(abs(p.x) + abs(p.y) - 0.78));
    // 1 - four-corner bracket lock
    float o = max(abs(p.x), abs(p.y));
    float mi = min(abs(p.x), abs(p.y));
    float g1 = smoothstep(0.8 - aa, 0.8, o)
             * (1.0 - smoothstep(0.98, 0.98 + aa, o))
             * (1.0 - smoothstep(0.34, 0.34 + aa, mi));
    // 2 - waypoint tick
    float gx = (1.0 - smoothstep(0.0, aa, abs(p.x))) * (1.0 - smoothstep(0.55, 0.55 + aa, abs(p.y)));
    float gy = (1.0 - smoothstep(0.0, aa, abs(p.y))) * (1.0 - smoothstep(0.55, 0.55 + aa, abs(p.x)));
    float g2 = max(gx, gy);
    // 3 - hazard chevron
    float g3 = (1.0 - smoothstep(0.0, aa * 1.4, abs(abs(p.x) - (p.y + 0.45))))
             * (1.0 - smoothstep(0.85, 0.95, o));

    float g = mix(g0, g1, step(0.5, kind));
    g = mix(g, g2, step(1.5, kind));
    g = mix(g, g3, step(2.5, kind));
    return g;
  }

  void main() {
    float bright = 0.72 + u_flash * 0.4;

    if (v_part > 0.5) {
      float m = texture2D(u_atlas, v_uv).a;
      float a = m * v_fade * u_labelOn * 0.55 * u_gain;
      if (a < 0.004) discard;
      gl_FragColor = vec4(u_hud, a);
      return;
    }

    vec2 p = v_uv * 2.0 - 1.0;
    float g = warGlyph(p, v_kind);
    // In-shader glow: a tight halo painted inside the same draw call. This is
    // the entire glow system - no post pass, no wide gaussian halo.
    float halo = exp(-length(p) * 3.0) * 0.16;
    float a = (g * 0.8 * bright + halo) * v_fade * u_gain;
    if (a < 0.004) discard;
    gl_FragColor = vec4(u_hud, clamp(a, 0.0, 1.0));
  }
`;

const LEADER_VERT = /* glsl */ `
  ${PROP_PLACE_GLSL}
  uniform float u_time;
  uniform float u_fogNear;
  uniform float u_fogFar;

  attribute vec3 a_offset;
  attribute vec4 a_meta;

  varying float v_fade;
  varying float v_frac;

  void main() {
    vec3 base = warPropBase(a_offset);
    float y = base.y + a_meta.z * position.y;

    vec4 mv = modelViewMatrix * vec4(base.x, y, base.z, 1.0);
    float state = clamp((u_time - a_meta.w) / 0.26, 0.0, 1.0);

    v_frac = position.y;
    v_fade = (1.0 - smoothstep(u_fogNear, u_fogFar, -mv.z)) * state;
    gl_Position = projectionMatrix * mv;
  }
`;

const LEADER_FRAG = /* glsl */ `
  uniform vec3 u_hud;
  uniform float u_gain;
  varying float v_fade;
  varying float v_frac;
  void main() {
    float a = (1.0 - v_frac * 0.72) * 0.2 * v_fade * u_gain;
    if (a < 0.004) discard;
    gl_FragColor = vec4(u_hud, a);
  }
`;

const STRUCT_VERT = /* glsl */ `
  ${PROP_PLACE_GLSL}
  uniform vec2 u_basinCenterScan;
  uniform float u_scanPhase;

  attribute vec3 a_offset;
  attribute vec3 a_scale;

  varying float v_depth;
  varying float v_frac;
  varying float v_glow;

  void main() {
    vec3 base = warPropBase(a_offset);
    vec3 p = vec3(
      base.x + position.x * a_scale.x,
      base.y + (position.y + 0.5) * a_scale.y,
      base.z + position.z * a_scale.z
    );

    vec2 local = vec2(a_offset.x, u_meshZ - base.z);
    float r = length(local - u_basinCenterScan);
    float wave = fract(u_scanPhase - r * 0.0125);
    v_glow = smoothstep(0.0, 0.05, wave) * (1.0 - smoothstep(0.05, 0.2, wave));

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    v_depth = -mv.z;
    v_frac = position.y + 0.5;
    gl_Position = projectionMatrix * mv;
  }
`;

const STRUCT_FRAG = /* glsl */ `
  uniform vec3 u_hud;
  uniform vec3 u_hudDim;
  uniform float u_fogDensity;
  uniform float u_maxLuma;
  uniform float u_gain;
  ${LUMA_GLSL}

  varying float v_depth;
  varying float v_frac;
  varying float v_glow;

  void main() {
    // The scan flare is what makes a structure read as DETECTED rather than
    // merely drawn.
    vec3 col = mix(u_hudDim, u_hud, clamp(v_glow, 0.0, 1.0));
    float fog = 1.0 - exp(-pow(v_depth * u_fogDensity, 2.0));
    float a = (0.3 + v_glow * 0.5) * (1.0 - v_frac * 0.35) * (1.0 - fog) * u_gain;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(warClampAlpha(col, a, u_maxLuma), 0.0, 1.0));
  }
`;

/* ==========================================================================
   Scene
   ========================================================================== */

function WarScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const transparencyQuery = window.matchMedia('(prefers-reduced-transparency: reduce)');
    const finePointerQuery = window.matchMedia('(pointer: fine)');

    let motionReduced = motionQuery.matches;

    const tier = detectTier();
    const budget = BUDGETS[tier];

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      VIEW_FOV,
      window.innerWidth / window.innerHeight,
      0.5,
      // Tightened from 400: the farthest visible geometry is ~130 units out,
      // and a tight far plane buys depth precision for the fill pass, which is
      // now the pass that provides occlusion.
      220,
    );
    camera.position.set(0, CAM_Y, CAM_Z);
    camera.rotation.order = 'YXZ';
    camera.rotation.x = CAM_PITCH;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      // No WebGL (blocked, or the ~16-context ceiling hit by theme churn).
      // The CSS layer paints the olive backdrop, so bail silently.
      return;
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
    capPixelRatio(renderer, window.innerWidth, window.innerHeight, budget.maxPixels, budget.maxRatio);
    renderer.domElement.addEventListener(
      'webglcontextlost',
      (e) => e.preventDefault(),
      false,
    );
    mount.appendChild(renderer.domElement);

    const field = createHeightfield(FIELD_RES);
    const atlas = createLabelAtlas();

    /* ---- shared uniforms ------------------------------------------------ */
    // One object graph, spread into each material, so every layer runs off the
    // same clock and the same ground definition.
    const shared = {
      u_time: { value: 0 },
      u_travel: { value: 0 },
      u_sweepPhase: { value: 0 },
      u_scanPhase: { value: 0 },
      u_sectorTravel: { value: 0 },
      u_flash: { value: 0 },
      u_height: { value: field.texture },
      u_cell: { value: 2 },
      u_uvScale: { value: 1 / FIELD_SPAN },
      u_amp: { value: HEIGHT_AMP },
      u_meshZ: { value: MESH_Z },
      u_meshY: { value: GROUND_Y },
      u_fogDensity: { value: FOG_DENSITY },
      u_basinCenter: { value: new THREE.Vector2(0, BASIN_CENTER_Y) },
      u_basinRadii: { value: new THREE.Vector2(BASIN_RADIUS_X, BASIN_RADIUS_Y) },
      u_hud: { value: WAR_PALETTE.hud.clone() },
      u_hudDim: { value: WAR_PALETTE.hudDim.clone() },
      u_olive: { value: WAR_PALETTE.olive.clone() },
      u_deep: { value: WAR_PALETTE.deep.clone() },
      u_sky: { value: WAR_PALETTE.sky.clone() },
    };

    /* ---- [-1] sky + horizon --------------------------------------------- */
    // One full-screen triangle. The horizon's NDC y is derived from the camera
    // pitch each frame (2 ops, no matrix work); roll never exceeds ~0.01 rad,
    // so ignoring it costs sub-pixel error.
    const skyGeo = new THREE.BufferGeometry();
    skyGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );
    const skyUniforms = {
      u_hud: shared.u_hud,
      u_sky: shared.u_sky,
      u_flash: shared.u_flash,
      u_horizonY: { value: 0.29 },
      u_haze: { value: budget.haze },
      // Higher cap than the fill: the horizon core is a 1-2 px line, so it is
      // never the surface a paragraph sits on. At 0.20 it still measures
      // ~6.4:1 against --war-sand if copy landed exactly on it.
      u_maxLuma: { value: 0.2 },
      u_gain: { value: 1 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    scene.add(sky);

    /* ---- [0] terrain fill + [1] terrain lattice ------------------------- */
    const fillUniforms = {
      ...shared,
      u_gridGain: { value: budget.grid },
      // COLOUR cap (this pass is normal-blended, so bounding the source colour
      // bounds the result). The fill also never exceeds ~0.72 alpha over a
      // near-black backdrop, so the effective framebuffer ceiling is ~0.22
      // sRGB: about 6:1 against --war-sand before any other layer lands.
      u_maxLuma: { value: 0.3 },
      u_gain: { value: 1 },
    };
    const fillMat = new THREE.ShaderMaterial({
      uniforms: fillUniforms,
      vertexShader: TERRAIN_VERT,
      fragmentShader: TERRAIN_FILL_FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: true, // the only depth writer: this is what gives occlusion
      blending: THREE.NormalBlending,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1, // push the surface back so the lattice never z-fights
    });

    const lineUniforms = {
      ...shared,
      // Lattice strokes are 1 px and sparse, so they get a looser cap than the
      // area fill. 0.15 sRGB is ~7.7:1 against --war-sand at the peak pixel.
      u_maxLuma: { value: 0.15 },
      u_gain: { value: 1 },
    };
    const lineMat = new THREE.ShaderMaterial({
      uniforms: lineUniforms,
      vertexShader: TERRAIN_VERT,
      fragmentShader: TERRAIN_LINE_FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    let builtWidth = requiredTerrainWidth(window.innerWidth / window.innerHeight);
    let halfSpanX = builtWidth / 2;
    const initialTerrain = buildTerrainGeometry(builtWidth, TERRAIN_DEPTH, budget.cell);
    shared.u_cell.value = initialTerrain.cell;

    let fillGeo: THREE.BufferGeometry = initialTerrain.fill;
    let lineGeo: THREE.BufferGeometry = initialTerrain.lines;

    const terrainFill = new THREE.Mesh(fillGeo, fillMat);
    terrainFill.rotation.x = -Math.PI / 2;
    terrainFill.position.set(0, GROUND_Y, MESH_Z);
    // The bounding sphere is computed from the UNDISPLACED plane and both
    // objects always fill the view, so culling here can only ever be wrong.
    terrainFill.frustumCulled = false;
    terrainFill.renderOrder = 0;
    scene.add(terrainFill);

    const terrainLines = new THREE.LineSegments(lineGeo, lineMat);
    terrainLines.rotation.x = -Math.PI / 2;
    terrainLines.position.set(0, GROUND_Y, MESH_Z);
    terrainLines.frustumCulled = false;
    terrainLines.renderOrder = 1;
    scene.add(terrainLines);

    const applyTerrainWidth = (width: number) => {
      const built = buildTerrainGeometry(width, TERRAIN_DEPTH, budget.cell);
      const oldFill = fillGeo;
      const oldLines = lineGeo;
      fillGeo = built.fill;
      lineGeo = built.lines;
      terrainFill.geometry = fillGeo;
      terrainLines.geometry = lineGeo;
      shared.u_cell.value = built.cell;
      builtWidth = width;
      halfSpanX = width / 2;
      // The two geometries share one position VBO, so they are always created
      // and disposed as a pair.
      oldLines.dispose();
      oldFill.dispose();
    };

    /* ---- [3] radar dial -------------------------------------------------- */
    const radarUniforms = {
      u_hud: shared.u_hud,
      u_sweepPhase: shared.u_sweepPhase,
      u_maxLuma: { value: 0.06 },
      u_gain: { value: 1 },
    };
    const radarGeo = new THREE.PlaneGeometry(42, 42);
    const radarMat = new THREE.ShaderMaterial({
      uniforms: radarUniforms,
      vertexShader: RADAR_VERT,
      fragmentShader: RADAR_FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const radar = new THREE.Mesh(radarGeo, radarMat);
    radar.rotation.x = -Math.PI / 2;
    // Offset to the left of the content column and inside the flattened basin,
    // so it is painted ON the ground rather than floating over a ridge.
    radar.position.set(-20, GROUND_Y + 0.25, -26);
    radar.renderOrder = 3;
    scene.add(radar);

    /* ---- [4] motes ------------------------------------------------------ */
    const moteCount = budget.motes;
    const moteGeo = new THREE.BufferGeometry();
    const moteUniforms = {
      u_time: shared.u_time,
      u_travel: shared.u_travel,
      u_hud: shared.u_hud,
      u_size: { value: MOTE_PX * renderer.getPixelRatio() },
      u_span: { value: 118 },
      u_camZ: { value: CAM_Z },
      u_dpr: { value: renderer.getPixelRatio() },
    };
    const moteMat = new THREE.ShaderMaterial({
      uniforms: moteUniforms,
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    if (moteCount > 0) {
      const motePos = new Float32Array(moteCount * 3);
      const moteSeed = new Float32Array(moteCount);
      for (let i = 0; i < moteCount; i++) {
        motePos[i * 3] = (Math.random() - 0.5) * halfSpanX * 2;
        motePos[i * 3 + 1] = GROUND_Y + Math.random() * 22;
        motePos[i * 3 + 2] = Math.random() * 118;
        moteSeed[i] = Math.random();
      }
      moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
      moteGeo.setAttribute('a_seed', new THREE.BufferAttribute(moteSeed, 1));
    }
    const motes = new THREE.Points(moteGeo, moteMat);
    motes.frustumCulled = false;
    motes.renderOrder = 4;
    motes.visible = moteCount > 0;
    scene.add(motes);

    /* ---- [2] structures -------------------------------------------------- */
    // One InstancedBufferGeometry over the 12 edges of a unit box: 24 vertices
    // times N instances, one draw call. Verticals are what let the eye read
    // scale off a rolling heightfield.
    const structCount = budget.structures;
    const boxSource = new THREE.BoxGeometry(1, 1, 1);
    const edgesSource = new THREE.EdgesGeometry(boxSource);
    const edgePositions = edgesSource.getAttribute('position').array as Float32Array;
    const structGeo = new THREE.InstancedBufferGeometry();
    structGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(edgePositions), 3),
    );
    boxSource.dispose();
    edgesSource.dispose();

    const structOffsets = new Float32Array(Math.max(1, structCount) * 3);
    const structScales = new Float32Array(Math.max(1, structCount) * 3);
    const structOffsetAttr = new THREE.InstancedBufferAttribute(structOffsets, 3);
    const structScaleAttr = new THREE.InstancedBufferAttribute(structScales, 3);
    structGeo.setAttribute('a_offset', structOffsetAttr);
    structGeo.setAttribute('a_scale', structScaleAttr);
    structGeo.instanceCount = structCount;

    const structUniforms = {
      u_travel: shared.u_travel,
      u_meshZ: shared.u_meshZ,
      u_meshY: shared.u_meshY,
      u_amp: shared.u_amp,
      u_basinCenter: shared.u_basinCenter,
      u_basinRadii: shared.u_basinRadii,
      u_basinCenterScan: shared.u_basinCenter,
      u_scanPhase: shared.u_scanPhase,
      u_hud: shared.u_hud,
      u_hudDim: shared.u_hudDim,
      u_fogDensity: shared.u_fogDensity,
      u_maxLuma: { value: 0.09 },
      u_gain: { value: 1 },
    };
    const structMat = new THREE.ShaderMaterial({
      uniforms: structUniforms,
      vertexShader: STRUCT_VERT,
      fragmentShader: STRUCT_FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const structures = new THREE.LineSegments(structGeo, structMat);
    structures.frustumCulled = false;
    structures.renderOrder = 2;
    structures.visible = structCount > 0;
    scene.add(structures);

    const placeStructure = (i: number, baseZ: number) => {
      // Snap to the sector grid so the built environment sits on the map's own
      // coordinate frame rather than scattering at random.
      const raw = (Math.random() * 2 - 1) * halfSpanX * 0.72;
      const x = Math.round(raw / SECTOR_SIZE) * SECTOR_SIZE + (Math.random() - 0.5) * 3;
      structOffsets[i * 3] = x;
      structOffsets[i * 3 + 1] = field.sample(x / FIELD_SPAN, (MESH_Z - baseZ) / FIELD_SPAN);
      structOffsets[i * 3 + 2] = baseZ;
      structScales[i * 3] = 3 + Math.random() * 6;
      structScales[i * 3 + 1] = 4 + Math.random() * 10;
      structScales[i * 3 + 2] = 3 + Math.random() * 6;
    };
    // Seeded one static-frame's worth of travel further out, so the reduced
    // motion still frame (drawn at STATIC_T) shows the same distribution the
    // animated scene settles into rather than props already behind the camera.
    const SEED_BACK = STATIC_T * SCROLL_SPEED;
    for (let i = 0; i < structCount; i++) {
      placeStructure(
        i,
        STRUCT_RECYCLE_Z - SEED_BACK - ((i + 0.5) / structCount) * STRUCT_SPAN,
      );
    }
    structOffsetAttr.needsUpdate = true;
    structScaleAttr.needsUpdate = true;

    /* ---- [5] leaders + [6] markers -------------------------------------- */
    const markerCount = budget.markers;
    const markerOffsets = new Float32Array(markerCount * 3);
    const markerMeta = new Float32Array(markerCount * 4);
    const markerOffsetAttr = new THREE.InstancedBufferAttribute(markerOffsets, 3);
    const markerMetaAttr = new THREE.InstancedBufferAttribute(markerMeta, 4);

    // Two sub-quads in one 8-vertex geometry: [0..3] glyph, [4..7] label. One
    // draw call covers both, so labels are free.
    const markerGeo = new THREE.InstancedBufferGeometry();
    markerGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([
          -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0,
          0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
        ]),
        3,
      ),
    );
    markerGeo.setAttribute(
      'uv',
      new THREE.BufferAttribute(
        new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]),
        2,
      ),
    );
    markerGeo.setAttribute(
      'a_part',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 1, 1, 1, 1]), 1),
    );
    markerGeo.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]), 1));
    markerGeo.setAttribute('a_offset', markerOffsetAttr);
    markerGeo.setAttribute('a_meta', markerMetaAttr);
    markerGeo.instanceCount = markerCount;

    const fallbackAtlas =
      atlas ?? new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    if (!atlas) fallbackAtlas.needsUpdate = true;

    const markerUniforms = {
      u_time: shared.u_time,
      u_travel: shared.u_travel,
      u_meshZ: shared.u_meshZ,
      u_meshY: shared.u_meshY,
      u_amp: shared.u_amp,
      u_basinCenter: shared.u_basinCenter,
      u_basinRadii: shared.u_basinRadii,
      u_hud: shared.u_hud,
      u_flash: shared.u_flash,
      u_atlas: { value: fallbackAtlas },
      u_labelOn: { value: atlas ? 1 : 0 },
      u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      u_markerPx: { value: MARKER_PX },
      u_labelW: { value: LABEL_W },
      u_labelH: { value: LABEL_H },
      u_fogNear: { value: 45 },
      u_fogFar: { value: 108 },
      u_gain: { value: 1 },
    };
    const markerMat = new THREE.ShaderMaterial({
      uniforms: markerUniforms,
      vertexShader: MARKER_VERT,
      fragmentShader: MARKER_FRAG,
      transparent: true,
      // HUD annotation: it reads over the terrain, like a real overlay.
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const markers = new THREE.Mesh(markerGeo, markerMat);
    markers.frustumCulled = false;
    markers.renderOrder = 6;
    scene.add(markers);

    // Leaders reuse the marker instance attributes verbatim (same VBOs, same
    // divisor), so they cost one extra draw call and 2 vertices per instance.
    const leaderGeo = new THREE.InstancedBufferGeometry();
    leaderGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 1, 0]), 3),
    );
    leaderGeo.setAttribute('a_offset', markerOffsetAttr);
    leaderGeo.setAttribute('a_meta', markerMetaAttr);
    leaderGeo.instanceCount = markerCount;

    const leaderUniforms = {
      u_time: shared.u_time,
      u_travel: shared.u_travel,
      u_meshZ: shared.u_meshZ,
      u_meshY: shared.u_meshY,
      u_amp: shared.u_amp,
      u_basinCenter: shared.u_basinCenter,
      u_basinRadii: shared.u_basinRadii,
      u_hud: shared.u_hud,
      u_fogNear: markerUniforms.u_fogNear,
      u_fogFar: markerUniforms.u_fogFar,
      u_gain: { value: 1 },
    };
    const leaderMat = new THREE.ShaderMaterial({
      uniforms: leaderUniforms,
      vertexShader: LEADER_VERT,
      fragmentShader: LEADER_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const leaders = new THREE.LineSegments(leaderGeo, leaderMat);
    leaders.frustumCulled = false;
    leaders.renderOrder = 5;
    scene.add(leaders);

    const placeMarker = (i: number, baseZ: number, acquireAt: number) => {
      const x = (Math.random() * 2 - 1) * halfSpanX * 0.55;
      markerOffsets[i * 3] = x;
      // The ground-frame coordinate of a prop is (x, MESH_Z - baseZ) and is
      // invariant while it streams, so this height stays correct for its whole
      // life and never has to be resampled.
      markerOffsets[i * 3 + 1] = field.sample(x / FIELD_SPAN, (MESH_Z - baseZ) / FIELD_SPAN);
      markerOffsets[i * 3 + 2] = baseZ;
      markerMeta[i * 4] = Math.floor(Math.random() * 4);
      markerMeta[i * 4 + 1] = Math.floor(Math.random() * LABEL_ROWS);
      markerMeta[i * 4 + 2] = 1.6 + Math.random() * 5;
      markerMeta[i * 4 + 3] = acquireAt;
    };
    for (let i = 0; i < markerCount; i++) {
      // acquireAt cascades so the locks snap in one at a time over ~3.5 s, and
      // every one of them is settled by STATIC_T.
      placeMarker(
        i,
        MARKER_RECYCLE_Z - SEED_BACK - ((i + 0.5) / markerCount) * MARKER_SPAN,
        i * 0.15,
      );
    }
    markerOffsetAttr.needsUpdate = true;
    markerMetaAttr.needsUpdate = true;

    /* ---- pointer parallax + idle drift ---------------------------------- */
    // Continuous values live in local closure vars (never React state): these
    // update every frame.
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let pointerBound = false;

    const onPointerMove = (e: PointerEvent) => {
      targetX = (e.clientX / window.innerWidth - 0.5) * 0.16;
      targetY = (e.clientY / window.innerHeight - 0.5) * 0.09;
    };
    const bindPointer = () => {
      // Gate on fine pointers. On touch, pointermove only fires while a finger
      // is down, i.e. during feed scrolling, so the camera would lurch in
      // sympathy with the user's thumb - the opposite of parallax. Coarse
      // pointers get a stronger idle drift instead.
      if (pointerBound || motionReduced || !finePointerQuery.matches) return;
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      pointerBound = true;
    };
    const unbindPointer = () => {
      if (!pointerBound) return;
      window.removeEventListener('pointermove', onPointerMove);
      pointerBound = false;
      targetX = 0;
      targetY = 0;
    };
    bindPointer();
    const driftScale = finePointerQuery.matches ? 1 : 1.4;

    // Re-acquire events: every 9-14 s the camera takes a short yaw nudge and
    // the HUD flashes. This is what converts "ambient" into "something is
    // operating this camera".
    let eventStart = -99;
    let eventDir = 1;
    let nextEventAt = 7;

    /* ---- resize ---------------------------------------------------------- */
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      capPixelRatio(renderer, w, h, budget.maxPixels, budget.maxRatio);

      const dpr = renderer.getPixelRatio();
      moteUniforms.u_size.value = MOTE_PX * dpr;
      moteUniforms.u_dpr.value = dpr;
      markerUniforms.u_resolution.value.set(w, h);

      // Grow the ground plane if the viewport cone got wider (device rotation
      // is the real case). Never shrink: a rebuild is a buffer re-upload, and
      // churning it on every resize tick would cost more than it saves.
      const needed = requiredTerrainWidth(w / h);
      if (needed > builtWidth * 1.06) applyTerrainWidth(needed);

      // Under reduced motion nothing re-renders on its own, and setSize +
      // setPixelRatio both reallocate and CLEAR the drawing buffer - so
      // without this the canvas goes permanently blank on the first mobile
      // URL-bar collapse.
      if (motionReduced) drawFrame(STATIC_T, false);
    };

    /* ---- draw ------------------------------------------------------------ */
    const drawFrame = (t: number, animated: boolean) => {
      const travel = t * SCROLL_SPEED;
      shared.u_time.value = t;
      shared.u_travel.value = travel;
      shared.u_sectorTravel.value = travel * 0.25;
      shared.u_sweepPhase.value = (t % SWEEP_PERIOD) / SWEEP_PERIOD;
      shared.u_scanPhase.value = (t % SCAN_PERIOD) / SCAN_PERIOD;

      let flash = 0;
      let nudgeYaw = 0;

      if (animated) {
        if (t >= nextEventAt) {
          eventStart = t;
          eventDir = Math.random() < 0.5 ? -1 : 1;
          // Land the next one on the shared 6 s grid so the camera event, the
          // radar revolution and the ground sweep stay one system.
          nextEventAt = Math.ceil((t + 9) / SWEEP_PERIOD) * SWEEP_PERIOD + Math.random() * 4;
        }
        const since = t - eventStart;
        if (since >= 0 && since < 14) {
          const k = Math.min(since / 0.7, 1);
          const out = 1 - Math.pow(1 - k, 4);
          const settle = Math.exp(-Math.max(since - 0.7, 0) * 0.9);
          nudgeYaw = eventDir * 0.05 * out * settle;
          flash = Math.exp(-since * 12);
        }
      }
      shared.u_flash.value = flash;

      const drift = animated ? driftScale : 0;
      currentX += (targetX - currentX) * 0.045;
      currentY += (targetY - currentY) * 0.045;

      // Summed incommensurate sines so the idle never visibly loops, plus a
      // little roll - rotation.order is 'YXZ', so z applies last and reads as
      // true roll rather than a skew.
      const idleYaw = (Math.sin(t * 0.11) * 0.03 + Math.sin(t * 0.047) * 0.018) * drift;
      const idlePitch = Math.sin(t * 0.083) * 0.016 * drift;
      const idleRoll = Math.sin(t * 0.061) * 0.01 * drift;

      camera.position.y = CAM_Y + Math.sin(t * 0.19) * 0.14 * drift;
      camera.rotation.set(
        CAM_PITCH - currentY + idlePitch,
        -currentX + idleYaw + nudgeYaw,
        idleRoll,
      );

      skyUniforms.u_horizonY.value = Math.tan(-camera.rotation.x) / TAN_HALF_FOV;

      if (animated) {
        let dirty = false;
        for (let i = 0; i < markerCount; i++) {
          if (markerOffsets[i * 3 + 2] + travel > MARKER_RECYCLE_Z) {
            placeMarker(i, markerOffsets[i * 3 + 2] - MARKER_SPAN, t + Math.random() * 0.4);
            dirty = true;
          }
        }
        if (dirty) {
          markerOffsetAttr.needsUpdate = true;
          markerMetaAttr.needsUpdate = true;
        }

        let structDirty = false;
        for (let i = 0; i < structCount; i++) {
          if (structOffsets[i * 3 + 2] + travel > STRUCT_RECYCLE_Z) {
            placeStructure(i, structOffsets[i * 3 + 2] - STRUCT_SPAN);
            structDirty = true;
          }
        }
        if (structDirty) {
          structOffsetAttr.needsUpdate = true;
          structScaleAttr.needsUpdate = true;
        }
      }

      renderer.render(scene, camera);
    };

    /* ---- reduced transparency ------------------------------------------- */
    // The user asked for less visual complexity and the CSS already turns the
    // panels opaque; running the full scene behind them at full rate is both
    // an accessibility miss and pure wasted GPU.
    let motesDropped = budget.motes === 0;
    let hazeDropped = false;
    let fillDropped = false;
    let targetFps = budget.fps;
    let throttle = createFrameThrottle(targetFps);

    const applyTransparency = () => {
      const reduced = transparencyQuery.matches;
      motes.visible = !reduced && !motesDropped;
      radar.visible = !reduced;
      structures.visible = !reduced && structCount > 0;
      // The fill pass is the OCCLUDER and it is the most opaque thing in the
      // scene, which is what reduced transparency actually wants: it stays on
      // unless the perf ladder has already dropped it.
      terrainFill.visible = !fillDropped;
      skyUniforms.u_haze.value = reduced || hazeDropped ? 0 : budget.haze;
      fillUniforms.u_gain.value = reduced ? 0.6 : 1;
      lineUniforms.u_gain.value = reduced ? 0.45 : 1;
      skyUniforms.u_gain.value = reduced ? 0.5 : 1;
      markerUniforms.u_gain.value = reduced ? 0.4 : 1;
      leaderUniforms.u_gain.value = reduced ? 0.4 : 1;
      structUniforms.u_gain.value = reduced ? 0.4 : 1;
      radarUniforms.u_gain.value = reduced ? 0.4 : 1;
      targetFps = reduced ? Math.min(30, budget.fps) : budget.fps;
      throttle = createFrameThrottle(targetFps);
      if (motionReduced) drawFrame(STATIC_T, false);
    };
    applyTransparency();

    /* ---- measured demotion ladder ---------------------------------------- */
    // Feature detection alone always mispredicts on Android, so this is the
    // part that actually protects users. Degrade fill-rate first (least
    // semantic loss), the occluding fill pass second to last, frame rate last.
    // Geometry is NEVER demoted mid-session: re-uploading buffers causes a
    // worse hitch than the frames it saves.
    const LADDER: Array<() => void> = [
      () => {
        hazeDropped = true;
        skyUniforms.u_haze.value = 0;
      },
      () => {
        motesDropped = true;
        motes.visible = false;
      },
      () => {
        const n = Math.max(4, Math.floor(markerCount / 2));
        markerGeo.instanceCount = n;
        leaderGeo.instanceCount = n;
        structGeo.instanceCount = Math.max(2, Math.floor(structCount / 2));
      },
      () => {
        fillDropped = true;
        terrainFill.visible = false;
      },
      () => {
        targetFps = 30;
        throttle = createFrameThrottle(30);
      },
    ];
    let ladderStep = 0;
    let windowFrames = 0;
    let windowAccum = 0;
    let badWindows = 0;

    /* ---- loop ------------------------------------------------------------ */
    let raf = 0;
    let running = false;
    let simTime = 0;
    let prevNow = 0;
    let gate: ReturnType<typeof createRenderGate> | null = null;

    const animate = (now: number) => {
      raf = requestAnimationFrame(animate);
      if (!gate || !gate.isActive()) return;
      if (!throttle(now)) return;
      if (renderer.getContext().isContextLost()) return;

      const rawDt = prevNow > 0 ? now - prevNow : 1000 / targetFps;
      prevNow = now;
      // Clamp the simulated step so a backgrounded tab or a long GC pause can
      // never teleport the terrain forward when the loop picks back up.
      simTime += Math.min(rawDt, 50) / 1000;

      windowAccum += rawDt;
      windowFrames++;
      if (windowFrames >= 90) {
        const mean = windowAccum / windowFrames;
        windowFrames = 0;
        windowAccum = 0;
        if (ladderStep < LADDER.length && mean > (1000 / targetFps) * 1.35) {
          badWindows++;
          if (badWindows >= 2) {
            LADDER[ladderStep++]();
            badWindows = 0;
          }
        } else {
          badWindows = 0;
        }
      }

      drawFrame(simTime, true);
    };

    const startLoop = () => {
      if (running || motionReduced) return;
      running = true;
      prevNow = 0;
      windowFrames = 0;
      windowAccum = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(animate);
    };
    const stopLoop = () => {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
    };

    gate = createRenderGate(mount, startLoop);

    if (motionReduced) {
      drawFrame(STATIC_T, false);
    } else {
      startLoop();
    }

    /* ---- media query changes -------------------------------------------- */
    const onMotionChange = () => {
      motionReduced = motionQuery.matches;
      if (motionReduced) {
        stopLoop();
        unbindPointer();
        currentX = 0;
        currentY = 0;
        drawFrame(STATIC_T, false);
      } else {
        bindPointer();
        startLoop();
      }
    };
    const onTransparencyChange = () => applyTransparency();

    motionQuery.addEventListener('change', onMotionChange);
    transparencyQuery.addEventListener('change', onTransparencyChange);
    window.addEventListener('resize', onResize);

    /* ---- teardown -------------------------------------------------------- */
    return () => {
      stopLoop();
      gate?.destroy();
      window.removeEventListener('resize', onResize);
      motionQuery.removeEventListener('change', onMotionChange);
      transparencyQuery.removeEventListener('change', onTransparencyChange);
      unbindPointer();

      for (const geo of [
        skyGeo,
        fillGeo,
        lineGeo,
        radarGeo,
        moteGeo,
        markerGeo,
        leaderGeo,
        structGeo,
      ]) {
        geo?.dispose();
      }
      for (const mat of [
        skyMat,
        fillMat,
        lineMat,
        radarMat,
        moteMat,
        markerMat,
        leaderMat,
        structMat,
      ]) {
        mat.dispose();
      }
      field.dispose();
      fallbackAtlas.dispose();

      releaseContext(renderer);
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full" />;
}

export default WarBackground;
