'use strict';
// DeHub Maboroshi launch film. Every pixel is a pure function of time: render(t) sets the whole frame.
// 140 BPM grid; all scene times below are in beats. The footage is real motion-library clips and their Maboroshi recasts.
const Q = new URLSearchParams(location.search);
const W = +(Q.get('w') || 1920), H = +(Q.get('h') || 1080), VERT = H > W;
const BPM = 170, B = 60 / BPM, bt = b => b * B;
const END_B = 68, TOTAL = bt(END_B) + 1.4;
const stage = document.getElementById('stage');
const STY = +(Q.get('style') || 5); // text style: 0 chrome, 1 clean white, 2 sage, 3 outline, 4 sticker, 5 mono
document.body.classList.add('sty' + STY);
stage.style.width = W + 'px'; stage.style.height = H + 'px';
const ACC = '#d4e0c8', ACC_RGB = '212,224,200';

// ---------------------------------------------------------------- math
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const oc = t => 1 - (1 - t) ** 3, oq = t => 1 - (1 - t) ** 4, ox = t => t >= 1 ? 1 : 1 - 2 ** (-10 * t);
const ic = t => t * t * t, ioc = t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const ob = (t, s = 1.70158) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
const P = (b, a, z) => clamp((b - a) / (z - a));
const rnd = s => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---------------------------------------------------------------- dom
function mk(tag, cls, css, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (css) e.style.cssText = css;
  if (html != null) e.innerHTML = html;
  (parent || stage).appendChild(e);
  return e;
}
const tf = (e, s) => { if (e._tf !== s) { e.style.transform = s; e._tf = s; } };
const op = (e, o) => { o = Math.round(clamp(o) * 1000) / 1000; if (e._op !== o) { e.style.opacity = o; e.style.visibility = o <= 0 ? 'hidden' : 'visible'; e._op = o; } };
const vis = (e, on) => { const d = on ? '' : 'none'; if (e._d !== d) { e.style.display = d; e._d = d; } };
const txt = (e, s) => { if (e._tx !== s) { e.textContent = s; e._tx = s; } };
const CHROME = 'linear-gradient(180deg,#ffffff 0%,#f1f1f1 30%,#9a9a9a 49%,#5e5e5e 51%,#e9e9e9 66%,#bdbdbd 84%,#ffffff 100%)';
const SHINE = 'linear-gradient(100deg, rgba(255,255,255,0) 44%, rgba(255,255,255,.98) 50%, rgba(255,255,255,0) 56%)';
function shineInit(e) { e.style.backgroundImage = SHINE + ',' + CHROME; e.style.backgroundSize = '320% 100%, 100% 100%'; e.style.backgroundRepeat = 'no-repeat'; e.style.backgroundPosition = '130% 0, 0 0'; }
function shine(e, p) { if (STY) return; const v = p <= 0 || p >= 1 ? 130 : lerp(115, -15, p); const s = v.toFixed(1) + '% 0, 0 0'; if (e._sh !== s) { e.style.backgroundPosition = s; e._sh = s; } }
const ico = (n, size = 16, sw = 2, style = '') => `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" stroke-width="${sw}" style="${style}">${ICONS[n]}</svg>`;
function cv(w, h, parent, css = '') { const c = mk('canvas', 'ab', `width:${w}px;height:${h}px;${css}`, parent); c.width = w; c.height = h; return c; }
function ocv(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

const loads = [];
function whenLoaded(i, src) {
  return new Promise(res => {
    let tries = 0;
    const ok = () => (i.complete && i.naturalWidth > 0);
    const go = () => { if (ok()) return res(); i.onload = () => res(); i.onerror = () => { if (++tries < 6) setTimeout(() => { i.src = src + '?r=' + tries; }, 50 * tries); else { console.log('img fail', src); res(); } }; };
    go(); if (!i.src) i.src = src;
  });
}
function img(src) { const i = new Image(); loads.push(whenLoaded(i, src)); i.src = src; return i; }


// ---------------------------------------------------------------- clips: real motion-library footage, original + Maboroshi recast
// a/clips/<id>_<o|v0|v2>/NNN.jpg at 30 fps (prep: see README). Frames load on demand; render() waits for them.
const CI = window.CLIPS.info, IDS = window.CLIPS.ids;
const K = (i, s = 'o') => `${IDS[i]}_${s}`;
const pad3 = n => String(n).padStart(3, '0');
const cache = new Map(), need = new Set();
let NOWT = 0;
function frame(key, sec) {
  const c = CI[key]; if (!c) return null;
  const idx = Math.floor((((sec * 30) % c.n) + c.n) % c.n), id = key + '/' + pad3(idx);
  const im = cache.get(id);
  if (im) { im._t = NOWT; return im; }
  need.add(id); return null;
}
async function fetchNeeded() {
  const ids = [...need]; need.clear();
  await Promise.all(ids.map(async id => {
    const im = new Image(); im.src = `a/clips/${id}.jpg`;
    try { await im.decode(); } catch (e) { try { im.src = `a/clips/${id}.jpg?r=1`; await im.decode(); } catch (e2) { console.log('frame fail', id); } }
    im._t = NOWT; cache.set(id, im);
  }));
  if (cache.size > 1600) for (const [k, v] of cache) if (Math.abs(v._t - NOWT) > 1.2) cache.delete(k);
}
const portrait = key => CI[key] && CI[key].w < CI[key].h;
// cover-fit a clip into rect r = [x, y, w, h]; o.z zoom, o.fx/o.fy view centre (0..1)
function drawClip(x, key, sec, r, o = {}) {
  const c = CI[key]; if (!c) return;
  const [rx, ry, rw, rh] = r, im = frame(key, sec);
  const s = Math.max(rw / c.w, rh / c.h) * (o.z || 1), dw = c.w * s, dh = c.h * s;
  let ox = rx + rw / 2 - (o.fx ?? .5) * dw, oy = ry + rh / 2 - (o.fy ?? .42) * dh;
  ox = clamp(ox, rx + rw - dw, rx); oy = clamp(oy, ry + rh - dh, ry);
  x.save(); x.beginPath(); x.rect(rx, ry, rw, rh); x.clip();
  if (im) x.drawImage(im, ox, oy, dw, dh); else { x.fillStyle = '#0b0c0e'; x.fillRect(rx, ry, rw, rh); }
  x.restore();
}
// rect r filled: cover when the shapes are close, else a blurred cover behind a contained clip (the social-video look)
function fitRect(key, r) {
  const c = CI[key], ar = c.w / c.h, [rx, ry, rw, rh] = r, rr = rw / rh;
  if (Math.max(ar / rr, rr / ar) < 1.62) return null;
  const w = (ar > rr ? rw : rh * ar) * 1.3, h = (ar > rr ? rw / ar : rh) * 1.3; // a little larger than contain, sides cropped
  return [rx + (rw - w) / 2, ry + (rh - h) / 2, w, h];
}
function drawFull(x, key, sec, r, o = {}) {
  const f = fitRect(key, r);
  if (!f) return drawClip(x, key, sec, r, o), r;
  const im = frame(key, sec);
  x.save(); x.beginPath(); x.rect(...r); x.clip();
  if (im) { x.filter = 'blur(28px) brightness(.55)'; drawClip(x, key, sec, r, { z: 1.15 }); x.filter = 'none'; }
  drawClip(x, key, sec, f, o);
  x.restore();
  return f;
}
// a -> b reveal behind a bright line, left to right (or top to bottom with o.dir = 'v')
function drawWipe(x, a, b, sec, r, p, seed, o = {}) {
  const full = o.full ? drawFull : drawClip;
  if (p <= 0) return full(x, a, sec, r, o);
  if (p >= 1) return full(x, b, sec, r, o);
  const [rx, ry, rw, rh] = r, v = o.dir === 'v', e = oq(p);
  full(x, a, sec, r, o);
  x.save(); x.beginPath();
  if (v) x.rect(rx, ry, rw, rh * e); else x.rect(rx, ry, rw * e, rh);
  x.clip(); full(x, b, sec, r, o); x.restore();
  const env = Math.sin(Math.PI * p);
  x.save(); x.beginPath(); x.rect(rx, ry, rw, rh); x.clip(); x.globalCompositeOperation = 'lighter';
  const L = v ? ry + rh * e : rx + rw * e, span = v ? rw : rh, G = 90;
  const g = v ? x.createLinearGradient(0, L - G, 0, L + G) : x.createLinearGradient(L - G, 0, L + G, 0);
  g.addColorStop(0, `rgba(${ACC_RGB},0)`); g.addColorStop(.5, `rgba(${ACC_RGB},${.6 * env})`); g.addColorStop(1, `rgba(${ACC_RGB},0)`);
  x.fillStyle = g;
  if (v) x.fillRect(rx, L - G, rw, G * 2); else x.fillRect(L - G, ry, G * 2, rh);
  x.fillStyle = `rgba(255,255,255,${.95 * env})`;
  if (v) x.fillRect(rx, L - 2, rw, 4); else x.fillRect(L - 2, ry, 4, rh);
  for (let i = 0; i < 34; i++) { // sparks thrown off the line
    const u = rnd(seed + i * 3.1), life = (p * 2.4 + rnd(seed + i)) % 1, sz = 2 + 6 * rnd(seed + i * 7), d = life * 120 * (1 + rnd(i + seed));
    x.fillStyle = `rgba(255,255,255,${(1 - life) * env})`;
    if (v) x.fillRect(rx + u * span, L - d, sz, sz); else x.fillRect(L - d, ry + u * span, sz, sz);
  }
  x.restore();
}
// label chip, drawn on the canvas
const TG = VERT ? 26 : 20;
function tag(x, s, px, py, acc, a = 1, align = 'left') {
  if (a <= 0) return;
  x.save(); x.globalAlpha = a; x.font = `${TG}px DMono`; x.letterSpacing = '4px';
  const w = x.measureText(s).width + TG * 2.2, h = TG * 2;
  const lx = align === 'right' ? px - w : align === 'center' ? px - w / 2 : px;
  x.fillStyle = acc ? ACC : 'rgba(8,9,11,.72)'; x.beginPath(); x.roundRect(lx, py, w, h, 6); x.fill();
  if (!acc) { x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = 1.5; x.stroke(); }
  x.fillStyle = acc ? '#10160e' : '#fff'; x.textBaseline = 'middle';
  x.beginPath(); x.arc(lx + TG * .85, py + h / 2, TG * .22, 0, Math.PI * 2); x.fill();
  x.fillText(s, lx + TG * 1.45, py + h / 2 + 1);
  x.restore();
}
const isO = k => k.endsWith('_o');
function seam(x, cx, cy, a = 1) { // the 幻 badge on the split line
  if (a <= 0) return;
  const r = VERT ? 54 : 50;
  x.save(); x.globalAlpha = a; x.shadowColor = `rgba(${ACC_RGB},.7)`; x.shadowBlur = 30;
  x.fillStyle = ACC; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); x.shadowBlur = 0;
  x.fillStyle = '#10160e'; x.font = `900 ${r * 1.15}px Kanji`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('幻', cx, cy + r * .06); x.restore();
}
function shade(x, a, from = 0) { // darken towards the bottom (from = 0) or all over (from = -1)
  if (a <= 0) return;
  if (from < 0) { x.fillStyle = `rgba(0,0,0,${a})`; x.fillRect(0, 0, W, H); return; }
  const g = x.createLinearGradient(0, H * .45, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- casting
const JP_INTRO = [33, 39, 43, 46, 38, 40, 42, 49].map(i => K(i));
const JP_QUAD = [32, 34, 35, 36, 37, 41, 44, 45, 48, 33, 43].map(i => K(i));
const CAT = [K(31), K(31, 'v0')];
const PAIRS = [[4], [7], [24], [30], [20], [19]].map(([i, a = 'o', z = 'v0']) => [K(i, a), K(i, z)]);
const DROP = [[22], [28], [8, 'v0', 'v2'], [29], [9, 'v0', 'v2'], [12], [5], [23], [16], [15], [21, 'v0', 'v2'], [22, 'v0', 'v2']].map(([i, a = 'o', z = 'v0']) => [K(i, a), K(i, z)]);
const QCUTS = [K(47), K(29, 'v0'), K(50), K(31, 'v0'), K(30, 'v0'), K(4, 'v0')];
const GRIDK = [4, 7, 30, 19, 13, 3, 29, 5, 15, 24, 20, 28].map(i => K(i, 'v0'));
const WALLK = [...[3, 4, 5, 7, 13, 15, 19, 29, 30].map(i => K(i, 'v0')), ...[32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 48, 49].map(i => K(i))];
const PAIR_B = i => 8 + 2 * i, DROP_B = j => 20 + .5 * j, QCUT_B = j => 26 + .25 * j;

const EVENTS = { slam: [], swap: [], cut: [], tick: [], pop: [], whoosh: [] };
window.EVENTS = EVENTS;
for (let k = 0; k < 8; k++) EVENTS.cut.push(bt(k * .5));
EVENTS.cut.push(bt(4)); EVENTS.swap.push(bt(4.25));
PAIRS.forEach((_, i) => { if (i) EVENTS.cut.push(bt(PAIR_B(i))); EVENTS.swap.push(bt(PAIR_B(i) + .7)); });
DROP.forEach((_, j) => EVENTS.swap.push(bt(DROP_B(j) + .06)));
QCUTS.forEach((_, j) => EVENTS.cut.push(bt(QCUT_B(j))));
for (let k = 1; k < 8; k++) EVENTS.cut.push(bt(40 + k));

// ---------------------------------------------------------------- layers
const world = mk('div', 'fill', 'transform-origin:50% 50%');
const sceneL = mk('div', 'fill', '', world);
const cvS = cv(W, H, sceneL), xS = cvS.getContext('2d');
const sceneVig = mk('div', 'fill', 'background:radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 50%, rgba(0,0,0,.5) 100%)', sceneL);
const small = ocv(W / 4, H / 4), xSm = small.getContext('2d');

// the library wall: columns of portrait clips drifting up and down
const WCOLS = VERT ? 5 : 10, WTW = W / WCOLS, WTH = WTW * 16 / 9, WROWS = Math.ceil(H / WTH) + 2;
function wallTile(c, r, t, drift) {
  const off = (c % 2 ? 1 : -1) * t * drift, y = ((r * WTH + off) % (WROWS * WTH) + WROWS * WTH) % (WROWS * WTH) - WTH;
  return { x: c * WTW, y, key: WALLK[(c * 7 + r * 3) % WALLK.length], sec: Math.floor((t + c * .37 + r * .61) * 10) / 10 };
}
function drawWall(x, t, drift = 24) {
  x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
  for (let c = 0; c < WCOLS; c++) for (let r = 0; r < WROWS; r++) {
    const w = wallTile(c, r, t, drift);
    if (w.y > H || w.y + WTH < 0) continue;
    drawClip(x, w.key, w.sec, [w.x + 3, w.y + 3, WTW - 6, WTH - 6], { fy: .4 });
  }
}
function wallBlur(x, t, dim) {
  xSm.setTransform(.25, 0, 0, .25, 0, 0); drawWall(xSm, t, 30); xSm.setTransform(1, 0, 0, 1, 0, 0);
  x.save(); x.filter = 'blur(10px)'; x.drawImage(small, -40, -40, W + 80, H + 80); x.filter = 'none'; x.restore();
  shade(x, dim, -1);
}

// ---------------------------------------------------------------- captions (chrome words that slam on the beat)
const capL = mk('div', 'fill', 'perspective:1400px');
const CAPS = [];
function cap(lines, o) {
  const fs = o.fs, el = mk('div', 'fill', '', capL), lh = fs * 1.04;
  const top0 = (o.y ?? H / 2) - lines.length * lh / 2;
  const words = [];
  lines.forEach((ln, li) => {
    const row = mk('div', 'ab nowrap', `width:${W}px;text-align:center;top:${top0 + li * lh}px;font-size:${fs}px;font-weight:700;line-height:1;letter-spacing:-.02em`, el);
    ln.forEach(([b0, w]) => {
      const s = mk('span', 'chrome', 'display:inline-block;margin:0 .12em;transform-origin:50% 60%;filter:drop-shadow(0 6px 22px rgba(0,0,0,.9))', row, w);
      shineInit(s); EVENTS.slam.push(bt(b0)); words.push({ b0, s, li });
    });
  });
  CAPS.push({ el, words, b0: Math.min(...words.map(w => w.b0)), out: o.out, split: o.split });
}
const FSC = VERT ? 132 : 176, FSL = VERT ? 92 : 112, YL = VERT ? H * .8 : H * .82;
cap(VERT ? [[[.5, "JEAN PHIL'S"]], [[1, 'MOVES.']]] : [[[.5, "JEAN PHIL'S"], [1, 'MOVES.']]], { fs: FSC, out: 2.4 });
cap([[[2.5, 'YOUR'], [3, 'FACE.']]], { fs: FSC * 1.25, out: 4.0 });
cap(VERT ? [[[5, 'ANYONE.']], [[5.5, 'ANYTHING.']]] : [[[5, 'ANYONE.'], [5.5, 'ANYTHING.']]], { fs: FSC, out: 5.97, y: VERT ? H * .78 : H * .8 });
cap([[[8.1, 'ANY CLIP.']]], { fs: FSL, out: 12.5, y: YL });
cap([[[12.5, 'ANY PERSON.']]], { fs: FSL, out: 17, y: YL });
cap([[[17, 'SAME MOVES.']]], { fs: FSL, out: 19.97, y: YL });
cap(VERT ? [[[28, 'YOUR']], [[28.5, 'SCENE.']], [[30, 'NEW']], [[30.5, 'YOU.']]] : [[[28, 'YOUR'], [28.5, 'SCENE.']], [[30, 'NEW'], [30.5, 'YOU.']]], { fs: VERT ? 170 : 230, out: 32.05, split: true });
cap(VERT ? [[[40, 'JEAN PHIL']], [[40.5, 'TEMPLATES.']]] : [[[40, 'JEAN PHIL'], [40.5, 'TEMPLATES.']]], { fs: VERT ? 118 : 132, out: 44 });
cap(VERT ? [[[44, 'NOW']], [[44.5, 'STARRING']], [[45, 'YOU.']]] : [[[44, 'NOW'], [44.5, 'STARRING'], [45, 'YOU.']]], { fs: VERT ? 140 : 150, out: 48 });
function capsUpdate(b) {
  for (const c of CAPS) {
    const on = b >= c.b0 - .05 && b < c.out + .02;
    vis(c.el, on); if (!on) continue;
    const outp = c.split ? 0 : P(b, c.out - .12, c.out);
    for (const w of c.words) {
      const p = P(b, w.b0, w.b0 + .3);
      op(w.s, P(b, w.b0 - .02, w.b0 + .04) * (1 - outp));
      let ex = '';
      if (c.split) { const sp = ic(P(b, c.out - .5, c.out)), d = w.li % 2 ? 1 : -1; ex = ` translateX(${d * sp * W * 1.3}px) skewX(${-d * sp * 20}deg)`; }
      tf(w.s, `translateY(${(1 - ox(p)) * -30}px) scale(${lerp(2.1, 1, ox(p))}) rotateX(${(1 - ox(p)) * 30}deg)${ex}`);
      shine(w.s, P(b, w.b0 + .35, w.b0 + 1.05));
    }
  }
}

// ======================================================================= title card (6-8)
const t1 = mk('div', 'fill', '', world);
const FSK = VERT ? 520 : 470;
const kanji = mk('div', 'ab kanji nowrap', `width:${W}px;text-align:center;top:${H / 2 - FSK * .62}px;font-size:${FSK}px;line-height:1;color:${ACC};text-shadow:0 0 60px rgba(${ACC_RGB},.45)`, t1, '幻');
const kName = mk('div', 'ab nowrap', `width:${W}px;text-align:center;top:${H / 2 + FSK * .44}px;font-size:${VERT ? 76 : 80}px;font-weight:700;letter-spacing:.32em;padding-left:.32em`, t1, 'MABOROSHI');
const kEb = mk('div', 'ab mono nowrap', `width:${W}px;text-align:center;top:${H / 2 - FSK * .62 - 70}px;font-size:${VERT ? 26 : 24}px;color:rgba(255,255,255,.7)`, t1, 'DEHUB CREATOR  ·  NEW');
EVENTS.slam.push(bt(6));
function t1Update(b) {
  const on = b >= 5.97 && b < 8.02;
  vis(t1, on); if (!on) return;
  const kp = P(b, 6, 6.45);
  op(kanji, P(b, 5.98, 6.04));
  tf(kanji, `scale(${lerp(1.9, 1, ox(kp)) * (1 + .5 * ic(P(b, 7.6, 8)))})`); kanji.style.transformOrigin = '50% 55%';
  const np = P(b, 6.5, 6.9);
  kName.style.clipPath = `inset(0 ${100 - 100 * oq(np)}% 0 0)`; op(kName, np > 0 ? 1 - P(b, 7.6, 7.9) : 0);
  op(kEb, P(b, 6.8, 7.1) * (1 - P(b, 7.6, 7.9)));
  op(t1, 1 - P(b, 7.85, 8.02));
}

// ======================================================================= counter + steps (32-40)
const sC = mk('div', 'fill', '', world);
const FSN = VERT ? 210 : 270;
const cntBox = mk('div', 'ab', `width:${W}px;top:${H * (VERT ? .36 : .34) - FSN / 2}px;text-align:center;transform-origin:50% 50%`, sC);
const cnt = mk('div', 'chrome nowrap', `display:inline-block;font-size:${FSN}px;font-weight:700;line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums;filter:drop-shadow(0 8px 30px rgba(0,0,0,.8))`, cntBox, '0');
shineInit(cnt);
const cntSub = mk('div', 'mono nowrap', `font-size:${VERT ? 30 : 30}px;margin-top:${VERT ? 22 : 26}px;color:${ACC};text-shadow:0 2px 12px rgba(0,0,0,.9)`, cntBox, 'clips to swap yourself into');
const STEPS = [['1', 'Pick a clip', 'Film'], ['2', 'Add your character', 'ScanFace'], ['3', 'Swap', 'Sparkles']];
const stepRow = mk('div', 'ab', VERT ? `left:${(W - 760) / 2}px;top:${H * .55}px;width:760px;display:flex;flex-direction:column;gap:22px` : `left:0;top:${H * .62}px;width:${W}px;display:flex;justify-content:center;gap:28px`, sC);
const STE = STEPS.map(([n, l, ic_], i) => {
  const e = mk('div', '', `display:flex;align-items:center;gap:18px;padding:${VERT ? '28px 32px' : '24px 32px'};border-radius:22px;background:rgba(14,16,20,.78);border:1.5px solid rgba(255,255,255,.16);backdrop-filter:blur(14px);font-size:${VERT ? 46 : 40}px;font-weight:700;white-space:nowrap;transform-origin:50% 50%`, stepRow);
  const c = mk('span', '', `display:grid;place-items:center;width:${VERT ? 64 : 58}px;height:${VERT ? 64 : 58}px;border-radius:50%;background:${ACC};color:#10160e;font-size:${VERT ? 32 : 28}px;flex-shrink:0`, e, n);
  mk('span', '', '', e, l);
  mk('span', '', `margin-left:auto;padding-left:14px;color:rgba(${ACC_RGB},.9)`, e, ico(ic_, VERT ? 40 : 34, 2));
  EVENTS.tick.push(bt(36 + i));
  return { e, c, b0: 36 + i };
});
EVENTS.whoosh.push(bt(32)); EVENTS.pop.push(bt(35));
function sCUpdate(b) {
  const on = b >= 32.2 && b < 40.05;
  vis(sC, on); if (!on) return;
  const cp = P(b, 32.4, 35);
  txt(cnt, Math.round(19537 * oq(cp)).toLocaleString('en-US'));
  const land = P(b, 35, 35.3);
  op(cntBox, P(b, 32.2, 32.5) * (1 - P(b, 39.8, 40.05)));
  tf(cntBox, `scale(${lerp(.7, 1, oc(P(b, 32.2, 32.8))) * (1 + .08 * (1 - oc(land)) * (b >= 35 ? 1 : 0))})`);
  shine(cnt, P(b, 35.1, 35.9));
  op(cntSub, P(b, 32.6, 32.9));
  STE.forEach(({ e, b0 }) => {
    const p = ob(P(b, b0, b0 + .3), 1.8);
    op(e, P(b, b0, b0 + .08) * (1 - P(b, 39.8, 40.05)));
    tf(e, `translateY(${(1 - p) * 50}px) scale(${.8 + .2 * p})`);
    e.style.borderColor = b >= b0 && b < b0 + .6 ? ACC : 'rgba(255,255,255,.16)';
  });
}

// ======================================================================= promises (48-52)
const sP = mk('div', 'fill', '', world);
const PROM = [['Your soundtrack stays yours', 'Volume2'], ['Review it before you pay', 'ScanFace'], ['Web + app, same project', 'Smartphone']];
const promBox = mk('div', 'ab', VERT ? `left:64px;top:${H * .34}px;width:${W - 128}px;display:flex;flex-direction:column;gap:30px` : `left:150px;top:${H * .26}px;display:flex;flex-direction:column;gap:34px`, sP);
const PRE = PROM.map(([l, ic_], i) => {
  const e = mk('div', '', `display:flex;align-items:center;gap:${VERT ? 26 : 30}px;font-size:${VERT ? 62 : 78}px;font-weight:700;letter-spacing:-.02em;white-space:nowrap;text-shadow:0 4px 24px rgba(0,0,0,.85)`, promBox);
  mk('span', '', `display:grid;place-items:center;flex-shrink:0;width:${VERT ? 84 : 96}px;height:${VERT ? 84 : 96}px;border-radius:50%;background:${ACC};color:#10160e;box-shadow:0 0 34px rgba(${ACC_RGB},.5)`, e, ico('Check', VERT ? 46 : 52, 3.2));
  mk('span', 'chrome', '', e, l);
  EVENTS.tick.push(bt(48.5 + i));
  return { e, b0: 48.5 + i };
});
PRE.forEach(p => shineInit(p.e.lastChild));
EVENTS.whoosh.push(bt(48));
function sPUpdate(b) {
  const on = b >= 48.3 && b < 52.05;
  vis(sP, on); if (!on) return;
  PRE.forEach(({ e, b0 }) => {
    const p = P(b, b0, b0 + .3);
    op(e, P(b, b0, b0 + .06) * (1 - P(b, 51.8, 52.02)));
    tf(e, `translateX(${(1 - oq(p)) * -80}px)`);
    shine(e.lastChild, P(b, b0 + .3, b0 + 1));
  });
}

// ======================================================================= brand slam (52-60)
const s6 = mk('div', 'fill', 'perspective:1400px', world);
const FS6 = VERT ? 420 : 400;
const k6 = mk('div', 'ab kanji nowrap', `width:${W}px;text-align:center;top:${H / 2 - FS6 * (VERT ? .95 : .82)}px;font-size:${FS6}px;line-height:1;color:${ACC};text-shadow:0 0 70px rgba(${ACC_RGB},.5);transform-origin:50% 60%`, s6, '幻');
const n6 = mk('div', 'ab nowrap chrome', `width:${W}px;text-align:center;top:${H / 2 + FS6 * (VERT ? .1 : .22)}px;font-size:${VERT ? 128 : 150}px;font-weight:700;line-height:1;letter-spacing:.06em;padding-left:.06em`, s6, 'MABOROSHI');
shineInit(n6);
const tag6 = mk('div', 'ab nowrap', `width:${W}px;text-align:center;top:${H / 2 + FS6 * (VERT ? .1 : .22) + (VERT ? 170 : 190)}px;font-size:${VERT ? 44 : 52}px;font-weight:700;letter-spacing:-.01em;text-shadow:0 2px 16px rgba(0,0,0,.8)`, s6, 'Your scene. A different you.');
const badge6 = mk('div', 'ab nowrap mono', `top:${H / 2 + FS6 * (VERT ? .1 : .22) + (VERT ? 270 : 290)}px;display:flex;align-items:center;gap:14px;padding:14px 26px;border-radius:999px;border:1.5px solid rgba(255,255,255,.35);background:rgba(0,0,0,.5);font-size:24px;color:rgba(255,255,255,.9)`, s6);
const b6dot = mk('span', '', `display:inline-block;width:12px;height:12px;border-radius:50%;background:${ACC};box-shadow:0 0 14px ${ACC}`, badge6);
mk('span', '', '', badge6, 'in DeHub Creator · web + app');
[52, 52.5, 53, 53.5].forEach(b => EVENTS.slam.push(bt(b)));
const ICON3D = {}; for (const n of ['sparkle', 'star', 'sparkles-duo']) ICON3D[n] = `a/icons/${n}.png`;
const SPARK = [['sparkle', -.3, -.34, 120], ['star', .32, -.32, 100], ['sparkles-duo', .3, .32, 120]].map(([n, x, y, s], i) => {
  const e = mk('img', 'ab', `width:${s}px;transform-origin:50% 50%;filter:drop-shadow(0 20px 30px rgba(0,0,0,.6))`, s6);
  loads.push(whenLoaded(e, ICON3D[n])); e.src = ICON3D[n];
  return { e, x, y, s, i };
});
function s6Update(b) {
  const on = b >= 51.95 && b < 60.15;
  vis(s6, on); if (!on) return;
  const t = bt(b), push = 1 + .05 * ioc(P(b, 54, 60));
  const kp = P(b, 52, 52.35);
  op(k6, P(b, 51.98, 52.04)); tf(k6, `scale(${lerp(2.2, 1, ox(kp)) * push}) rotateX(${(1 - ox(kp)) * -40}deg)`);
  const np = P(b, 52.5, 52.85);
  n6.style.clipPath = `inset(0 ${50 - 50 * oq(np)}% 0 ${50 - 50 * oq(np)}%)`; op(n6, np > 0 ? 1 : 0); tf(n6, `scale(${push})`); n6.style.transformOrigin = '50% 50%';
  shine(n6, P(b, 54.2, 55.2) || P(b, 57.6, 58.6));
  const tp = P(b, 53, 53.3);
  tag6.style.clipPath = `inset(0 ${100 - 100 * oq(tp)}% 0 0)`; op(tag6, tp > 0 ? 1 : 0); tf(tag6, `scale(${push})`); tag6.style.transformOrigin = '50% 50%';
  const bp = ob(P(b, 53.5, 53.8), 2);
  badge6.style.left = (W / 2 - badge6.offsetWidth / 2) + 'px';
  tf(badge6, `scale(${.6 + .4 * bp})`); op(badge6, P(b, 53.5, 53.6)); badge6.style.transformOrigin = '50% 50%';
  op(b6dot, .35 + .65 * (.5 + .5 * Math.cos(b * Math.PI)));
  SPARK.forEach(({ e, x, y, s, i }) => {
    const p = ob(P(b, 54.25 + i * .25, 54.65 + i * .25), 2);
    e.style.left = (W / 2 + x * (VERT ? W * 1.5 : W) - s / 2) + 'px';
    e.style.top = (H / 2 + y * (VERT ? H * .6 : H) - s / 2 + Math.sin(t * 1.6 + i) * 14) + 'px';
    tf(e, `rotate(${Math.sin(t * .8 + i * 2) * 18 + (1 - p) * 90}deg) scale(${p})`);
    op(e, P(b, 54.25 + i * .25, 54.35 + i * .25));
  });
  tf(s6, `scale(${1 + .4 * ic(P(b, 59.7, 60.15))})`);
}

// ======================================================================= the footage, one canvas
const punch = (b, b0, k = .08, d = 7) => b >= b0 ? 1 + k * Math.exp(-(b - b0) * d) : 1;
const FULL = [0, 0, W, H];
function pairShot(x, b, t, i) {
  const [a, z] = PAIRS[i], b0 = PAIR_B(i), sec = t - bt(b0) + .6, p = P(b, b0 + .7, b0 + 1.2), zz = punch(b, b0, .06);
  const split = VERT ? !portrait(a) : portrait(a);
  if (split) {
    const g = 6;
    const R1 = VERT ? [0, 0, W, H / 2 - g] : [0, 0, W / 2 - g, H], R2 = VERT ? [0, H / 2 + g, W, H / 2 - g] : [W / 2 + g, 0, W / 2 - g, H];
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    drawClip(x, a, sec, R1, { z: zz });
    drawWipe(x, a, z, sec, R2, p, i * 17, { z: zz, dir: VERT ? 'h' : 'v' });
    const m = VERT ? 28 : 30;
    tag(x, 'ORIGINAL', R1[0] + m, R1[1] + m, false, isO(a) ? 1 : 0);
    tag(x, isO(z) ? 'ORIGINAL' : 'MABOROSHI', R2[0] + m, R2[1] + m, true, p >= .5 ? 1 : 0);
    tag(x, 'ORIGINAL', R2[0] + m, R2[1] + m, false, p < .5 && isO(a) ? 1 : 0);
    seam(x, W / 2, H / 2, oc(P(b, b0 + .7, b0 + .9)));
  } else {
    drawWipe(x, a, z, sec, FULL, p, i * 17, { z: zz, full: true, dir: i % 2 ? 'v' : 'h' });
    const m = VERT ? 44 : 40;
    tag(x, 'ORIGINAL', m, m + (VERT ? 120 : 0), false, p < .5 && isO(a) ? 1 : 0);
    tag(x, 'MABOROSHI', m, m + (VERT ? 120 : 0), true, p >= .5 ? 1 : 0);
    // the original keeps playing in a corner once the swap lands
    const ip = ob(P(b, b0 + 1.2, b0 + 1.45), 1.6);
    if (ip > 0) {
      const c = CI[a], iw = (VERT ? W * .34 : W * .2) * (c.w > c.h ? 1.5 : 1), ih = iw * c.h / c.w;
      const ix = W - m - iw, iy = m + (VERT ? 120 : 0);
      x.save(); x.translate(ix + iw, iy); x.scale(ip, ip); x.translate(-(ix + iw), -iy);
      x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 30; x.fillStyle = '#000'; x.beginPath(); x.roundRect(ix - 4, iy - 4, iw + 8, ih + 8, 16); x.fill(); x.shadowBlur = 0;
      x.save(); x.beginPath(); x.roundRect(ix, iy, iw, ih, 12); x.clip(); drawClip(x, a, sec, [ix, iy, iw, ih]); x.restore();
      x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 2; x.beginPath(); x.roundRect(ix, iy, iw, ih, 12); x.stroke();
      x.restore();
      tag(x, 'ORIGINAL', ix + iw - 12, iy + ih + 12, false, isO(a) ? ip : 0, 'right');
    }
  }
}
function drawAll(b, t) {
  const x = xS;
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.filter = 'none'; x.globalCompositeOperation = 'source-over';
  x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
  if (b < 4) {
    // Jean Phil, cut on every half beat
    const k = Math.floor(b * 2);
    if (VERT) drawFull(x, JP_INTRO[k], t - bt(k * .5) + .8, FULL, { z: punch(b, k * .5, .1) });
    else for (let c = 0; c < 3; c++) {
      let kk = -1; for (let j = c; j <= k; j += 3) kk = j;
      if (kk < 0) continue;
      drawClip(x, JP_INTRO[kk], t - bt(kk * .5) + .8, [c * W / 3 + (c ? 4 : 0), 0, W / 3 - (c ? 4 : 0) - (c < 2 ? 4 : 0), H], { z: punch(b, kk * .5, .1) });
    }
    shade(x, .32, -1);
    tag(x, 'JEAN PHIL TEMPLATE', W / 2, H - (VERT ? 200 : 110), false, P(b, .2, .4), 'center');
  } else if (b < 6) {
    const p = P(b, 4.25, 4.9);
    drawWipe(x, CAT[0], CAT[1], t - bt(4) + .3, FULL, p, 4, { full: true, z: punch(b, 4.25, .07) });
    const m = VERT ? 44 : 40;
    tag(x, 'ORIGINAL', m, m + (VERT ? 120 : 0), false, p < .5 ? 1 : 0);
    tag(x, 'MABOROSHI', m, m + (VERT ? 120 : 0), true, p >= .5 ? 1 : 0);
    shade(x, .7 * P(b, 4.9, 5));
  } else if (b < 8) {
    wallBlur(x, t, .55);
  } else if (b < 20) {
    pairShot(x, b, t, Math.min(PAIRS.length - 1, Math.floor((b - 8) / 2)));
    shade(x, .75);
  } else if (b < 26) {
    const j = Math.min(DROP.length - 1, Math.floor((b - 20) * 2)), b0 = DROP_B(j), [a, z] = DROP[j];
    const p = P(b, b0 + .06, b0 + .36);
    drawWipe(x, a, z, t - bt(b0) + .8, FULL, p, j * 29, { full: true, dir: j % 2 ? 'v' : 'h', z: punch(b, b0, .1, 9) });
    const m = VERT ? 44 : 40;
    tag(x, 'ORIGINAL', m, m + (VERT ? 120 : 0), false, p < .5 && isO(a) ? 1 : 0);
    tag(x, 'MABOROSHI', m, m + (VERT ? 120 : 0), true, p >= .5 || !isO(a) ? 1 : 0);
  } else if (b < 27.5) {
    const j = Math.min(QCUTS.length - 1, Math.floor((b - 26) * 4));
    drawFull(x, QCUTS[j], t - bt(QCUT_B(j)) + 1, FULL, { z: punch(b, QCUT_B(j), .14, 12) * [1, 1.15, 1.05, 1.2, 1.1, 1][j] });
  } else if (b < 28) {
    const gc = VERT ? 3 : 6, gr = VERT ? 4 : 2, cw = W / gc, ch = H / gr;
    GRIDK.forEach((k, i) => {
      const c = i % gc, r = Math.floor(i / gc), b0 = 27.5 + i * .04;
      if (b < b0) return;
      const p = oc(P(b, b0, b0 + .18));
      x.save(); x.translate(c * cw + cw / 2, r * ch + ch / 2); x.scale(.6 + .4 * p, .6 + .4 * p); x.globalAlpha = p;
      drawClip(x, k, t - bt(27.5) + 1, [-cw / 2 + 3, -ch / 2 + 3, cw - 6, ch - 6]);
      x.restore();
    });
  } else if (b < 32.2) {
    drawWall(x, t, 40); shade(x, .62, -1);
  } else if (b < 40) {
    // pull back from one clip to the whole library
    const zp = ioc(P(b, 32.2, 34.6)), T = wallTile(4, 2, t, 0);
    const z0 = Math.max(W / WTW, H / WTH) * 1.02, s = lerp(z0, 1, zp);
    const fxp = lerp(T.x + WTW / 2, W / 2, zp), fyp = lerp(T.y + WTH / 2, H / 2, zp);
    x.setTransform(s, 0, 0, s, W / 2 - fxp * s, H / 2 - fyp * s);
    x.fillStyle = '#000'; x.fillRect(-W, -H, W * 3, H * 3);
    for (let c = 0; c < WCOLS; c++) for (let r = -1; r < WROWS; r++) {
      const w = wallTile(c, r, t, 0);
      const sx0 = (w.x - fxp) * s + W / 2, sy0 = (w.y - fyp) * s + H / 2;
      if (sx0 > W || sx0 + WTW * s < 0 || sy0 > H || sy0 + WTH * s < 0) continue;
      drawClip(x, w.key, zp < 1 ? t : w.sec, [w.x + 3, w.y + 3, WTW - 6, WTH - 6], { fy: .4 });
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
    shade(x, .62 * P(b, 32.4, 33.4), -1);
  } else if (b < 48) {
    // Jean Phil templates, four at a time, one changes every beat
    const n = VERT ? [2, 2] : [4, 1], cw = W / n[0], ch = H / n[1];
    for (let s = 0; s < 4; s++) {
      let k = s, b0 = 40; for (let bb = 41; bb <= Math.floor(b); bb++) if ((bb - 41) % 4 === s) { k = 4 + (bb - 41); b0 = bb; }
      const c = s % n[0], r = Math.floor(s / n[0]);
      drawClip(x, JP_QUAD[k], t - bt(b0) + .5 + s * .3, [c * cw + 3, r * ch + 3, cw - 6, ch - 6], { z: punch(b, b0, .12, 8) });
      if (b0 > 40 && b < b0 + .25) { x.fillStyle = `rgba(255,255,255,${.5 * (1 - P(b, b0, b0 + .25))})`; x.fillRect(c * cw, r * ch, cw, ch); }
    }
    shade(x, .38, -1);
  } else if (b < 52) {
    const k = b < 50 ? K(30, 'v0') : K(19, 'v0');
    drawFull(x, k, t - bt(b < 50 ? 48 : 50) + .5, FULL, { z: 1.05 + .02 * (b - 48) });
    shade(x, .6, -1);
    tag(x, 'MABOROSHI', VERT ? 44 : 40, VERT ? 164 : 40, true, 1);
  } else if (b < 60) {
    wallBlur(x, t, .6);
  }
}

const MARK = img('a/mark.png');
// ======================================================================= S7: end card (same ending as editor downloads)
const s7 = mk('div', 'fill', 'background:#000', world);
const cvEnd = cv(W, H, s7);
const endLine = mk('div', 'ab mono nowrap', `width:${W}px;text-align:center;font-size:${VERT ? 24 : 22}px;color:rgba(255,255,255,.55)`, s7, 'Maboroshi · in DeHub Creator');
function drawOutro(ctx, width, height, time, label) {
  const t = Math.max(0, Math.min(2.2, time));
  const phase = (start, length) => 1 - Math.pow(1 - Math.max(0, Math.min(1, (t - start) / length)), 3);
  const unit = Math.min(width, height);
  const icon = MARK;
  const logoWidth = unit * .155, logoHeight = logoWidth * 1184 / 908, gap = unit * .042;
  const progress = Math.max(0, Math.min(1, (t - .08) / .98));
  const spin = (1 - Math.cos(progress * Math.PI)) / 2, angle = (1 - spin) * Math.PI * 2, wave = Math.sin(progress * Math.PI);
  const textEase = phase(1.08, .32);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
  let size = Math.max(11, unit * .046);
  ctx.font = '500 ' + size + 'px Exo';
  while (ctx.measureText(label).width > unit * .86) { size *= .95; ctx.font = '500 ' + size + 'px Exo'; }
  const logoY = height / 2 - (gap + size) / 2 - unit * .03, textY = height / 2 + (logoHeight + gap) / 2 - unit * .03;
  ctx.save(); ctx.translate(width / 2, logoY); ctx.globalAlpha = phase(.04, .16);
  const scale = .86 + progress * .14 + wave * .045; ctx.scale(scale, scale);
  if (progress >= 1) ctx.drawImage(icon, -logoWidth / 2, -logoHeight / 2, logoWidth, logoHeight);
  else {
    ctx.rotate(Math.sin(angle) * wave * .13);
    const sw = icon.naturalWidth, sh = icon.naturalHeight, strips = 48;
    for (let i = 0; i < strips; i++) {
      const v = (i + .5) / strips - .5, proj = Math.cos(angle + v * wave * 1.15);
      const stw = logoWidth * Math.max(.055, Math.abs(proj)), sth = logoHeight / strips * (1 - wave * .07);
      const x = Math.sin(angle + v * 2) * logoWidth * wave * .12;
      ctx.save(); ctx.translate(x, v * logoHeight * (1 - wave * .07)); ctx.scale(proj < 0 ? -1 : 1, 1);
      ctx.drawImage(icon, 0, i * sh / strips, sw, sh / strips, -stw / 2, -sth / 2, stw, sth + unit * .0015);
      ctx.restore();
    }
  }
  ctx.restore();
  ctx.globalAlpha = textEase; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.beginPath(); ctx.rect((width - unit * .95) / 2, textY - size * .8, unit * .95, size * 1.6); ctx.clip();
  ctx.fillText(label, width / 2, textY + (1 - textEase) * size * .9);
  ctx.restore();
  return textY + size;
}
function s7Update(b) {
  const on = b >= 60;
  vis(s7, on); if (!on) return;
  const ty = drawOutro(cvEnd.getContext('2d'), W, H, bt(b) - bt(60), 'dehub.io');
  endLine.style.top = (ty + Math.min(W, H) * .03) + 'px';
  const p = P(b, 63.2, 64);
  op(endLine, 0); void p; // end card is just the logo + dehub.io
  tf(endLine, `translateY(${(1 - oc(p)) * 12}px)`);
}
// ======================================================================= global fx
// [beat, rgbPx, tear(0..1), flash(0..1), shake(px), decayBeats]
const FXE = [
  [2.5, 10, .2, 0, 12, .4], [3, 14, .3, 0, 14, .4],
  [4, 14, .3, .3, 10, .4], [4.25, 22, .7, .6, 16, .5], [5, 8, 0, 0, 10, .3], [5.5, 10, .2, 0, 12, .4],
  [6, 22, .7, .5, 18, .55], [8, 22, .9, .7, 16, .55],
  [20, 26, 1, .8, 18, .6], [26, 18, .5, .4, 14, .25], [27.5, 22, .6, .4, 12, .45],
  [28, 26, 1, .45, 18, .6], [28.5, 8, 0, 0, 10, .35], [30, 8, 0, 0, 12, .35], [30.5, 10, .2, 0, 14, .4], [32, 14, .6, 0, 8, .4],
  [35, 10, .2, .1, 8, .4], [40, 18, .7, .2, 10, .5], [40.5, 8, 0, 0, 8, .3], [44, 12, .3, .1, 10, .4], [44.5, 8, 0, 0, 8, .3], [45, 12, .3, .1, 12, .4],
  [48, 12, .3, .1, 8, .4],
  [52, 16, .3, .15, 22, .5], [52.5, 10, 0, 0, 14, .4], [53, 10, 0, 0, 14, .4], [53.5, 12, .2, 0, 16, .45],
  [60, 28, 1, .5, 14, .6],
];
for (let k = 1; k < 8; k++) FXE.push([k * .5, 6, k % 2 ? 0 : .2, 0, 6, .3]);
PAIRS.forEach((_, i) => { FXE.push([PAIR_B(i) + .7, 14, .4, .25, 8, .4]); if (i) FXE.push([PAIR_B(i), 6, 0, 0, 6, .25]); });
DROP.forEach((_, j) => { if (j) FXE.push([DROP_B(j), 14, .4, .3, 12, .4]); });
QCUTS.forEach((_, j) => { if (j) FXE.push([QCUT_B(j), 16, .5, .3, 12, .22]); });
for (let k = 41; k < 48; k++) if (k !== 44 && k !== 45) FXE.push([k, 6, 0, 0, 5, .3]);
[36, 37, 38, 48.5, 49.5, 50.5].forEach(b => FXE.push([b, 5, 0, 0, 5, .3]));
// motion-blur windows [b0, b1, subframes, shutter(frames)]
const MB = [[5.8, 6.4, 5, 1], [7.7, 8.3, 6, 1], [27.4, 28.6, 5, 1], [31.4, 32.4, 6, 1], [32.2, 34.8, 5, 1], [39.7, 40.3, 5, 1], [51.6, 54.1, 5, 1], [59.6, 60.3, 6, 1]];
function fxAt(t) {
  const b = t / B;
  let rgb = 0, tear = 0, flash = 0, shake = 0, tearSeed = 0;
  for (const [eb, r, te, fl, sh, d] of FXE) {
    if (b < eb || b > eb + d) continue;
    const k = (1 - (b - eb) / d) ** 2;
    rgb = Math.max(rgb, r * k); shake = Math.max(shake, sh * k); flash = Math.max(flash, fl * k ** 1.5);
    if (te * k > tear) { tear = te * k; tearSeed = Math.round(eb * 100) + Math.floor((b - eb) / d * 6); }
  }
  let mb = 1, sh = 0;
  for (const [a, z, n, s] of MB) if (b >= a && b < z) { mb = n; sh = s; }
  return { rgb, tear, tearSeed, flash, shake, mb, sh };
}
window.fxAt = fxAt;
const flashL = mk('div', 'fill', 'background:#fff;opacity:0;pointer-events:none');

// ======================================================================= render
async function render(t) {
  const b = t / B;
  NOWT = t;
  drawAll(b, t);
  for (let k = 0; k < 6 && need.size; k++) { await fetchNeeded(); drawAll(b, t); }
  const fx = fxAt(t);
  const f = Math.floor(t * 60);
  const sx = fx.shake * (rnd(f * 1.37) - .5) * 2, sy = fx.shake * (rnd(f * 2.71 + 9) - .5) * 2;
  tf(world, `translate(${sx.toFixed(2)}px,${sy.toFixed(2)}px)`);
  tf(capL, `translate(${sx.toFixed(2)}px,${sy.toFixed(2)}px)`);
  op(flashL, fx.flash);
  vis(sceneL, b < 60);
  t1Update(b);
  capsUpdate(b);
  sCUpdate(b);
  sPUpdate(b);
  s6Update(b);
  s7Update(b);
}
window.render = render;
window.FILM = { W, H, TOTAL, BPM, fps: 60 };
window.ready = (async () => {
  await document.fonts.load('500 40px Exo'); await document.fonts.load('700 40px Exo'); await document.fonts.load('20px DMono'); await document.fonts.load('900 40px Kanji', '幻');
  await Promise.all(loads);
  await document.fonts.ready;
  await render(0);
  return true;
})();
