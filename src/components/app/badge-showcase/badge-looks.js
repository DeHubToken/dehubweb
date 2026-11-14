import * as THREE from 'three';

/**
 * Themed looks for the 3D badge: what surrounds the metal badge in each
 * theme. One quiet touch per theme, and nothing ever covers the artwork.
 * Units match the badge mesh: the badge is 2.4 wide, centred on the origin.
 * Everything stays within about one badge-height so it clears the details.
 */
export const BADGE_LOOKS = ['glass', 'cosmic', 'hazy', 'swarms', 'lavalamp', 'winter', 'war', 'jungle', 'island', 'hacker', 'horror'];

const TAU = Math.PI * 2;
function random(seed) {
  let s = seed | 0;
  const next = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  next.range = (a, b) => a + (b - a) * next();
  next.bell = () => (next() + next() + next() + next() - 2) / 1.15;
  return next;
}
const sheet = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function texture(canvas, color = true) { const t = new THREE.CanvasTexture(canvas); if (color) t.colorSpace = THREE.SRGBColorSpace; return t; }
function noise2(R) {
  const grid = Array.from({ length: 4096 }, () => R()), sm = x => x * x * (3 - 2 * x), at = (a, b) => grid[(a & 63) + (b & 63) * 64];
  const n = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y), fx = sm(x - ix), fy = sm(y - iy); return (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy; };
  return (x, y, octaves = 4) => { let v = 0, a = .5, f = 1, total = 0; for (let i = 0; i < octaves; i++) { v += n(x * f, y * f) * a; total += a; a *= .5; f *= 2.03; } return v / total; };
}
function radial(stops) {
  const c = sheet(128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(s => gr.addColorStop(s[0], s[1])); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return texture(c);
}
function smoke(R, noise, k) {
  const size = 192, c = sheet(size), g = c.getContext('2d'), im = g.createImageData(size, size), ox = R() * 40, oy = R() * 40;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = x / size * 2 - 1, ny = y / size * 2 - 1, r = nx * nx + ny * ny; if (r >= 1) continue;
    const w = noise(nx * 2 + ox + 9, ny * 2 + oy + 9, 3) * 3, f = noise(nx * k + ox + Math.sin(ny * 3 + w) * .7, ny * k + oy + Math.cos(nx * 3 - w) * .7, 4);
    const d = Math.max(0, Math.min(1, (f - .28) / .45)), i = (y * size + x) * 4;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = 200 + f * 55; im.data[i + 3] = d * d * (3 - 2 * d) * Math.pow(1 - r, 1.6) * 255;
  }
  g.putImageData(im, 0, 0); return texture(c);
}
function caustics(R, noise) {
  const size = 192, c = sheet(size), g = c.getContext('2d'), im = g.createImageData(size, size), o = R() * 50;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * 4, v = y / size * 4, wx = noise(u + o, v + 7, 2) * 1.6, wy = noise(u + 3, v + o, 2) * 1.6;
    const a = 1 - Math.abs(2 * noise(u * 1.3 + wx, v * 1.3 + wy, 2) - 1), b = 1 - Math.abs(2 * noise(u * 2.1 - wy + 11, v * 2.1 + wx + 5, 2) - 1);
    const dx = x / size * 2 - 1, dy = y / size * 2 - 1, fade = Math.max(0, 1 - (dx * dx + dy * dy)) ** 1.5;
    const l = Math.min(255, (Math.pow(a, 9) * 1.2 + Math.pow(b, 12) * .8 + Math.pow(a * b, 3) * .5) * fade * 255), i = (y * size + x) * 4;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = l;
  }
  g.putImageData(im, 0, 0); return texture(c);
}

export function createBadgeLook(name) {
  if (!BADGE_LOOKS.includes(name)) throw new Error('Unknown badge look');
  const R = random(20261114 + BADGE_LOOKS.indexOf(name) * 97), noise = noise2(R);
  const decor = new THREE.Group(), fades = [], pointClouds = [], steps = [], lamps = [];
  const look = { name, decor, panels: [], backdrop: '#101214', body: null, dress: null };
  let glowMap;

  const fade = (material, base = material.opacity) => { material.transparent = true; fades.push([material, base]); return material; };
  function glow(color, size, x, y, z, opacity, map) {
    glowMap ||= radial([[0, 'rgba(255,255,255,1)'], [.25, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]);
    const sprite = new THREE.Sprite(fade(new THREE.SpriteMaterial({ map: map || glowMap, color, opacity: Math.min(1, opacity * 1.9), blending: THREE.AdditiveBlending, depthWrite: false })));
    sprite.scale.set(Array.isArray(size) ? size[0] : size, Array.isArray(size) ? size[1] : size, 1); sprite.position.set(x, y, z); decor.add(sprite); return sprite;
  }
  const pool = (color, opacity, width = 3.6) => glow(color, [width, .6], 0, -1.5, 0, opacity);
  /** Soft round points sized in badge units. fill() returns [x,y,z, r,g,b, size, alpha] or null. */
  function points(parent, count, fill, extra = {}) {
    const pos = [], col = [], size = [], alpha = [], seedOf = [];
    for (let i = 0; i < count; i++) { const p = fill(i); if (!p) continue; pos.push(p[0], p[1], p[2]); col.push(p[3], p[4], p[5]); size.push(p[6]); alpha.push(p[7]); seedOf.push(R()); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1)); geo.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alpha, 1)); geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seedOf, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 300 }, uTime: { value: 0 }, uFade: { value: 0 }, uFall: { value: extra.fall || 0 }, uSpan: { value: extra.span || 4 }, uTwinkle: { value: extra.twinkle || 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec3 aColor;attribute float aSize;attribute float aAlpha;attribute float aSeed;uniform float uScale;uniform float uTime;uniform float uFall;uniform float uSpan;uniform float uTwinkle;varying vec3 vColor;varying float vAlpha;
        void main(){vec3 p=position;if(uFall!=0.){p.y=mod(p.y-uTime*uFall*(.6+aSeed*.8)+uSpan*.5,uSpan)-uSpan*.5;p.x+=sin(uTime*.6+aSeed*40.)*.06;}
          vec4 mv=modelViewMatrix*vec4(p,1.);float s=aSize*uScale/-mv.z;float edge=uFall!=0.?smoothstep(uSpan*.5,uSpan*.3,abs(p.y)):1.;
          vAlpha=aAlpha*min(1.,s*s)*edge*mix(1.,.5+.5*sin(uTime*(1.+aSeed*2.)+aSeed*60.),uTwinkle);vColor=aColor;gl_PointSize=max(s,1.);gl_Position=projectionMatrix*mv;}`,
      fragmentShader: 'uniform float uFade;varying vec3 vColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-.5)*2.;float a=smoothstep(1.,0.,d);gl_FragColor=vec4(vColor,a*a*vAlpha*uFade);}',
    });
    const cloud = new THREE.Points(geo, material); cloud.frustumCulled = false; parent.add(cloud); pointClouds.push(material); return cloud;
  }
  const tint = (hex, m = 1) => { const c = new THREE.Color(hex); return [c.r * m, c.g * m, c.b * m]; };
  const light = (color, intensity, x, y, z) => { const l = new THREE.PointLight(color, 0, 0, 2); l.position.set(x, y, z); decor.add(l); lamps.push([l, intensity, true]); return l; };
  const bar = (w, h, color, opacity, additive = true) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), fade(new THREE.MeshBasicMaterial({ color, opacity, side: THREE.DoubleSide, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending })));
  /** A layer over the badge face, cut to the artwork's own shape. */
  function overlay(badge, parts, paint, material) {
    const c = sheet(256), g = c.getContext('2d'); paint(g, 256);
    const mesh = new THREE.Mesh(parts.faceGeometry, new THREE.MeshBasicMaterial({ map: texture(c), transparent: true, depthWrite: false, toneMapped: false, ...material }));
    mesh.position.z = parts.frontZ + .004; mesh.userData.ownsMap = true; badge.add(mesh); return mesh;
  }

  if (name === 'glass') {
    look.backdrop = '#06181c';
    look.panels = [[1.2, 9, -5, 2, 3, '#ffffff', 5], [.8, 9, 5, 1, 1, '#bffcf2', 4], [8, .8, 0, 6, 2, '#ffffff', 4], [1, 6, 1, 0, -5, '#7a6cff', 4], [7, 1, 0, -5, 2, '#39e6d0', 2], [.3, 6, -2.5, 0, 5, '#ffffff', 3], [.3, 5, 3, -1, 5, '#ff8ad8', 2.5]];
    const crystal = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transmission: 1, thickness: .9, ior: 1.5, roughness: .015, metalness: 0, dispersion: 7, attenuationColor: new THREE.Color('#9ff5ea'), attenuationDistance: 5, envMapIntensity: 1, clearcoat: 1, clearcoatRoughness: .02 });
    look.dress = (badge, parts) => {
      // The metal badge sits a little smaller inside a polished crystal casing.
      badge.children.forEach(child => { child.scale.multiplyScalar(.86); child.position.z *= .86; });
      parts.face.material.transparent = false; parts.face.material.alphaTest = .35;
      const geo = new THREE.ExtrudeGeometry(parts.shape, { depth: .34, bevelEnabled: true, bevelSegments: 8, steps: 1, bevelSize: .2, bevelThickness: .26, curveSegments: 8 }); geo.translate(0, 0, -.17);
      const shell = new THREE.Mesh(geo, crystal.clone()); shell.scale.set(.92, .92, 1); badge.add(shell);
    };
    for (const [c, s, x, y, o] of [['#1fd8c0', 4.6, -1.4, .5, .3], ['#5a6bff', 4.2, 1.5, -.4, .3], ['#b0fff4', 2, .6, 1, .1], ['#ff7ad0', 2, -1, -1, .08]]) glow(c, s, x, y, -2, o);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), fade(new THREE.MeshBasicMaterial({ map: caustics(R, noise), color: '#4fe8d0', opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false })));
    floor.rotation.x = -1.34; floor.position.set(.2, -1.42, .1); decor.add(floor);
    const sparkle = [glow('#ffffff', .22, -.9, 1, 1.2, .7), glow('#d9fffb', .14, 1.05, -.25, 1.2, .6)];
    steps.push(t => { floor.rotation.z = t * .05; sparkle.forEach((s, i) => s.scale.setScalar((i ? .14 : .22) * (1 + .25 * Math.sin(t * 1.7 + i * 2)))); });
  }

  if (name === 'cosmic') {
    look.backdrop = '#02040a';
    look.panels = [[4, 8, -6, 3, 3, '#9fd0ff', 9], [1, 6, 5, -1, -2, '#ffb07a', 5], [6, 1.5, 0, 6, -1, '#6a7bff', 4], [1.5, 5, 3, 2, 5, '#3a4a9a', 2]];
    const maps = [smoke(R, noise, 2.2), smoke(R, noise, 3)];
    for (let i = 0; i < 8; i++) { const s = glow(['#2a3fd8', '#6a2fd0', '#1b7ad0', '#c0408a'][i % 4], R.range(2.6, 4.2), R.bell() * 2.2, R.bell() * .9, R.range(-3.4, -2), R.range(.1, .2), maps[i % 2]); s.material.rotation = R() * TAU; }
    points(decor, 320, () => [R.bell() * 3.2, R.bell() * 1.5, R.range(-4, -1.6), ...tint(['#cfe2ff', '#ffffff', '#ffd9b0', '#9fbfff'][R() * 4 | 0], R.range(.5, 1.4)), R.range(.02, .05), .9], { twinkle: .5 });
    // The ring: ice dust with gaps, tilted like Saturn's.
    const roll = new THREE.Group(), tilt = new THREE.Group(), spin = new THREE.Group(); roll.rotation.z = -.33; tilt.rotation.x = 1.29; roll.add(tilt); tilt.add(spin); decor.add(roll);
    const dust = ['#cfe6ff', '#9fc4ff', '#ffe6c8', '#ffffff', '#7fa8f0'];
    points(spin, 30000, () => { const r = 1.72 + Math.pow(R(), .8) * 1.3, band = .5 + .5 * Math.sin(r * 23) * Math.sin(r * 7.3 + 1); if (R() > .12 + band * .88 || (r > 2.44 && r < 2.53)) return null; const a = R() * TAU; return [Math.cos(a) * r, Math.sin(a) * r, R.bell() * .012, ...tint(dust[R() * 5 | 0], R.range(.5, 1.4)), R.range(.012, .028), .85]; });
    for (const [a, r, size, color] of [[.62, 2.5, .12, '#b9d3f2'], [3.5, 2.9, .07, '#f0b890'], [5.05, 2.06, .05, '#d8e2ee']]) { const moon = new THREE.Mesh(new THREE.SphereGeometry(size, 24, 16), fade(new THREE.MeshStandardMaterial({ color, roughness: .9, metalness: 0 }), 1)); moon.position.set(Math.cos(a) * r, Math.sin(a) * r, 0); spin.add(moon); }
    const sun = new THREE.DirectionalLight('#cfe6ff', 0); sun.position.set(-5, 4, 4); decor.add(sun); lamps.push([sun, 2, false]);
    const flare = glow('#d6ecff', .5, -.82, .98, 1.3, .8), streak = radial([[0, 'rgba(255,255,255,1)'], [.08, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']]);
    glow('#d6ecff', [2.4, .05], -.82, .98, 1.3, .7, streak); glow('#d6ecff', [.05, 1.5], -.82, .98, 1.3, .6, streak);
    steps.push(t => { spin.rotation.z = t * .05; flare.scale.setScalar(.5 * (1 + .12 * Math.sin(t * 1.3))); });
  }

  if (name === 'hazy') {
    look.backdrop = '#0c0816';
    look.panels = [[1.6, 8, -5, 1, -1, '#b06aff', 6], [1.6, 8, 5, 0, -1, '#3fd0ff', 5], [6, 1, 0, 6, 2, '#e6c8ff', 3.5], [1, 5, -2, 0, 6, '#ffffff', 2.2]];
    const maps = [smoke(R, noise, 2.2), smoke(R, noise, 3), smoke(R, noise, 2.7)], colors = ['#8a5ae0', '#a878f0', '#5a9ad8', '#7a56d0'], drift = [];
    // A bank of smoke behind and below, thinning upward; the badge appears out of it.
    for (let i = 0; i < 16; i++) { const s = glow(colors[i % 4], R.range(2.4, 3.8), R.bell() * 1.9, -.6 + Math.abs(R.bell()) * 1.1, R.range(-2.6, -.6), R.range(.12, .22), maps[i % 3]); s.material.rotation = R() * TAU; drift.push([s, s.position.x, R() * TAU, R.range(-.04, .04)]); }
    for (let i = 0; i < 5; i++) { const s = glow(colors[i % 4], R.range(1.6, 2.4), -1.6 + i * .8, -1.5 + R.bell() * .08, R.range(.4, 1), R.range(.08, .13), maps[i % 3]); s.material.rotation = R() * TAU; drift.push([s, s.position.x, R() * TAU, R.range(-.06, .06)]); }
    light('#b46bff', 14, -2.4, .6, -1); light('#39d6ff', 10, 2.5, -.2, -1);
    steps.push(t => drift.forEach(([s, x, phase, turn]) => { s.position.x = x + Math.sin(t * .22 + phase) * .22; s.material.rotation += turn * .016; }));
  }

  if (name === 'swarms') {
    look.backdrop = '#040c10';
    look.panels = [[1.6, 8, -5, 2, 2, '#8fefff', 6], [1.2, 8, 5, 0, -1, '#35b8e0', 5], [6, 1, 0, 6, 1, '#d6fbff', 4], [1, 5, 2, 1, 6, '#ffffff', 1.8]];
    glow('#1f9fc8', 4.6, 0, 0, -2, .12);
    // One thin flock circling, bunched like starlings; it passes behind the badge.
    const orbit = new THREE.Group(), spin = new THREE.Group(); orbit.rotation.set(1.22, .1, -.35); orbit.add(spin); decor.add(orbit);
    const bunches = [[.08, .05], [.3, .1], [.47, .04], [.68, .08], [.9, .05]];
    points(spin, 9000, () => { const b = bunches[R() * 5 | 0], u = (b[0] + R.bell() * b[1]) * TAU, rad = 1.95 + Math.sin(u * 3) * .12, spread = .03 + Math.abs(R.bell()) * .09; return [Math.cos(u) * rad + R.bell() * spread, Math.sin(u) * rad + R.bell() * spread, Math.sin(u * 2) * .12 + R.bell() * spread, ...tint(['#8ff0ff', '#d6fcff', '#ffffff'][R() * 3 | 0], R.range(.5, 1.2)), R.range(.012, .026), .85]; });
    steps.push(t => { spin.rotation.z = -t * .22; });
  }

  if (name === 'lavalamp') {
    look.backdrop = '#150604';
    look.panels = [[8, 1.6, 0, -5, 1, '#ff7a1e', 5], [1.2, 8, -5, 0, 0, '#ff5a1a', 3], [1.2, 8, 5, 0, 0, '#ff9a3a', 3], [6, 1, 0, 6, 2, '#ffe8c8', 3], [1, 5, 2, 1, 6, '#fff0dc', 2]];
    look.body = { color: 0xd8c8be };
    const blobs = [];
    for (const [x, y, z, sx, sy] of [[-2.2, .5, -2, .34, .48], [2.3, -.5, -2.3, .42, .54], [1.8, 1.1, -2.6, .18, .2]]) {
      const wax = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), fade(new THREE.MeshPhysicalMaterial({ color: '#ff6a1c', emissive: '#b82004', emissiveIntensity: .3, roughness: .2, clearcoat: 1, clearcoatRoughness: .1 }), 1));
      wax.position.set(x, y, z); wax.scale.set(sx, sy, sx); decor.add(wax); glow('#ff5a14', sx * 5, x, y, z - .2, .1); blobs.push([wax, y, sy, R() * TAU]);
    }
    light('#ff8a30', 16, 0, -2.4, .8);
    look.dress = (badge, parts) => overlay(badge, parts, (g, s) => { const l = g.createLinearGradient(0, s * .55, 0, s * .98); l.addColorStop(0, 'rgba(255,110,30,0)'); l.addColorStop(1, 'rgba(255,130,40,.75)'); g.fillStyle = l; g.fillRect(0, 0, s, s); g.globalCompositeOperation = 'destination-in'; g.drawImage(parts.image, 0, 0, s, s); }, { blending: THREE.AdditiveBlending });
    pool('#ff7a20', .3);
    steps.push(t => blobs.forEach(([wax, y, sy, phase]) => { wax.position.y = y + Math.sin(t * .35 + phase) * .22; wax.scale.y = sy * (1 + .08 * Math.sin(t * .5 + phase)); }));
  }

  if (name === 'winter') {
    look.backdrop = '#07121d';
    look.panels = [[1.6, 9, -5, 2, 3, '#ffffff', 6], [1.2, 9, 5, 1, 0, '#bfe6ff', 5], [8, 1, 0, 6, 1, '#e6f6ff', 5], [1, 6, 1, 0, -5, '#5aa8ff', 4], [1.5, 5, 2, 0, 6, '#dff2ff', 2]];
    glow('#2f7ad8', 4.4, 0, .1, -2, .16);
    // Frost: a thin band creeping in from the badge's own edge.
    look.dress = (badge, parts) => overlay(badge, parts, (g, s) => {
      g.drawImage(parts.image, 0, 0, s, s); const src = g.getImageData(0, 0, s, s).data, out = g.createImageData(s, s), dist = new Float32Array(s * s).fill(99);
      for (let pass = 0; pass < 2; pass++) for (let k = 0; k < s * s; k++) { const i = pass ? s * s - 1 - k : k, x = i % s, y = i / s | 0, step = pass ? 1 : -1; if (src[i * 4 + 3] < 90) { dist[i] = 0; continue; } let d = dist[i]; if (x + step >= 0 && x + step < s) d = Math.min(d, dist[i + step] + 1); if (y + step >= 0 && y + step < s) d = Math.min(d, dist[i + step * s] + 1); dist[i] = d; }
      for (let i = 0; i < s * s; i++) { const x = i % s, y = i / s | 0, v = noise(x / 11, y / 11, 4), grain = noise(x / 1.3, y / 1.3, 1), reach = 10 + v * 22, a = dist[i] > 0 ? Math.max(0, 1 - dist[i] / reach) : 0; out.data[i * 4] = out.data[i * 4 + 1] = 238 + grain * 17; out.data[i * 4 + 2] = 255; out.data[i * 4 + 3] = Math.pow(a, 1.3) * (160 + grain * 95); }
      g.putImageData(out, 0, 0);
    }, {});
    points(decor, 200, () => [R.bell() * 2.6, R.range(-1.8, 1.8), R.range(-3, -.5), ...tint('#eaf6ff', R.range(.7, 1.3)), R.range(.03, .07), .9], { fall: .22, span: 3.6 });
    pool('#9fd0ff', .16);
  }

  if (name === 'war') {
    look.backdrop = '#050c0c';
    look.panels = [[1.6, 8, -5, 2, 2, '#8ff5ea', 5], [1.2, 8, 5, 0, -1, '#2fd0c0', 4], [6, 1, 0, 6, 1, '#e6fffb', 4], [1, 5, 2, 1, 6, '#ffffff', 1.8]];
    look.body = { color: 0x9aa8a6, roughness: .28 };
    glow('#1fa898', 4.4, 0, 0, -2, .08);
    const hud = new THREE.Group(), teal = '#6ff5e6'; hud.rotation.set(.04, -.3, 0); decor.add(hud);
    const reach = 1.42, arm = .3, thick = .018;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const h = bar(arm, thick, teal, 1); h.position.set(sx * (reach - arm / 2), sy * reach, .1); const v = bar(thick, arm, teal, 1); v.position.set(sx * reach, sy * (reach - arm / 2), .1); hud.add(h, v); }
    const dial = new THREE.Group(); dial.position.z = -.5; hud.add(dial);
    dial.add(new THREE.Mesh(new THREE.RingGeometry(1.86, 1.868, 128), fade(new THREE.MeshBasicMaterial({ color: teal, opacity: .3, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))));
    for (let i = 0; i < 60; i++) { if (i % 15 > 2) continue; const a = i / 60 * TAU, tick = bar(.07, .008, teal, .55); tick.position.set(Math.cos(a) * 1.81, Math.sin(a) * 1.81, 0); tick.rotation.z = a; dial.add(tick); }
    const sweep = bar(2.7, .008, '#c8fff8', .9); sweep.position.z = .3; hud.add(sweep);
    const trail = sheet(8, 64), tg = trail.getContext('2d'), tl = tg.createLinearGradient(0, 0, 0, 64); tl.addColorStop(0, 'rgba(111,245,230,0)'); tl.addColorStop(1, 'rgba(111,245,230,.5)'); tg.fillStyle = tl; tg.fillRect(0, 0, 8, 64);
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(2.7, .28), fade(new THREE.MeshBasicMaterial({ map: texture(trail), opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))); wake.position.z = .3; hud.add(wake);
    pool('#2fd0c0', .14);
    steps.push(t => { const cycle = (t * .22) % 1, y = 1.25 - Math.min(1, cycle * 1.6) * 2.5, on = cycle < .625 ? Math.sin(cycle / .625 * Math.PI) : 0; sweep.position.y = y; wake.position.y = y + .145; sweep.userData.gain = on; wake.userData.gain = on; dial.rotation.z = t * .04; });
  }

  if (name === 'jungle') {
    look.backdrop = '#0a140c';
    look.panels = [[1.6, 4, -5, 5, 2, '#fff0b8', 7], [1.2, 8, 5, 0, -1, '#5a9a3a', 3], [6, 1, 0, 6, 0, '#e6f5a8', 3.5], [1, 5, 2, 1, 6, '#f2ffd8', 1.8], [2, 6, -4, -2, -3, '#2f6a2a', 2]];
    look.body = { color: 0xd8d2b8, roughness: .2 };
    glow('#6aa83a', 4.6, -.8, .5, -2.4, .12);
    // Sun breaking through the canopy.
    const shaft = sheet(32, 128), sg = shaft.getContext('2d'), across = sg.createLinearGradient(0, 0, 32, 0); across.addColorStop(0, 'rgba(255,255,255,0)'); across.addColorStop(.5, 'rgba(255,255,255,1)'); across.addColorStop(1, 'rgba(255,255,255,0)'); sg.fillStyle = across; sg.fillRect(0, 0, 32, 128);
    sg.globalCompositeOperation = 'destination-in'; const down = sg.createLinearGradient(0, 0, 0, 128); down.addColorStop(0, 'rgba(0,0,0,0)'); down.addColorStop(.25, '#000'); down.addColorStop(1, 'rgba(0,0,0,0)'); sg.fillStyle = down; sg.fillRect(0, 0, 32, 128);
    const shaftMap = texture(shaft), rays = [];
    for (let i = 0; i < 4; i++) { const ray = new THREE.Mesh(new THREE.PlaneGeometry(R.range(.5, 1), 4.4), fade(new THREE.MeshBasicMaterial({ map: shaftMap, color: '#f4f7b8', opacity: R.range(.16, .26), blending: THREE.AdditiveBlending, depthWrite: false }))); ray.position.set(-2 + i * 1.15, .1, -1.4); ray.rotation.z = .42; decor.add(ray); rays.push([ray, R() * TAU]); }
    points(decor, 26, () => { const x = R.bell() * 2.4, y = R.bell() * 1.3; if (Math.hypot(x, y) < 1.5) return null; return [x, y, R.range(-2, -.4), ...tint('#e6ff7a', R.range(1, 1.5)), R.range(.05, .085), 1]; }, { twinkle: 1 });
    pool('#b9d86a', .14);
    steps.push(t => { rays.forEach(([ray, phase]) => { ray.userData.gain = .7 + .3 * Math.sin(t * .4 + phase); }); });
  }

  if (name === 'island') {
    look.backdrop = '#083a44';
    look.panels = [[30, 1.5, 0, 1, -12, '#ffc890', 3], [2, 2, 8, 3, -9, '#fff2c8', 8], [30, 6, 0, 9, 0, '#2a8a90', 1.4], [30, 6, 0, -8, 0, '#19b8b0', 1.6], [1.5, 8, -7, 2, 3, '#bff5ee', 2.6], [1, 5, 2, 1, 6, '#ffffff', 1.6]];
    const surface = -1.3, squash = .4, waves = [];
    // The badge hovers just above still water. Its mirror image lies on the
    // surface, shortened by the low angle, swaying a little and sinking away.
    look.dress = (badge, parts) => {
      const material = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: parts.face.material.map }, uTime: { value: 0 }, uFade: { value: 0 } }, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
        vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: `uniform sampler2D uMap;uniform float uTime;uniform float uFade;varying vec2 vUv;
          void main(){float depth=vUv.y;float sway=(sin(depth*46.-uTime*1.5)*.006+sin(depth*17.+uTime*.8)*.005)*(.35+depth*2.2);
            vec4 art=texture2D(uMap,vec2(vUv.x+sway,vUv.y));float band=.86+.14*sin(depth*90.-uTime*2.2);
            float a=art.a*smoothstep(.92,.02,depth)*.62*band*uFade;gl_FragColor=vec4(mix(art.rgb,vec3(.55,.95,.9),.3)*a,a);
            #include <colorspace_fragment>
          }`,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      });
      const mirror = new THREE.Mesh(parts.faceGeometry, material); mirror.scale.y = -squash; mirror.position.set(0, surface - .02 - 1.2 * squash, 0); mirror.renderOrder = -1; badge.add(mirror); waves.length = 0; waves.push(material);
    };
    // The water itself: a soft sheet of teal under the badge, warm where the sun is low.
    const sheetMap = sheet(128, 64), sg = sheetMap.getContext('2d'), down = sg.createLinearGradient(0, 0, 0, 64); down.addColorStop(0, 'rgba(255,255,255,1)'); down.addColorStop(.25, 'rgba(255,255,255,.45)'); down.addColorStop(1, 'rgba(255,255,255,0)'); sg.fillStyle = down; sg.fillRect(0, 0, 128, 64);
    sg.globalCompositeOperation = 'destination-in'; const across = sg.createLinearGradient(0, 0, 128, 0); across.addColorStop(0, 'rgba(0,0,0,0)'); across.addColorStop(.5, '#000'); across.addColorStop(1, 'rgba(0,0,0,0)'); sg.fillStyle = across; sg.fillRect(0, 0, 128, 64);
    const body = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.25), fade(new THREE.MeshBasicMaterial({ map: texture(sheetMap), color: '#1fb6b0', opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false }))); body.position.set(0, surface - .625, -.3); decor.add(body);
    glow('#ffb070', [3.6, .5], .3, surface + .06, -1.2, .26); glow('#ffe2b8', [1.6, .12], .2, surface + .01, -1, .3); glow('#27c2b8', 4.2, 0, .1, -2.2, .1);
    const streak = radial([[0, 'rgba(255,255,255,1)'], [.3, 'rgba(255,255,255,.4)'], [1, 'rgba(255,255,255,0)']]);
    glow('#d8fff8', [4.4, .028], 0, surface, -.2, .5, streak);
    const water = new THREE.Group(); water.position.y = surface - .04; water.rotation.x = -1.36; decor.add(water);
    const rings = [];
    for (let k = 0; k < 3; k++) { const ring = new THREE.Mesh(new THREE.RingGeometry(.975, 1, 96), fade(new THREE.MeshBasicMaterial({ color: '#d8fff8', opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))); water.add(ring); rings.push(ring); }
    points(decor, 30, () => [R.bell() * 1.5, surface - .03 - R() * .5, R.range(-.3, .6), ...tint('#ffe9c4', R.range(.9, 1.5)), R.range(.012, .024), .9], { twinkle: 1 });
    steps.push(t => { rings.forEach((ring, k) => { const p = (t * .1 + k / 3) % 1; ring.scale.setScalar(.5 + p * 1.25); ring.userData.gain = Math.sin(p * Math.PI) * (1 - p * .4); }); waves.forEach(material => { material.uniforms.uTime.value = t; }); });
    look.reflect = presence => waves.forEach(material => { material.uniforms.uFade.value = presence; });
  }

  if (name === 'hacker') {
    look.backdrop = '#020803';
    look.panels = [[1.6, 8, -5, 2, 2, '#6fffa8', 5], [1.2, 8, 5, 0, -1, '#1fd060', 4], [6, 1, 0, 6, 1, '#d6ffe6', 3.5], [1, 5, 2, 1, 6, '#ffffff', 1.8]];
    look.body = { color: 0xa8b8ae, roughness: .2 };
    glow('#0f8a3c', 4.4, 0, 0, -2, .12); light('#3cff8a', 10, 2.4, -.5, -1.2);
    // Faint code falling well behind the badge.
    const glyphs = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ0123456789ABCDEF<>/{}$#=+*:.'.split('').slice(0, 64), atlas = sheet(512), ag = atlas.getContext('2d');
    ag.fillStyle = '#fff'; ag.font = '700 48px ui-monospace,Menlo,Consolas,monospace'; ag.textAlign = 'center'; ag.textBaseline = 'middle'; glyphs.forEach((c, i) => ag.fillText(c, (i % 8) * 64 + 32, (i / 8 | 0) * 64 + 34));
    const cells = [], span = 3.8;
    for (let column = 0; column < 22; column++) { const z = R.range(-4, -1.4), x = R.bell() * 2.9, length = R.range(6, 14) | 0, top = R.range(-span / 2, span / 2), speed = R.range(.25, .6); for (let k = 0; k < length; k++) cells.push([x, top - k * .15, z, k / length, k === length - 1 ? 1 : 0, speed]); }
    const quad = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(.13, .13)), offsets = new Float32Array(cells.length * 4), kinds = new Float32Array(cells.length * 4);
    cells.forEach((c, i) => { offsets.set([c[0], c[1], c[2], c[5]], i * 4); const pick = R() * 64 | 0; kinds.set([pick % 8, pick / 8 | 0, c[3] * c[3], c[4]], i * 4); });
    quad.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 4)); quad.setAttribute('aKind', new THREE.InstancedBufferAttribute(kinds, 4)); quad.instanceCount = cells.length;
    const rainMaterial = new THREE.ShaderMaterial({ uniforms: { uMap: { value: texture(atlas, false) }, uTime: { value: 0 }, uFade: { value: 0 }, uSpan: { value: span } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute vec4 aOffset;attribute vec4 aKind;uniform float uTime;uniform float uSpan;varying vec2 vUv;varying float vGlow;varying float vHead;void main(){vUv=(uv+vec2(aKind.x,7.-aKind.y))/8.;vec3 p=aOffset.xyz;p.y=mod(p.y-uTime*aOffset.w+uSpan*.5,uSpan)-uSpan*.5;vHead=aKind.w;vGlow=aKind.z*.5*smoothstep(uSpan*.5,uSpan*.28,abs(p.y));gl_Position=projectionMatrix*modelViewMatrix*vec4(position+p,1.);}',
      fragmentShader: 'uniform sampler2D uMap;uniform float uFade;varying vec2 vUv;varying float vGlow;varying float vHead;void main(){float a=texture2D(uMap,vUv).r;vec3 c=mix(vec3(.05,1.,.35),vec3(.7,1.,.85),vHead);gl_FragColor=vec4(c,a*vGlow*(1.+vHead)*uFade);}' });
    const rain = new THREE.Mesh(quad, rainMaterial); rain.frustumCulled = false; decor.add(rain); pointClouds.push(rainMaterial);
    const sweep = bar(2.9, .008, '#9dffc0', 1); sweep.position.z = .3; sweep.rotation.set(.04, -.3, 0); decor.add(sweep);
    pool('#3cff8a', .14);
    steps.push(t => { const cycle = (t * .2) % 1; sweep.position.y = 1.25 - Math.min(1, cycle * 1.6) * 2.5; sweep.userData.gain = cycle < .625 ? Math.sin(cycle / .625 * Math.PI) : 0; });
  }

  if (name === 'horror') {
    look.backdrop = '#050303';
    look.panels = [[2, 5, -6, 1, 1, '#ff8a30', 9], [1, 3, -4, 0, 4, '#ffb060', 3], [2, 6, 6, 2, 2, '#2a3a5a', 1.6], [1, 5, 2, 1, 6, '#ffe6d0', 1.2]];
    look.body = { color: 0xb8aca6, roughness: .26 };
    // One torch off to the side: warm on one edge, deep shadow on the other.
    const torch = light('#ff8428', 40, -3, .5, 1.2), flame = glow('#ff7a20', 3.4, -2.9, .4, -1.2, .34), core = glow('#ffc070', 1.2, -2.9, .4, -1.1, .3);
    points(decor, 22, () => [-2.7 + R.bell() * .5, R.range(-1.6, 1.6), R.range(-1.2, .2), ...tint('#ffb040', R.range(.9, 1.6)), R.range(.014, .026), 1], { fall: -.28, span: 3.2, twinkle: .6 });
    pool('#ff7a20', .1, 3);
    steps.push(t => { const flicker = .82 + .1 * Math.sin(t * 9.1) + .08 * Math.sin(t * 23.7 + 1.3); torch.userData.gain = flicker; flame.userData.gain = flicker; core.userData.gain = flicker; });
  }

  /**
   * `time` in seconds, `presence` 0..1 as the surroundings fade in, `scale`
   * px per badge unit at the badge, `unit` world size of one badge unit.
   */
  look.update = (time, presence, scale, unit = 1, badge = null) => {
    steps.forEach(step => step(time, badge));
    // Point lights fall off with distance, and the scene is drawn `unit` times smaller.
    lamps.forEach(([lamp, base, local]) => { lamp.intensity = base * presence * (local ? unit * unit : 1) * (lamp.userData.gain ?? 1); });
    look.reflect?.(presence);
    fades.forEach(([material, base]) => { material.opacity = base * presence; });
    decor.traverse(node => { if (node.userData.gain !== undefined && node.material) node.material.opacity *= node.userData.gain; });
    pointClouds.forEach(material => { material.uniforms.uTime.value = time; material.uniforms.uFade.value = presence; if (material.uniforms.uScale) material.uniforms.uScale.value = scale; });
  };
  look.dispose = () => decor.traverse(node => {
    node.geometry?.dispose();
    const material = node.material; if (!material) return;
    material.map?.dispose(); material.alphaMap?.dispose(); Object.values(material.uniforms || {}).forEach(u => u.value?.isTexture && u.value.dispose()); material.dispose();
  });
  return look;
}
