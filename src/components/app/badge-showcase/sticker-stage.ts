import * as THREE from "three";

/**
 * Die-cut sticker renderer. Each badge image is turned into a sticker with a
 * white cut border, a holographic glitter finish that shifts with tilt, and a
 * soft cast shadow. The sticker flexes when dragged, peels when grabbed by a
 * edge, and tilts toward the pointer.
 */

export type StickerFinish = "holo" | "glitter" | "foil" | "gloss";

export interface StickerItem {
  src: string;
  finish?: StickerFinish;
  /** Resting tilt in degrees. */
  tilt?: number;
}

export interface StickerStageOptions {
  onTap?: () => void;
  /** A press that missed the sticker and did not drag. */
  onMiss?: () => void;
  onInteract?: () => void;
  /** Fraction of the viewport's short side the sticker occupies. */
  fill?: number;
}

export const DEFAULT_FILL = 0.8;
// The source art is 256px; three times that is as sharp as it gets.
const TEX = 768;
/** Prepared stickers kept on the GPU; older ones are released. */
const CACHE_LIMIT = 5;
// A thin white edge hugging the art, like a real die-cut.
const CUT = Math.round(TEX * 0.025);
/** The cut is traced on a grid this size, then scaled up and hardened. */
const CUT_GRID = 384;
/** Cast shadow strength; it has to read against the darkened page. */
const SHADOW_OPACITY = 0.5;
const PAD = CUT + 4;

/**
 * Where the artwork (not the cut border) sits on the stage, in CSS pixels
 * relative to the canvas, for a square badge. Lets a DOM copy of the badge
 * land exactly where the sticker will draw it.
 */
export function stickerArtRect(width: number, height: number, fill = DEFAULT_FILL) {
  let size = Math.min(width, height) * fill;
  if (size > width * 0.86) size = width * 0.86;
  const art = size * ((TEX - PAD * 2) / TEX);
  return { x: width / 2 - art / 2, y: height / 2 - art / 2, size: art };
}

interface Prepared {
  color: THREE.CanvasTexture;
  mask: THREE.CanvasTexture;
  shadow: THREE.CanvasTexture;
  shadowScale: THREE.Vector2;
  hit: Uint8ClampedArray | null;
  hitSize: number;
  aspect: number;
}

interface Slot {
  index: number;
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  prepared: Prepared;
  width: number;
  height: number;
  tween: Tween | null;
  leaving: boolean;
  /** When the reveal started; null once done (or not started while held). */
  revealStart: number | null;
}

interface Tween {
  from: { y: number; rz: number; s: number; o: number };
  to: { y: number; rz: number; s: number; o: number };
  start: number;
  duration: number;
  ease: (t: number) => number;
  done?: () => void;
}

const easeOutBack = (t: number) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const easeInCubic = (t: number) => t * t * t;

const FINISH: Record<StickerFinish, { holo: number; glitter: number; foil: number }> = {
  holo: { holo: 1, glitter: 0.35, foil: 0 },
  glitter: { holo: 0.35, glitter: 1, foil: 0 },
  foil: { holo: 0.55, glitter: 0.2, foil: 1 },
  gloss: { holo: 0.12, glitter: 0, foil: 0 },
};

const VERT = /* glsl */ `
uniform vec2 uFlex;
uniform vec3 uPress;
uniform vec2 uPeelDir;
uniform float uPeelLine;
uniform float uPeel;
uniform float uCurlR;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vFold;

void main() {
  vUv = uv;
  vec3 p = position;

  // Flex: a gentle paraboloid plus a dent under the finger.
  float sigma = 0.45;
  vec2 d = p.xy - uPress.xy;
  float g = exp(-dot(d, d) / sigma);
  float z = 0.5 * (uFlex.x * p.x * p.x + uFlex.y * p.y * p.y) - uPress.z * g;
  float dzdx = uFlex.x * p.x + uPress.z * g * 2.0 * d.x / sigma;
  float dzdy = uFlex.y * p.y + uPress.z * g * 2.0 * d.y / sigma;
  vec3 n = normalize(vec3(-dzdx, -dzdy, 1.0));
  vFold = 0.0;

  // Peel: roll everything past the fold line around a small cylinder.
  float s = dot(p.xy, uPeelDir) - uPeelLine;
  if (uPeel > 0.001 && s > 0.0) {
    vec2 onLine = p.xy - uPeelDir * s;
    float R = uCurlR;
    float th = s / R;
    if (th < 3.14159265) {
      p.xy = onLine + uPeelDir * R * sin(th);
      z += R * (1.0 - cos(th));
      n = normalize(vec3(-uPeelDir * sin(th), cos(th)));
    } else {
      p.xy = onLine - uPeelDir * (s - 3.14159265 * R);
      z += 2.0 * R;
      n = vec3(0.0, 0.0, -1.0);
    }
    vFold = clamp(th / 3.14159265, 0.0, 1.0);
  } else if (uPeel > 0.001) {
    // Shade the sheet just under the lifted flap.
    vFold = -clamp(1.0 + s / (uCurlR * 2.5), 0.0, 1.0) * uPeel;
  }

  p.z = z;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uMask;
uniform vec3 uLight;
uniform float uHolo;
uniform float uGlitter;
uniform float uFoil;
uniform float uOpacity;
uniform float uTime;
uniform float uReveal;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vFold;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 ramp(float t) { return 0.5 + 0.5 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67))); }

void main() {
  vec4 tex = texture2D(uMap, vUv);
  if (tex.a < 0.03) discard;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(uLight);

  if (!gl_FrontFacing) {
    // Paper backing.
    vec3 Nb = -N;
    float dif = 0.78 + 0.22 * max(dot(Nb, L), 0.0);
    float a = tex.a * uOpacity;
    gl_FragColor = vec4(vec3(0.965, 0.96, 0.95) * dif * a, a);
    return;
  }

  float art = texture2D(uMask, vUv).r;
  // Opening: the paper edge comes in first, then the foil catches the light
  // with a brief extra glint, so it never jumps from plain to glittering.
  float paper = smoothstep(0.0, 0.5, uReveal);
  float shine = smoothstep(0.2, 1.0, uReveal);
  float glint = shine * (1.0 + 2.2 * sin(3.14159265 * shine));
  vec3 H = normalize(L + V);
  float ndl = max(dot(N, L), 0.0);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float spec = pow(max(dot(N, H), 0.0), 70.0);

  // Iridescence driven by surface orientation, so tilting sweeps the rainbow.
  float t = vUv.x * 0.8 + vUv.y * 0.55 + N.x * 2.2 - N.y * 1.7 + (1.0 - ndv) * 1.6;
  // Toned to 65% colour so the foil reads as metal first, rainbow second.
  vec3 hue = ramp(t);
  vec3 rainbow = mix(vec3(dot(hue, vec3(0.3333))), hue, 0.65);

  // Glitter: each cell is a tiny mirror with its own random normal.
  vec2 cell = floor(vUv * 260.0);
  vec3 gN = normalize(N + vec3(hash(cell) - 0.5, hash(cell + 7.31) - 0.5, 0.0) * 1.3);
  float flake = step(0.45, hash(cell + 3.17));
  float sparkle = pow(max(dot(gN, H), 0.0), 90.0) * flake;
  float twinkle = 0.75 + 0.25 * sin(uTime * 3.0 + hash(cell) * 40.0);

  vec3 border = mix(vec3(0.95), vec3(0.95) * (0.72 + 0.5 * rainbow), 0.55);
  border += sparkle * glint * twinkle * (0.9 + rainbow) * 1.1;

  vec3 col = tex.rgb;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 artCol = col;
  artCol += shine * uHolo * rainbow * 0.3 * (0.3 + lum) * (0.55 + 0.45 * (1.0 - ndv) + 0.4 * spec);
  artCol += uGlitter * sparkle * glint * twinkle * (0.6 + 0.6 * rainbow);
  artCol = mix(artCol, artCol * (0.55 + 0.9 * rainbow), shine * uFoil * 0.45 * (1.0 - lum * 0.5));

  vec3 c = mix(border, artCol, art);
  c *= 0.8 + 0.3 * ndl;
  c += spec * 0.32;
  c += pow(1.0 - ndv, 3.0) * 0.12;
  if (vFold > 0.0) c *= 1.0 - 0.18 * sin(vFold * 3.14159265);
  if (vFold < 0.0) c *= 1.0 + 0.22 * vFold;

  float a = tex.a * mix(paper, 1.0, art) * uOpacity;
  gl_FragColor = vec4(clamp(c, 0.0, 1.4) * a, a);
}
`;

/* A handful of sparks thrown off the rim as the sticker wakes up. */
const BURST_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uT;
uniform float uR;
uniform float uPx;
varying float vAlpha;
varying float vHue;
void main() {
  float t = max(0.0, uT - aSeed.w);
  float k = clamp(t / 0.95, 0.0, 1.0);
  float ease = 1.0 - pow(1.0 - k, 3.0);
  vec2 dir = vec2(cos(aSeed.x), sin(aSeed.x));
  vec2 p = dir * uR * (0.82 + aSeed.y * 0.32 * ease);
  p.y -= 0.12 * uR * k * k;
  vAlpha = step(0.0001, t) * (1.0 - k) * smoothstep(0.0, 0.08, k);
  vHue = aSeed.x;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 0.5, 1.0);
  gl_PointSize = aSeed.z * uPx * (1.0 - 0.45 * k);
}
`;

const BURST_FRAG = /* glsl */ `
varying float vAlpha;
varying float vHue;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float core = exp(-dot(q, q) * 5.0);
  float cross = max(0.0, 1.0 - abs(q.x) * 5.0) * max(0.0, 1.0 - abs(q.y))
    + max(0.0, 1.0 - abs(q.y) * 5.0) * max(0.0, 1.0 - abs(q.x));
  float shape = clamp(core + cross * 0.8, 0.0, 1.0);
  vec3 tint = 0.5 + 0.5 * cos(6.2831853 * (vHue * 0.16 + vec3(0.0, 0.33, 0.67)));
  vec3 col = mix(vec3(1.0), tint, 0.25);
  float a = shape * vAlpha;
  gl_FragColor = vec4(col * a, a);
}
`;

const BURST_COUNT = 48;
const REVEAL_MS = 1100;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function silhouette(img: HTMLImageElement, w: number, h: number, pad: number) {
  const c = canvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, pad, pad, w - pad * 2, h - pad * 2);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  return c;
}

/**
 * The sticker's paper: the art's outline grown by the cut, with every gap the
 * art encloses filled in (a cutter only follows the outside edge), hardened
 * to a crisp edge.
 */
function dieCut(sil: HTMLCanvasElement, w: number, h: number, cut: number): HTMLCanvasElement {
  const gw = Math.round((CUT_GRID * w) / Math.max(w, h));
  const gh = Math.round((CUT_GRID * h) / Math.max(w, h));
  const r = cut * (gw / w);
  const grown = canvas(gw, gh);
  const gctx = grown.getContext("2d", { willReadFrequently: true })!;
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    gctx.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r, gw, gh);
  }
  gctx.drawImage(sil, 0, 0, gw, gh);

  const out = canvas(w, h);
  const octx = out.getContext("2d", { willReadFrequently: true })!;
  octx.imageSmoothingQuality = "high";
  try {
    const data = gctx.getImageData(0, 0, gw, gh);
    const px = data.data;
    // Flood the empty space in from the edges; whatever it cannot reach is
    // enclosed by the art and becomes paper.
    const outside = new Uint8Array(gw * gh);
    const stack: number[] = [];
    const visit = (x: number, y: number) => {
      const i = y * gw + x;
      if (outside[i] || px[i * 4 + 3] >= 128) return;
      outside[i] = 1;
      stack.push(i);
    };
    for (let x = 0; x < gw; x++) {
      visit(x, 0);
      visit(x, gh - 1);
    }
    for (let y = 0; y < gh; y++) {
      visit(0, y);
      visit(gw - 1, y);
    }
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % gw;
      const y = (i / gw) | 0;
      if (x > 0) visit(x - 1, y);
      if (x < gw - 1) visit(x + 1, y);
      if (y > 0) visit(x, y - 1);
      if (y < gh - 1) visit(x, y + 1);
    }
    for (let i = 0; i < outside.length; i++) {
      if (!outside[i]) px[i * 4 + 3] = 255;
    }
    gctx.putImageData(data, 0, 0);

    octx.drawImage(grown, 0, 0, w, h);
    const full = octx.getImageData(0, 0, w, h);
    const fp = full.data;
    for (let i = 3; i < fp.length; i += 4) {
      const t = Math.min(1, Math.max(0, (fp[i] - 100) / 56));
      fp[i] = Math.round(t * t * (3 - 2 * t) * 255);
      fp[i - 1] = fp[i - 2] = fp[i - 3] = 255;
    }
    octx.putImageData(full, 0, 0);
  } catch {
    // A tainted canvas cannot be read back; keep the soft grown outline.
    octx.drawImage(grown, 0, 0, w, h);
  }
  return out;
}

async function prepare(src: string): Promise<Prepared> {
  const img = await loadImage(src);
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  const aspect = iw / ih;
  const w = aspect >= 1 ? TEX : Math.round(TEX * aspect);
  const h = aspect >= 1 ? Math.round(TEX / aspect) : TEX;
  const cut = CUT;
  const pad = PAD;
  const aw = w - pad * 2;
  const ah = h - pad * 2;

  const artSil = silhouette(img, w, h, pad);
  const cutLayer = dieCut(artSil, w, h, cut);

  const out = canvas(w, h);
  const octx = out.getContext("2d")!;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(cutLayer, 0, 0);
  octx.drawImage(img, pad, pad, aw, ah);

  // Art mask: 1 where the art is, 0 on the cut border. Half size is plenty.
  const mask = canvas(w / 2, h / 2);
  const mctx = mask.getContext("2d")!;
  mctx.fillStyle = "#000";
  mctx.fillRect(0, 0, w / 2, h / 2);
  mctx.drawImage(artSil, 0, 0, w / 2, h / 2);

  // Soft cast shadow.
  const sw = 256;
  const sh = Math.round(sw / aspect);
  const spad = 48;
  const shadowCanvas = canvas(sw + spad * 2, sh + spad * 2);
  const shctx = shadowCanvas.getContext("2d")!;
  shctx.shadowColor = "rgba(0,0,0,1)";
  shctx.shadowBlur = 22;
  shctx.shadowOffsetX = 10000;
  shctx.drawImage(out, spad - 10000, spad, sw, sh);

  // Low-res alpha for hit testing.
  const hitSize = 96;
  let hit: Uint8ClampedArray | null = null;
  try {
    const hc = canvas(hitSize, hitSize);
    const hctx = hc.getContext("2d", { willReadFrequently: true })!;
    hctx.drawImage(out, 0, 0, hitSize, hitSize);
    hit = hctx.getImageData(0, 0, hitSize, hitSize).data;
  } catch {
    hit = null;
  }

  const color = new THREE.CanvasTexture(out);
  color.anisotropy = 4;
  color.generateMipmaps = true;
  color.minFilter = THREE.LinearMipmapLinearFilter;
  const maskTex = new THREE.CanvasTexture(mask);
  const shadow = new THREE.CanvasTexture(shadowCanvas);

  const shadowScale = new THREE.Vector2((sw + spad * 2) / sw, (sh + spad * 2) / sh);
  return { color, mask: maskTex, shadow, shadowScale, hit, hitSize, aspect };
}

export class StickerStage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  private raycaster = new THREE.Raycaster();
  private items: StickerItem[] = [];
  private cache = new Map<string, Promise<Prepared>>();
  private current: Slot | null = null;
  private slots: Slot[] = [];
  private raf = 0;
  private disposed = false;
  private clock = new THREE.Clock();
  private viewH = 1;
  private viewW = 1;
  private opts: StickerStageOptions;
  private reduced = false;
  private request = 0;

  // Springs
  private tilt = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
  private flex = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
  private press = { x: 0, y: 0, z: 0, vz: 0, tz: 0 };
  private peel = { amt: 0, v: 0, t: 0, dir: new THREE.Vector2(1, 1).normalize(), line: 0, tline: 0 };

  private pointer = { x: 0, y: 0, inside: false };
  private drag: null | {
    mode: "flex" | "peel";
    sx: number;
    sy: number;
    t0: number;
    moved: number;
    /** Where the sticker was grabbed, in its own plane. */
    local: THREE.Vector2;
  } = null;
  private miss: null | { x: number; y: number } = null;

  private resizeObserver: ResizeObserver;

  constructor(private canvasEl: HTMLCanvasElement, opts: StickerStageOptions = {}) {
    this.opts = opts;
    this.reduced =
      typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true, premultipliedAlpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.camera.position.set(0, 0, 9);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvasEl);
    this.resize();

    canvasEl.addEventListener("pointermove", this.onMove);
    canvasEl.addEventListener("pointerdown", this.onDown);
    canvasEl.addEventListener("pointerleave", this.onLeave);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);

    this.loop();
  }

  setItems(items: StickerItem[]) {
    this.items = items;
  }

  /** Warm a sticker so showing it later does not wait on the image. */
  preload(index: number) {
    const item = this.items[index];
    if (item) this.load(item).catch(() => {});
  }

  /**
   * Show sticker `index`. `direction` 1 = next (the old one flies up), -1 =
   * previous. `instant` places it with no entrance, for taking over from a
   * DOM copy already sitting in the same spot. Resolves true once it is on
   * screen, false if a later call or dispose got there first.
   */
  async show(
    index: number,
    { direction = 1, instant = false, hold = false }: { direction?: 1 | -1; instant?: boolean; hold?: boolean } = {},
  ) {
    const item = this.items[index];
    if (!item) return false;
    if (this.current && this.current.index === index && !this.current.leaving) return true;
    const req = ++this.request;
    let prepared: Prepared;
    try {
      prepared = await this.load(item);
    } catch {
      return false;
    }
    if (this.disposed || req !== this.request) return false;

    const outgoing = this.current;
    const slot = this.makeSlot(index, prepared, item);
    this.current = slot;
    this.resetInteraction();
    // Held: drawn as the bare art until reveal(), matching a DOM copy of it.
    if (hold) slot.mesh.material.uniforms.uReveal.value = 0;

    const baseTilt = THREE.MathUtils.degToRad(item.tilt ?? 0);
    const now = performance.now();
    if (outgoing) {
      outgoing.leaving = true;
      const g = outgoing.group;
      outgoing.tween = {
        from: { y: g.position.y, rz: g.rotation.z, s: g.scale.x, o: 1 },
        to: {
          y: g.position.y + direction * this.viewH * 0.9,
          rz: g.rotation.z + direction * 0.5,
          s: 0.9,
          o: 0,
        },
        start: now,
        duration: this.reduced ? 1 : 560,
        ease: easeInCubic,
        done: () => this.removeSlot(outgoing),
      };
    }
    slot.tween = {
      from: instant
        ? { y: 0, rz: baseTilt, s: 1, o: 1 }
        : { y: -direction * this.viewH * 0.85, rz: baseTilt - direction * 0.35, s: 0.92, o: 1 },
      to: { y: 0, rz: baseTilt, s: 1, o: 1 },
      start: now + (outgoing ? 110 : 0),
      duration: this.reduced || instant ? 1 : 900,
      ease: easeOutBack,
    };
    this.applyTween(slot, now);
    return true;
  }

  /** Bring a held sticker to life: paper, then foil, with a burst of sparks. */
  reveal() {
    const s = this.current;
    if (!s) return;
    if (this.reduced) {
      s.mesh.material.uniforms.uReveal.value = 1;
      return;
    }
    s.revealStart = performance.now();
    this.spawnBurst(s);
  }

  private burst: {
    points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
    start: number;
  } | null = null;

  private spawnBurst(slot: Slot) {
    this.clearBurst();
    const seeds = new Float32Array(BURST_COUNT * 4);
    for (let i = 0; i < BURST_COUNT; i++) {
      seeds[i * 4] = (i / BURST_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      seeds[i * 4 + 1] = 0.35 + Math.random() * 0.75;
      seeds[i * 4 + 2] = 7 + Math.random() * 9;
      seeds[i * 4 + 3] = Math.random() * 0.18;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(BURST_COUNT * 3), 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
    const material = new THREE.ShaderMaterial({
      vertexShader: BURST_VERT,
      fragmentShader: BURST_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      premultipliedAlpha: true,
      uniforms: {
        uT: { value: 0 },
        uR: { value: slot.height * 0.5 },
        uPx: { value: this.renderer.getPixelRatio() },
      },
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 5;
    this.scene.add(points);
    this.burst = { points, start: performance.now() };
  }

  private clearBurst() {
    if (!this.burst) return;
    this.scene.remove(this.burst.points);
    this.burst.points.geometry.dispose();
    this.burst.points.material.dispose();
    this.burst = null;
  }

  dispose() {
    this.disposed = true;
    this.clearBurst();
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.canvasEl.removeEventListener("pointermove", this.onMove);
    this.canvasEl.removeEventListener("pointerdown", this.onDown);
    this.canvasEl.removeEventListener("pointerleave", this.onLeave);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onUp);
    [...this.slots].forEach((s) => this.removeSlot(s));
    this.cache.forEach((p) =>
      p.then((x) => {
        x.color.dispose();
        x.mask.dispose();
        x.shadow.dispose();
      }).catch(() => {}),
    );
    this.renderer.dispose();
  }

  private load(item: StickerItem) {
    let p = this.cache.get(item.src);
    if (p) {
      // Most recently used goes to the back of the eviction queue.
      this.cache.delete(item.src);
      this.cache.set(item.src, p);
      return p;
    }
    p = prepare(item.src);
    this.cache.set(item.src, p);
    p.catch(() => this.cache.delete(item.src));
    this.evict();
    return p;
  }

  private evict() {
    if (this.cache.size <= CACHE_LIMIT) return;
    const live = new Set(this.slots.map((s) => this.items[s.index]?.src));
    for (const [src, p] of this.cache) {
      if (this.cache.size <= CACHE_LIMIT) break;
      if (live.has(src)) continue;
      this.cache.delete(src);
      p.then((x) => {
        x.color.dispose();
        x.mask.dispose();
        x.shadow.dispose();
      }).catch(() => {});
    }
  }

  private stickerHeight(aspect: number) {
    const fill = this.opts.fill ?? DEFAULT_FILL;
    const short = Math.min(this.viewH, this.viewW);
    let h = short * fill;
    if (h * aspect > this.viewW * 0.86) h = (this.viewW * 0.86) / aspect;
    return h;
  }

  private makeSlot(index: number, prepared: Prepared, item: StickerItem): Slot {
    const h = this.stickerHeight(prepared.aspect);
    const w = h * prepared.aspect;
    const f = FINISH[item.finish ?? "holo"];
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      premultipliedAlpha: true,
      side: THREE.DoubleSide,
      // The peeled flap folds over the sheet; depth keeps it on top.
      depthWrite: true,
      uniforms: {
        uMap: { value: prepared.color },
        uMask: { value: prepared.mask },
        uLight: { value: new THREE.Vector3(-0.4, 0.6, 1) },
        uHolo: { value: f.holo },
        uGlitter: { value: f.glitter },
        uFoil: { value: f.foil },
        uOpacity: { value: 1 },
        uTime: { value: 0 },
        uReveal: { value: 1 },
        uFlex: { value: new THREE.Vector2() },
        uPress: { value: new THREE.Vector3() },
        uPeelDir: { value: new THREE.Vector2(1, 1).normalize() },
        uPeelLine: { value: 10 },
        uPeel: { value: 0 },
        uCurlR: { value: h * 0.06 },
      },
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 72, 72), material);
    mesh.renderOrder = 2;

    const shadowMat = new THREE.MeshBasicMaterial({
      map: prepared.shadow,
      transparent: true,
      depthWrite: false,
      opacity: SHADOW_OPACITY,
    });
    const ss = prepared.shadowScale;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(w * ss.x, h * ss.y), shadowMat);
    shadow.renderOrder = 1;
    shadow.position.set(0, -h * 0.07, -0.2);

    const group = new THREE.Group();
    group.add(shadow);
    group.add(mesh);
    this.scene.add(group);

    const slot: Slot = { index, group, mesh, shadow, prepared, width: w, height: h, tween: null, leaving: false, revealStart: null };
    this.slots.push(slot);
    return slot;
  }

  private removeSlot(slot: Slot) {
    this.scene.remove(slot.group);
    slot.mesh.geometry.dispose();
    slot.mesh.material.dispose();
    slot.shadow.geometry.dispose();
    slot.shadow.material.dispose();
    this.slots = this.slots.filter((s) => s !== slot);
  }

  private applyTween(slot: Slot, now: number) {
    const tw = slot.tween;
    if (!tw) return;
    const raw = (now - tw.start) / tw.duration;
    const t = Math.min(Math.max(raw, 0), 1);
    const k = tw.ease(t);
    const lerp = (a: number, b: number) => a + (b - a) * k;
    slot.group.position.y = lerp(tw.from.y, tw.to.y);
    slot.group.rotation.z = lerp(tw.from.rz, tw.to.rz);
    slot.group.scale.setScalar(lerp(tw.from.s, tw.to.s));
    slot.mesh.material.uniforms.uOpacity.value = lerp(tw.from.o, tw.to.o);
    slot.shadow.material.opacity = SHADOW_OPACITY * lerp(tw.from.o, tw.to.o);
    if (raw >= 1) {
      slot.tween = null;
      tw.done?.();
    }
  }

  private resize() {
    const rect = this.canvasEl.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewH = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.position.z;
    this.viewW = this.viewH * this.camera.aspect;
    // Rebuild geometry at the new size so the sticker keeps its screen share.
    for (const s of this.slots) {
      const nh = this.stickerHeight(s.prepared.aspect);
      const scale = nh / s.height;
      if (Math.abs(scale - 1) > 0.01) {
        s.mesh.geometry.dispose();
        s.mesh.geometry = new THREE.PlaneGeometry(nh * s.prepared.aspect, nh, 72, 72);
        const ss = s.prepared.shadowScale;
        s.shadow.geometry.dispose();
        s.shadow.geometry = new THREE.PlaneGeometry(nh * s.prepared.aspect * ss.x, nh * ss.y);
        s.shadow.position.y = -nh * 0.07;
        s.mesh.material.uniforms.uCurlR.value = nh * 0.06;
        s.height = nh;
        s.width = nh * s.prepared.aspect;
      }
    }
  }

  private ndc(e: PointerEvent) {
    const r = this.canvasEl.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  /** Returns the hit point in the sticker's local plane, or null. */
  private hitTest(ndc: THREE.Vector2) {
    const s = this.current;
    if (!s || s.leaving) return null;
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(s.mesh, false);
    const hit = hits[0];
    if (!hit || !hit.uv) return null;
    const { hit: alpha, hitSize } = s.prepared;
    if (alpha) {
      const px = Math.min(hitSize - 1, Math.floor(hit.uv.x * hitSize));
      const py = Math.min(hitSize - 1, Math.floor((1 - hit.uv.y) * hitSize));
      if (alpha[(py * hitSize + px) * 4 + 3] < 40) return null;
    }
    const local = s.mesh.worldToLocal(hit.point.clone());
    return { uv: hit.uv.clone(), local: new THREE.Vector2(local.x, local.y) };
  }

  private onMove = (e: PointerEvent) => {
    const n = this.ndc(e);
    this.pointer.x = n.x;
    this.pointer.y = n.y;
    this.pointer.inside = true;

    const d = this.drag;
    const s = this.current;
    if (d && s) {
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      d.moved = Math.max(d.moved, Math.hypot(dx, dy));
      const r = this.canvasEl.getBoundingClientRect();
      const worldPerPx = this.viewH / r.height;
      if (d.mode === "flex") {
        // Bend the sheet along the drag, dented under the finger.
        this.flex.tx = THREE.MathUtils.clamp((dx * worldPerPx) / s.width, -0.8, 0.8) * 0.9;
        this.flex.ty = THREE.MathUtils.clamp((-dy * worldPerPx) / s.height, -0.8, 0.8) * 0.9;
        this.tilt.tx = THREE.MathUtils.clamp(-dy / r.height, -0.5, 0.5) * 0.9;
        this.tilt.ty = THREE.MathUtils.clamp(dx / r.width, -0.5, 0.5) * 1.1;
      } else {
        // The fold sits halfway between where the edge was grabbed and where
        // the finger is now, so the grabbed point follows the finger over.
        const dir = this.peel.dir;
        const grabbed = d.local.dot(dir);
        const pulled = (dx * dir.x - dy * dir.y) * worldPerPx;
        const reach = Math.hypot(s.width, s.height) * 0.5;
        this.peel.tline = THREE.MathUtils.clamp(grabbed + pulled / 2, -reach * 0.55, grabbed + 0.02);
      }
    } else if (!this.drag) {
      this.canvasEl.style.cursor = this.hitTest(n) ? "grab" : "";
    }
  };

  private onLeave = () => {
    this.pointer.inside = false;
  };

  private onDown = (e: PointerEvent) => {
    const hit = this.hitTest(this.ndc(e));
    if (!hit || !this.current) {
      this.miss = { x: e.clientX, y: e.clientY };
      return;
    }
    this.miss = null;
    this.opts.onInteract?.();
    this.canvasEl.setPointerCapture?.(e.pointerId);
    const s = this.current;
    // Grabbing near the rim peels from that edge; anywhere else bends.
    const rim = Math.hypot(hit.uv.x - 0.5, hit.uv.y - 0.5) > 0.3;
    const mode = rim ? "peel" : "flex";
    this.drag = { mode, sx: e.clientX, sy: e.clientY, t0: performance.now(), moved: 0, local: hit.local };
    if (mode === "peel") {
      const dir = hit.local.clone().normalize();
      this.peel.dir.copy(dir);
      const grabbed = hit.local.dot(dir);
      this.peel.line = grabbed + 0.05;
      this.peel.tline = grabbed;
      this.peel.t = 1;
    } else {
      this.press.x = hit.local.x;
      this.press.y = hit.local.y;
      this.press.tz = s.height * 0.05;
    }
    this.canvasEl.style.cursor = "grabbing";
  };

  private onUp = (e: PointerEvent) => {
    const m = this.miss;
    this.miss = null;
    if (m && Math.hypot(e.clientX - m.x, e.clientY - m.y) < 8) this.opts.onMiss?.();
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.canvasEl.style.cursor = "grab";
    this.flex.tx = 0;
    this.flex.ty = 0;
    this.press.tz = 0;
    this.peel.t = 0;
    const s = this.current;
    if (s) this.peel.tline = Math.hypot(s.width, s.height);
    if (d.moved < 6 && performance.now() - d.t0 < 350) this.opts.onTap?.();
  };

  private resetInteraction() {
    this.drag = null;
    this.flex.x = this.flex.y = this.flex.tx = this.flex.ty = 0;
    this.flex.vx = this.flex.vy = 0;
    this.press.z = this.press.tz = this.press.vz = 0;
    this.peel.amt = this.peel.t = this.peel.v = 0;
    this.peel.line = this.peel.tline = 100;
  }

  private spring(x: number, v: number, target: number, dt: number, k = 120, c = 14) {
    const a = (target - x) * k - v * c;
    v += a * dt;
    x += v * dt;
    return [x, v] as const;
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 1 / 30);
    const time = this.clock.elapsedTime;
    const now = performance.now();

    // Hover tilt toward the pointer, idle sway otherwise.
    if (!this.drag) {
      if (this.pointer.inside && !this.reduced) {
        this.tilt.tx = -this.pointer.y * 0.32;
        this.tilt.ty = this.pointer.x * 0.42;
      } else if (!this.reduced) {
        this.tilt.tx = Math.sin(time * 0.7) * 0.12;
        this.tilt.ty = Math.cos(time * 0.55) * 0.18;
      } else {
        this.tilt.tx = this.tilt.ty = 0;
      }
    }
    [this.tilt.x, this.tilt.vx] = this.spring(this.tilt.x, this.tilt.vx, this.tilt.tx, dt, 60, 11);
    [this.tilt.y, this.tilt.vy] = this.spring(this.tilt.y, this.tilt.vy, this.tilt.ty, dt, 60, 11);
    [this.flex.x, this.flex.vx] = this.spring(this.flex.x, this.flex.vx, this.flex.tx, dt, 160, 9);
    [this.flex.y, this.flex.vy] = this.spring(this.flex.y, this.flex.vy, this.flex.ty, dt, 160, 9);
    [this.press.z, this.press.vz] = this.spring(this.press.z, this.press.vz, this.press.tz, dt, 200, 16);
    [this.peel.amt, this.peel.v] = this.spring(this.peel.amt, this.peel.v, this.peel.t, dt, 90, 14);
    this.peel.line += (this.peel.tline - this.peel.line) * Math.min(1, dt * 14);

    if (this.burst) {
      const t = (now - this.burst.start) / 1000;
      if (t > 1.4) this.clearBurst();
      else this.burst.points.material.uniforms.uT.value = t;
    }

    for (const s of this.slots) {
      this.applyTween(s, now);
      if (s.revealStart !== null) {
        const k = Math.min(1, (now - s.revealStart) / REVEAL_MS);
        s.mesh.material.uniforms.uReveal.value = 1 - Math.pow(1 - k, 2);
        if (k >= 1) s.revealStart = null;
      }
      // The shadow lands with the paper, not before it.
      const paper = Math.min(1, s.mesh.material.uniforms.uReveal.value * 2);
      if (!s.tween) s.shadow.material.opacity = SHADOW_OPACITY * paper;
      const u = s.mesh.material.uniforms;
      u.uTime.value = time;
      if (s === this.current) {
        s.mesh.rotation.x = this.tilt.x;
        s.mesh.rotation.y = this.tilt.y;
        s.shadow.position.x = -this.tilt.y * s.height * 0.12;
        s.shadow.position.y = -s.height * 0.07 + this.tilt.x * s.height * 0.1;
        u.uFlex.value.set(this.flex.x, this.flex.y);
        u.uPress.value.set(this.press.x, this.press.y, this.press.z);
        u.uPeel.value = Math.max(0, this.peel.amt);
        u.uPeelDir.value.copy(this.peel.dir);
        u.uPeelLine.value = this.peel.line;
        // Light drifts opposite the pointer so the sheen slides across.
        u.uLight.value.set(-0.35 - this.tilt.y * 1.4, 0.55 + this.tilt.x * 1.4, 1);
        if (!s.tween) s.group.position.y = this.reduced ? 0 : Math.sin(time * 1.1) * s.height * 0.012;
      }
    }

    this.renderer.render(this.scene, this.camera);
  };
}
