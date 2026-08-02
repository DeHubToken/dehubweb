import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useAppTheme } from '@/contexts/ThemeContext';
import { capPixelRatio, createRenderGate, releaseContext } from '@/lib/three/scene-helpers';
import { createFrameThrottle } from '@/lib/raf-throttle';
import { getJunglePush, subscribeJunglePush } from '@/lib/jungle-cinematic';

/**
 * Globally rendered "Jungle" background — a low-poly forest floor, seen from
 * down in the grass.
 *
 * THE STYLE IS THE SPEC.
 *
 * This is flat-shaded low poly, not painterly realism. That is a different
 * discipline and almost every choice below follows from it:
 *
 *   FLAT SHADING IS THE WHOLE LOOK. Every material is Lambert with
 *   flatShading, so each triangle takes one solid tone from its own face
 *   normal. The faceting IS the art — it is not a lower-detail version of
 *   something smooth. Consequently there are NO textures anywhere in this
 *   scene, no normal maps, no specular, and no post-processing.
 *
 *   ONE COLOUR PER OBJECT, MANY TONES PER OBJECT. A canopy is a single green;
 *   the twenty shades you see across it are that green lit from one angle
 *   across twenty facets. Painting per-face colour variation on top of that
 *   reads as noise and immediately looks cheap.
 *
 *   CONTRAST DOES THE MODELLING. One strong directional sun, a cool hemisphere
 *   fill, and nothing else. Lit tops go almost lime, undersides go nearly
 *   black-green. A soft, evenly-lit low-poly scene looks like untextured
 *   programmer art; the hard light is what makes it deliberate.
 *
 *   SILHOUETTES CARRY IT. Angular icosahedral canopies on thin near-black
 *   trunks, chunky faceted rocks, blades of grass. Nothing is round.
 *
 * THE MOTION IS LOCAL, AND THAT IS DELIBERATE.
 *
 * An earlier version ran a global breeze over everything. It read as "wavy" —
 * the entire forest breathing at once is both distracting behind text and
 * unlike anything a forest does. The scene is now COMPLETELY STILL at rest.
 * Movement is a spatial falloff around the pointer: the plants you are hovering
 * over stir, the rest of the frame does not move at all. Costs nothing when
 * the pointer is away, and turns the background into something you can poke.
 *
 * WHAT IS DRAWN (8 draw calls)
 *
 *   1  sky       gradient dome, unlit
 *   2  clouds    merged faceted blobs
 *   3  ground    displaced plane
 *   4  trunks    merged tapered prisms
 *   5  canopy    merged icosahedra, one green per blob   <- sways
 *   6  scatter   bushes and rocks, merged                <- bushes sway
 *   7  grass     instanced blades                        <- sways
 *   8  flowers   instanced petals                        <- sways
 *
 * Geometry is merged on the CPU at boot rather than instanced, because the
 * variety between blobs is the point at this scale, and merging costs one draw
 * call either way. Grass and flowers ARE instanced — they repeat identically in
 * the thousands, which is the case instancing is actually for.
 *
 * NO DOWNLOADED ART, and now no generated textures either — there is nothing
 * to fetch and nothing to bake, so this is the cheapest theme in the app to
 * start up.
 */
export function JungleBackground() {
  const { theme } = useAppTheme();
  if (theme !== 'jungle') return null;
  return <JungleScene />;
}

/* ==========================================================================
   Palette
   ==========================================================================
   Sampled off the reference. Two rules hold this together:
     - greens are SATURATED and step in large jumps, not a smooth ramp
     - trunks and deep shadow are nearly black, which is what lets the lit
       tops read as bright without blowing out
   Keep roughly in sync with the token block in styles/jungle-frame.css.
   ========================================================================== */

const SKY_TOP = new THREE.Color('#2e7fc2');
const SKY_LOW = new THREE.Color('#b3d7e6');
const CLOUD = new THREE.Color('#e4f0e6');

/** Canopy greens. One is picked per blob — never blended across a blob. */
const CANOPY = [
  new THREE.Color('#8cc63f'),
  new THREE.Color('#74ab30'),
  new THREE.Color('#5c9128'),
  new THREE.Color('#46731f'),
  new THREE.Color('#33571a'),
];
const TRUNK = new THREE.Color('#2b2119');
const BUSH = new THREE.Color('#6ba62c');
const ROCK = new THREE.Color('#cbbc98');
const ROCK_MOSSY = new THREE.Color('#8aa35c');
const GROUND = new THREE.Color('#4c7327');
const GRASS = new THREE.Color('#9cc247');
const PETAL = new THREE.Color('#f4f4e4');

/* ==========================================================================
   Device tier
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
  trees: number;
  bushes: number;
  rocks: number;
  grass: number;
  flowers: number;
  clouds: number;
  /** Icosahedron subdivision for canopies. 1 is ~80 faces, 0 is 20. */
  canopyDetail: 0 | 1;
  fps: number;
  maxPixels: number;
  maxRatio: number;
}

const BUDGETS: Record<Tier, Budget> = {
  low: {
    trees: 14, bushes: 16, rocks: 14, grass: 2200, flowers: 40, clouds: 3,
    canopyDetail: 0, fps: 30, maxPixels: 1_000_000, maxRatio: 1.25,
  },
  mid: {
    trees: 24, bushes: 30, rocks: 24, grass: 6000, flowers: 90, clouds: 4,
    canopyDetail: 1, fps: 60, maxPixels: 1_600_000, maxRatio: 1.5,
  },
  high: {
    trees: 34, bushes: 44, rocks: 34, grass: 11000, flowers: 150, clouds: 5,
    canopyDetail: 1, fps: 60, maxPixels: 2_000_000, maxRatio: 1.5,
  },
};

/* ==========================================================================
   Deterministic RNG
   ==========================================================================
   The layout is generated, but it must be the SAME layout every time: a forest
   that reshuffles on every navigation is unsettling, and it also makes any
   composition problem impossible to reproduce or fix.
   ========================================================================== */

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ==========================================================================
   Merge helper
   ==========================================================================
   Accumulates transformed geometries into flat arrays and produces ONE
   non-indexed BufferGeometry.

   Three per-vertex extras ride along:
     color    the object's single base colour (see the palette note)
     aAnchor  the object's world origin — the wind's distance test uses this so
              an entire blob reacts as one unit rather than per-vertex, which
              would shear it
     aSway    0 where the object is attached, 1 at its free end

   Written by hand rather than pulled from BufferGeometryUtils: that lives in
   three/examples and would drag an addon into the bundle to do what forty
   lines of typed-array copying does here.
   ========================================================================== */

class Merger {
  pos: number[] = [];
  col: number[] = [];
  anchor: number[] = [];
  sway: number[] = [];

  add(
    geo: THREE.BufferGeometry,
    matrix: THREE.Matrix4,
    color: THREE.Color,
    anchor: THREE.Vector3,
    swayFor: (localY: number) => number,
  ) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      this.pos.push(x, y, z);
      this.col.push(color.r, color.g, color.b);
      this.anchor.push(anchor.x, anchor.y, anchor.z);
      this.sway.push(swayFor(y - anchor.y));
    }
    g.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aAnchor', new THREE.Float32BufferAttribute(this.anchor, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1));
    /* Normals are still computed because Lambert wants the attribute present,
       but under flatShading three derives the shading normal per-fragment from
       screen-space derivatives, so these are effectively a formality. */
    g.computeVertexNormals();
    return g;
  }
}

/* ==========================================================================
   Shapes
   ========================================================================== */

/** A tapered prism. Few sides on purpose — a trunk should read as faceted. */
function trunkGeometry(rBottom: number, rTop: number, height: number, sides: number) {
  return new THREE.CylinderGeometry(rTop, rBottom, height, sides, 1, false);
}

/** An icosahedron with its vertices knocked about, so blobs are not clones. */
function blobGeometry(radius: number, detail: 0 | 1, rng: () => number) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const j = 1 + (rng() - 0.5) * 0.42;
    p.setXYZ(i, p.getX(i) * j, p.getY(i) * j * 0.88, p.getZ(i) * j);
  }
  p.needsUpdate = true;
  return g;
}

/** One blade: a tall thin triangle. Three vertices is the entire cost. */
function bladeGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-0.05, 0, 0, 0.05, 0, 0, 0, 1, 0], 3),
  );
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  g.computeVertexNormals();
  return g;
}

/* ==========================================================================
   Wind injection
   ==========================================================================
   Patched into Lambert with onBeforeCompile rather than written as a raw
   ShaderMaterial, because the lighting model IS the look here and
   reimplementing Lambert to add four lines of vertex maths would be silly.

   The falloff is spatial and centred on the pointer. uStrength only fades the
   whole effect in and out as the pointer enters and leaves the window; it is
   never used to drive an ambient breeze, because there is not one.
   ========================================================================== */

interface WindUniforms {
  uTime: { value: number };
  uHover: { value: THREE.Vector3 };
  uHoverRadius: { value: number };
  uStrength: { value: number };
}

const WIND_DECLS = `
uniform float uTime;
uniform vec3 uHover;
uniform float uHoverRadius;
uniform float uStrength;
`;

/** Shared displacement. `anchor` is world-space; `sway` is 0 at the attachment. */
const WIND_BODY = `
  float dist = distance(anchor.xz, uHover.xz);
  float influence = (1.0 - smoothstep(0.0, uHoverRadius, dist)) * uStrength;
  if (influence > 0.001) {
    float t = uTime * 2.4 + anchor.x * 0.83 + anchor.z * 0.57;
    /* Two frequencies so a disturbed clump does not tick like a metronome. */
    float wob = sin(t) * 0.72 + sin(t * 2.13 + 1.1) * 0.28;
    float amp = sway * influence;
    transformed.x += wob * amp;
    transformed.z += cos(t * 0.91) * amp * 0.55;
    /* A touch of lift, so it reads as being brushed rather than sheared. */
    transformed.y += abs(wob) * amp * 0.12;
  }
`;

/** For merged geometry: anchor and sway arrive as vertex attributes. */
function applyWindMerged(mat: THREE.Material, U: WindUniforms) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uHover = U.uHover;
    shader.uniforms.uHoverRadius = U.uHoverRadius;
    shader.uniforms.uStrength = U.uStrength;
    shader.vertexShader =
      `${WIND_DECLS}\nattribute vec3 aAnchor;\nattribute float aSway;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vec3 anchor = aAnchor;
       float sway = aSway;
       ${WIND_BODY}`,
    );
  };
}

/**
 * For instanced meshes: the anchor is the instance's own translation column.
 *
 * `swayExpr` is a GLSL expression for how much a vertex moves. A blade wants
 * `position.y` (0 at the root, 1 at the tip). A flower does NOT: its geometry
 * is a disc lying in its own XY plane, so position.y there spans about
 * ±0.09 and averages zero — using it would leave the flowers effectively
 * nailed down while everything around them moved.
 */
function applyWindInstanced(mat: THREE.Material, U: WindUniforms, swayExpr = 'position.y') {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uHover = U.uHover;
    shader.uniforms.uHoverRadius = U.uHoverRadius;
    shader.uniforms.uStrength = U.uStrength;
    shader.vertexShader = `${WIND_DECLS}` + shader.vertexShader;
    /* Injected AFTER begin_vertex so `transformed` exists. The anchor is read
       straight out of instanceMatrix's fourth column — no extra attribute
       buffer for something the transform already carries. three declares
       instanceMatrix for us because the mesh is an InstancedMesh. */
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vec3 anchor = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       float sway = ${swayExpr};
       ${WIND_BODY}`,
    );
  };
}

/* ==========================================================================
   Scene
   ========================================================================== */

function JungleScene() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    const root = document.documentElement;
    let tier = detectTier();
    let budget = BUDGETS[tier];

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: false,
        /* Antialiasing EARNS its cost here, unlike in a foliage-card scene:
           this is all long straight polygon edges against flat colour, which is
           the exact case where aliasing is most visible. */
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      root.dataset.jungleGl = 'off';
      return () => {
        delete root.dataset.jungleGl;
      };
    }

    renderer.setSize(window.innerWidth, window.innerHeight);
    capPixelRatio(renderer, window.innerWidth, window.innerHeight, budget.maxPixels, budget.maxRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    /* NO tone mapping. ACES desaturates and rolls off exactly the saturated
       greens this style depends on; the palette is already authored in display
       space and wants to arrive unmodified. */
    renderer.toneMapping = THREE.NoToneMapping;

    const scene = new THREE.Scene();
    /* Light haze only. The reference is a clear, sunny day — heavy fog would
       flatten the depth that the silhouettes are doing. */
    scene.fog = new THREE.Fog(SKY_LOW.clone().lerp(CLOUD, 0.35), 34, 128);

    const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.4, 260);
    /* Down in the grass, looking very slightly up. This is the single most
       important framing decision: at standing height it reads as a diorama on
       a table, and at ground level it reads as being in a forest. */
    const CAM_BASE = new THREE.Vector3(0, 1.15, 12);
    camera.position.copy(CAM_BASE);

    /* -- light ------------------------------------------------------------
       Two lights, no more. The sun is warm, high and to the left, and it is
       strong enough that unlit faces fall away almost to black. The hemisphere
       fill is cool and weak, and its only job is to keep those shadow faces
       readable as green rather than as holes. */
    const sun = new THREE.DirectionalLight(0xfff3d4, 2.5);
    sun.position.set(-26, 34, 16);
    scene.add(sun);
    const hemi = new THREE.HemisphereLight(0x9fd4ef, 0x33501c, 0.85);
    scene.add(hemi);

    const U: WindUniforms = {
      uTime: { value: 0 },
      uHover: { value: new THREE.Vector3(0, 0, -9999) },
      uHoverRadius: { value: 5.5 },
      uStrength: { value: 0 },
    };

    const disposables: Array<{ dispose(): void }> = [];
    const track = <T extends { dispose(): void }>(x: T): T => {
      disposables.push(x);
      return x;
    };

    const rng = makeRng(20260803);

    /* ======================================================================
       1. SKY
       ====================================================================== */
    {
      const geo = track(new THREE.SphereGeometry(180, 16, 12));
      const mat = track(
        new THREE.ShaderMaterial({
          side: THREE.BackSide,
          depthWrite: false,
          fog: false,
          uniforms: {
            uTop: { value: SKY_TOP.clone() },
            uLow: { value: SKY_LOW.clone() },
          },
          vertexShader: `
varying float vY;
void main() {
  vY = normalize(position).y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
          fragmentShader: `
uniform vec3 uTop;
uniform vec3 uLow;
varying float vY;
void main() {
  /* pow() rather than a linear mix: a real sky compresses its gradient toward
     the horizon, and a straight lerp reads as a fade rather than as sky. */
  float t = pow(clamp(vY, 0.0, 1.0), 0.62);
  gl_FragColor = vec4(mix(uLow, uTop, t), 1.0);
}`,
        }),
      );
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = -10;
      scene.add(mesh);
    }

    /* ======================================================================
       2. CLOUDS
       ======================================================================
       Faceted lumps, deliberately few and deliberately high. They exist to put
       something in the upper third of the frame, which is where the chrome is
       most transparent.
       ====================================================================== */
    {
      const m = new Merger();
      for (let i = 0; i < budget.clouds; i++) {
        const cx = (rng() - 0.5) * 150;
        const cy = 46 + rng() * 26;
        const cz = -60 - rng() * 70;
        const anchor = new THREE.Vector3(cx, cy, cz);
        // Two or three overlapping lumps read as a cloud; one reads as a rock.
        const lumps = 2 + Math.floor(rng() * 2);
        for (let j = 0; j < lumps; j++) {
          const g = blobGeometry(6 + rng() * 5, 0, rng);
          const mat4 = new THREE.Matrix4().compose(
            new THREE.Vector3(cx + (rng() - 0.5) * 12, cy + (rng() - 0.5) * 3, cz + (rng() - 0.5) * 8),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(rng(), rng(), rng())),
            new THREE.Vector3(1.5, 0.6, 1),
          );
          m.add(g, mat4, CLOUD, anchor, () => 0);
          g.dispose();
        }
      }
      const geo = track(m.build());
      const mat = track(
        new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false }),
      );
      scene.add(new THREE.Mesh(geo, mat));
    }

    /* ======================================================================
       3. GROUND
       ======================================================================
       Gently displaced so the grass line is not a ruler-straight horizon.
       ====================================================================== */
    {
      const geo = track(new THREE.PlaneGeometry(260, 260, 24, 24));
      const p = geo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        p.setZ(i, Math.sin(x * 0.07) * 0.9 + Math.cos(y * 0.05) * 1.1 + (rng() - 0.5) * 0.35);
      }
      p.needsUpdate = true;
      geo.computeVertexNormals();
      const mat = track(new THREE.MeshLambertMaterial({ color: GROUND, flatShading: true }));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = -0.25;
      scene.add(mesh);
    }

    /* ======================================================================
       4 + 5. TREES
       ======================================================================
       Trunks and canopies merge into two geometries. Canopies sway; trunks do
       not — a trunk that bends when you wave a mouse at it is instantly wrong,
       and the crown moving is what actually reads as disturbance.

       Layout keeps the middle distance open so the sky and the far treeline
       stay visible; a uniform scatter closes the frame into a hedge.
       ====================================================================== */
    const trunkMerger = new Merger();
    const canopyMerger = new Merger();
    for (let i = 0; i < budget.trees; i++) {
      const near = i < budget.trees * 0.35;
      const angle = rng() * Math.PI * 2;
      const radius = near ? 9 + rng() * 12 : 24 + rng() * 55;
      const x = Math.cos(angle) * radius;
      const z = -Math.abs(Math.sin(angle) * radius) - (near ? 2 : 16);
      // Skip anything that would plant itself in the camera's lap.
      if (z > 6 || (Math.abs(x) < 3 && z > -6)) continue;

      const h = (near ? 9 : 12) + rng() * 9;
      const trunkR = 0.22 + rng() * 0.2;
      const base = new THREE.Vector3(x, 0, z);

      const tg = trunkGeometry(trunkR, trunkR * 0.62, h, 5);
      trunkMerger.add(
        tg,
        new THREE.Matrix4().compose(
          new THREE.Vector3(x, h / 2 - 0.3, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * 0.08, rng() * 3, (rng() - 0.5) * 0.08)),
          new THREE.Vector3(1, 1, 1),
        ),
        TRUNK,
        base,
        () => 0,
      );
      tg.dispose();

      /* Two to four blobs per crown, each its own green. Overlapping them is
         what produces the clustered, lumpy silhouette in the reference — a
         single sphere per tree looks like a lollipop. */
      const blobs = 2 + Math.floor(rng() * 3);
      const green = CANOPY[Math.floor(rng() * CANOPY.length)];
      for (let b = 0; b < blobs; b++) {
        const r = (near ? 2.6 : 2.2) + rng() * 1.9;
        const cx = x + (rng() - 0.5) * 3.2;
        const cy = h * (0.82 + rng() * 0.26);
        const cz = z + (rng() - 0.5) * 3.2;
        const anchor = new THREE.Vector3(cx, cy, cz);
        const bg = blobGeometry(r, budget.canopyDetail, rng);
        canopyMerger.add(
          bg,
          new THREE.Matrix4().compose(
            anchor,
            new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3)),
            new THREE.Vector3(1, 0.82 + rng() * 0.3, 1),
          ),
          /* Blobs on the same tree step through neighbouring greens, which
             gives depth inside a crown without introducing a new hue. */
          green.clone().lerp(CANOPY[(b + 1) % CANOPY.length], 0.28),
          anchor,
          () => 1,
        );
        bg.dispose();
      }
    }
    {
      const geo = track(trunkMerger.build());
      const mat = track(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      scene.add(new THREE.Mesh(geo, mat));
    }
    {
      const geo = track(canopyMerger.build());
      const mat = track(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      applyWindMerged(mat, U);
      const mesh = new THREE.Mesh(geo, mat);
      /* The wind moves vertices outside the geometry's baked bounds, so a
         culling test against them can pop the whole canopy out of frame. */
      mesh.frustumCulled = false;
      scene.add(mesh);
    }

    /* ======================================================================
       6. BUSHES + ROCKS
       ======================================================================
       Merged together: same material, same one draw call. Bushes sway, rocks
       obviously do not, which is expressed purely through the sway attribute
       rather than through a second mesh.
       ====================================================================== */
    {
      const m = new Merger();
      for (let i = 0; i < budget.bushes; i++) {
        const x = (rng() - 0.5) * 78;
        const z = 8 - rng() * 76;
        if (Math.abs(x) < 2 && z > 4) continue;
        const r = 0.6 + rng() * 1.5;
        const anchor = new THREE.Vector3(x, r * 0.55, z);
        const g = blobGeometry(r, 0, rng);
        m.add(
          g,
          new THREE.Matrix4().compose(
            anchor,
            new THREE.Quaternion().setFromEuler(new THREE.Euler(rng(), rng() * 3, rng())),
            new THREE.Vector3(1, 0.78, 1),
          ),
          BUSH.clone().lerp(CANOPY[Math.floor(rng() * CANOPY.length)], rng() * 0.6),
          anchor,
          () => 0.85,
        );
        g.dispose();
      }
      for (let i = 0; i < budget.rocks; i++) {
        const x = (rng() - 0.5) * 82;
        const z = 9 - rng() * 78;
        const r = 0.45 + rng() * 1.7;
        const anchor = new THREE.Vector3(x, r * 0.34, z);
        const g = blobGeometry(r, 0, rng);
        m.add(
          g,
          new THREE.Matrix4().compose(
            anchor,
            new THREE.Quaternion().setFromEuler(new THREE.Euler(rng(), rng() * 3, rng())),
            /* Squashed hard. A rock sitting ON the ground rather than in it is
               the difference between scenery and floating debris. */
            new THREE.Vector3(1.25, 0.6, 1.1),
          ),
          rng() < 0.28 ? ROCK_MOSSY : ROCK,
          anchor,
          () => 0,
        );
        g.dispose();
      }
      const geo = track(m.build());
      const mat = track(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      applyWindMerged(mat, U);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      scene.add(mesh);
    }

    /* ======================================================================
       7. GRASS
       ======================================================================
       Instanced blades. Density is weighted toward the camera because that is
       where the reference has its detail, and because blades a long way off
       collapse into sub-pixel noise that costs fill rate and reads as static.
       ====================================================================== */
    {
      /* A plain BufferGeometry, NOT an InstancedBufferGeometry. THREE.InstancedMesh
         owns and uploads instanceMatrix itself, so handing it a geometry that
         also wants to manage instancing means two systems fighting over the same
         draw — the correct pairing is InstancedMesh + ordinary geometry. */
      const geo = track(bladeGeometry());

      const mat = track(
        new THREE.MeshLambertMaterial({
          color: GRASS,
          flatShading: true,
          side: THREE.DoubleSide,
        }),
      );
      applyWindInstanced(mat, U);

      const mesh = new THREE.InstancedMesh(geo, mat, budget.grass);
      const dummy = new THREE.Object3D();
      const tint = new THREE.Color();
      for (let i = 0; i < budget.grass; i++) {
        /* sqrt() biases the distribution toward the camera. */
        const d = Math.sqrt(rng()) * 64;
        const a = rng() * Math.PI * 2;
        dummy.position.set(Math.cos(a) * d * 0.8, -0.2, 6 - Math.abs(Math.sin(a)) * d);
        dummy.rotation.set(0, rng() * Math.PI, (rng() - 0.5) * 0.34);
        const hgt = 0.5 + rng() * 1.15;
        dummy.scale.set(0.85 + rng() * 0.7, hgt, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        /* Per-blade tint spread, the one place per-instance colour variation is
           right: grass genuinely is patchy, and at this density the eye reads
           the spread rather than the individual blades. */
        tint.copy(GRASS).lerp(CANOPY[4], rng() * 0.55);
        mesh.setColorAt(i, tint);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
    }

    /* ======================================================================
       8. FLOWERS
       ======================================================================
       Tiny pale discs. Sparse on purpose — the reference has a handful, and
       they only read as flowers because they are rare.
       ====================================================================== */
    {
      /* Five segments, so a "flower" is a pentagon — at this size that reads as
         petals and stays inside the low-poly vocabulary. Plain geometry for the
         same reason as the grass above. */
      const geo = track(new THREE.CircleGeometry(0.09, 5));

      const mat = track(
        new THREE.MeshLambertMaterial({ color: PETAL, flatShading: true, side: THREE.DoubleSide }),
      );
      /* Constant sway: see the note on applyWindInstanced. A disc's local
         position.y is not a height above the ground. */
      applyWindInstanced(mat, U, '1.0');

      const mesh = new THREE.InstancedMesh(geo, mat, budget.flowers);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < budget.flowers; i++) {
        const d = Math.sqrt(rng()) * 34;
        const a = rng() * Math.PI * 2;
        dummy.position.set(Math.cos(a) * d * 0.8, 0.25 + rng() * 0.5, 5 - Math.abs(Math.sin(a)) * d);
        dummy.rotation.set(-Math.PI / 2 + (rng() - 0.5) * 0.8, 0, rng() * Math.PI);
        dummy.scale.setScalar(0.8 + rng() * 0.9);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
    }

    /* ======================================================================
       Interaction
       ====================================================================== */

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Pointer -> a point on the ground. Raycasting against a MATH PLANE rather
       than against the ground mesh: it is a closed-form intersection instead of
       a BVH-less triangle sweep over a 24x24 grid, and it cannot miss through a
       gap in the geometry. */
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();
    let targetStrength = 0;
    let targetYaw = 0;
    let targetPitch = 0;
    let yaw = 0;
    let pitch = 0;

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      ndc.x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      ndc.y = -((e.clientY / Math.max(1, window.innerHeight)) * 2 - 1);
      ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(groundPlane, hit)) {
        U.uHover.value.copy(hit);
      }
      targetStrength = reduced ? 0 : 1;
      targetYaw = ndc.x * 0.05;
      targetPitch = ndc.y * 0.03;
      if (gate.isActive() && raf === null) start();
    };
    /* Pointer gone means the disturbance stops. Without this the last-hovered
       clump keeps stirring forever in a corner nobody is looking at. */
    const onPointerLeave = () => {
      targetStrength = 0;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('blur', onPointerLeave);

    let push = getJunglePush();
    const unsubscribePush = subscribeJunglePush((v) => {
      push = v;
      if (gate.isActive() && raf === null) start();
    });

    /* ======================================================================
       Loop
       ====================================================================== */
    let raf: number | null = null;
    let throttle = createFrameThrottle(budget.fps);
    const clock = new THREE.Clock();
    let slowFrames = 0;
    let demoted = false;
    let lastFrame = performance.now();
    /* Frames since anything last moved. The scene is static at rest, so once
       everything has settled there is nothing to redraw and the loop can stop
       entirely — which is the real payoff of dropping the ambient breeze. */
    let idleFrames = 0;

    function demote() {
      if (demoted || tier === 'low') return;
      demoted = true;
      tier = tier === 'high' ? 'mid' : 'low';
      budget = BUDGETS[tier];
      throttle = createFrameThrottle(budget.fps);
      capPixelRatio(renderer, window.innerWidth, window.innerHeight, budget.maxPixels, budget.maxRatio);
    }

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      capPixelRatio(renderer, w, h, budget.maxPixels, budget.maxRatio);
      idleFrames = 0;
      if (gate.isActive() && raf === null) start();
    }
    window.addEventListener('resize', resize, { passive: true });

    function frame() {
      if (!gate.isActive()) {
        raf = null;
        return;
      }
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      if (!throttle(now)) return;
      if (renderer.getContext().isContextLost()) return;

      const dt = now - lastFrame;
      lastFrame = now;
      if (dt > 34 && dt < 500) {
        if (++slowFrames > 90) demote();
      } else if (dt < 24) {
        slowFrames = Math.max(0, slowFrames - 1);
      }

      U.uTime.value = clock.getElapsedTime();

      const prevStrength = U.uStrength.value;
      U.uStrength.value += (targetStrength - U.uStrength.value) * 0.08;
      if (U.uStrength.value < 0.002) U.uStrength.value = 0;

      yaw += (targetYaw - yaw) * 0.05;
      pitch += (targetPitch - pitch) * 0.05;
      camera.position.x = CAM_BASE.x + yaw * 5;
      camera.position.y = CAM_BASE.y - pitch * 1.6;
      camera.position.z = CAM_BASE.z - push * 18;
      camera.lookAt(yaw * 3, 2.6 - pitch * 1.4, -26);

      renderer.render(scene, camera);

      /* Park the loop when nothing is moving: no wind, no camera easing, no
         cinematic. It restarts on any pointer move, resize or dolly. */
      const moving =
        U.uStrength.value > 0 ||
        prevStrength > 0 ||
        push > 0 ||
        Math.abs(targetYaw - yaw) > 0.0005 ||
        Math.abs(targetPitch - pitch) > 0.0005;
      idleFrames = moving ? 0 : idleFrames + 1;
      if (idleFrames > 8) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    }

    function start() {
      if (raf === null) {
        lastFrame = performance.now();
        idleFrames = 0;
        raf = requestAnimationFrame(frame);
      }
    }

    const gate = createRenderGate(host, start);
    start();

    const onContextLost = (e: Event) => {
      e.preventDefault();
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      root.dataset.jungleGl = 'off';
    };
    canvas.addEventListener('webglcontextlost', onContextLost, false);

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      gate.destroy();
      unsubscribePush();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('blur', onPointerLeave);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      delete root.dataset.jungleGl;

      for (const d of disposables) {
        try {
          d.dispose();
        } catch {
          // a double dispose is not worth crashing an unmount over
        }
      }
      releaseContext(renderer);
    };
  }, []);

  return (
    <div ref={hostRef} aria-hidden="true" className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

export default JungleBackground;
