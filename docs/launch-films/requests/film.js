'use strict';
// DeHub Requests ad (15 s). Same engine and look as the editor launch film: render(t) sets the whole frame from time alone.
// 140 BPM grid; all scene times below are in beats.
const Q = new URLSearchParams(location.search);
const W = +(Q.get('w') || 1920), H = +(Q.get('h') || 1080), VERT = H > W;
const BPM = 140, B = 60 / BPM, bt = b => b * B;
// 18 s cut: the scenes are authored on the original 35-beat timeline; WARP stretches the prompt flow
// (typing x1.5, the Requests page x1.42) and leaves the rest on the beat. [new beat, scene beat]
const WARP = [[0, 0], [6, 4], [23, 16], [42, 35]];
const warp = (x, i, o) => { for (let k = 0; k < WARP.length - 1; k++) { const a = WARP[k], c = WARP[k + 1]; if (x <= c[i] || k === WARP.length - 2) return a[o] + (c[o] - a[o]) * (x - a[i]) / (c[i] - a[i]); } };
const sceneB = nb => warp(nb, 0, 1), filmB = sb => warp(sb, 1, 0);
const END_B = 42, TOTAL = bt(END_B);
const stage = document.getElementById('stage');
stage.style.width = W + 'px'; stage.style.height = H + 'px';

// ---------------------------------------------------------------- math
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const oc = t => 1 - (1 - t) ** 3, oq = t => 1 - (1 - t) ** 4, ox = t => t >= 1 ? 1 : 1 - 2 ** (-10 * t);
const ic = t => t * t * t, ioc = t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const iox = t => t <= 0 ? 0 : t >= 1 ? 1 : t < .5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2;
const ob = (t, s = 1.70158) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
const P = (b, a, z) => clamp((b - a) / (z - a));
const rnd = s => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const fmtK = v => v < 1000 ? String(Math.round(v)) : (v / 1000).toFixed(1) + 'K';
const zw = (a, v) => VERT ? v : a; // per-orientation values

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
function shineInit(e) { } // plain white type (no chrome)
function shine(e, p) { }

// The app's own icons: the "cut" set (32-unit grid, src/components/ui/cut-icons) and a few lucide ones.
const CUT = {
  like: f => `<path d="M10 27V15L15 5H16Q19 5 19 8V13H26V20Q26 27 19 27Z" fill="${f ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M3.8 15H5Q6.2 15 6.2 16.4V27H5Q3.8 27 3.8 25.6Z" fill="currentColor"/>`,
  dislike: () => `<g transform="rotate(180 16 16)">${CUT.like(false)}</g>`,
  chat: () => `<path d="M12 4H22Q28 4 28 10V19L23 16H20 M4 10H14Q20 10 20 16V28L14 24H10Q4 24 4 18Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M8 14H14Q16 14 16 16H10Q8 16 8 14Z M8 19H12Q14 19 14 21H10Q8 21 8 19Z" fill="currentColor"/>`,
  add: () => `<path d="M6.392 17.2L27 17.2L27 16.192Q27 14.8 25.608 14.8L5 14.8L5 15.808Q5 17.2 6.392 17.2Z" fill="currentColor"/><path d="M14.8 6.392L14.8 27L15.808 27Q17.2 27 17.2 25.608L17.2 5L16.192 5Q14.8 5 14.8 6.392Z" fill="currentColor"/>`,
  search: () => `<path d="M23 13.5A9.5 9.5 0 1 1 4 13.5A9.5 9.5 0 1 1 23 13.5Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M20.636 22.333L27.152 28.849L27.864 28.136Q28.849 27.152 27.864 26.167L21.349 19.652L20.636 20.364Q19.652 21.349 20.636 22.333Z" fill="currentColor"/>`,
  close: () => `<path d="M7.136 8.833L24.152 25.849L24.864 25.136Q25.849 24.152 24.864 23.167L7.849 6.152L7.136 6.864Q6.152 7.849 7.136 8.833Z" fill="currentColor"/><path d="M23.167 7.136L6.152 24.152L6.864 24.864Q7.849 25.849 8.833 24.864L25.849 7.849L25.136 7.136Q24.152 6.152 23.167 7.136Z" fill="currentColor"/>`,
  share: () => `<path d="M9.4 14.4L21.1 7.6M9.4 17.6L20 23.7" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M3.25 12.75H6.5Q9.75 12.75 9.75 16V19.25H6.5Q3.25 19.25 3.25 16Z M20.75 2.75H24Q27.25 2.75 27.25 6V9.25H24Q20.75 9.25 20.75 6Z M20.75 22.75H24Q27.25 22.75 27.25 26V29.25H24Q20.75 29.25 20.75 26Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>`,
};
const cut = (n, size, arg) => `<svg class="i" width="${size}" height="${size}" viewBox="0 0 32 32" style="color:currentColor">${CUT[n](arg)}</svg>`;
const LUC = {
  loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  check: '<path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/>',
  image: '<path d="M16 5h6"/><path d="M19 2v6"/><path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/><circle cx="9" cy="9" r="2"/>',
  arrowUR: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
};
const luc = (n, size, sw = 2, style = '') => `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="${style}">${LUC[n]}</svg>`;

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
const EMO_META = { thumb: 24, fire: 33, heart: 56, rocket: 20, party: 42, blown: 83, hundred: 45 };
const EMO = {};
for (const [n, c] of Object.entries(EMO_META)) EMO[n] = Array.from({ length: c }, (_, i) => img(`a/emoji/${n}_${String(i).padStart(3, '0')}.png`));
const emoFrame = (n, sec) => { const c = EMO_META[n], ms = c * 33.3; const f = Math.floor(((Math.max(0, sec) * 1000) % ms) / ms * c); return EMO[n][clamp(f, 0, c - 1)]; };
const MARK = img('a/mark.png');
const ICON3D = {}; for (const n of ['sparkle', 'star', 'sparkles-duo', 'rocket', 'thumbs-up', 'megaphone']) ICON3D[n] = `a/icons/${n}.png`;

const EVENTS = { type: [], click: [], pop: [], slam: [], tick: [], status: [], tab: [], float: [] };
window.EVENTS = EVENTS;

// ---------------------------------------------------------------- layers
const world = mk('div', 'fill', 'transform-origin:50% 50%');
const bgL = mk('div', 'fill', 'overflow:hidden', world);
const BG = {};
for (const k of ['12', '01', '13', '20', '25', '30', '40']) {
  const big = Math.max(W, H * 16 / 9) * 1.25;
  const i = mk('img', 'ac', `width:${big}px;height:${big * 9 / 16}px;left:${(W - big) / 2}px;top:${(H - big * 9 / 16) / 2}px;opacity:0;visibility:hidden`, bgL);
  loads.push(whenLoaded(i, `a/bg/bg-${k}.jpg`)); i.src = `a/bg/bg-${k}.jpg`;
  BG[k] = i;
}
const spot = mk('div', 'fill', `background:radial-gradient(ellipse ${VERT ? '90% 45%' : '60% 60%'} at 50% 40%, rgba(255,255,255,.13), rgba(255,255,255,0) 70%)`, bgL);
mk('div', 'fill', 'background:radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 30%, rgba(0,0,0,.75) 100%)', bgL);
function bgSet(map) {
  for (const k in BG) {
    const v = map[k];
    if (!v) { op(BG[k], 0); continue; }
    const [o, s = 1.1, r = 0] = v;
    op(BG[k], o);
    tf(BG[k], `rotate(${r}deg) scale(${s})`);
  }
}
const cursorSvg = (sz) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24"><path d="M4.5 2.8 L19.6 13.1 L12.4 13.9 L16.4 21.2 L13.5 22.6 L9.6 15.3 L4.5 20.2 Z" fill="#fff" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/></svg>`;

// ======================================================================= S1: the prompt (the page's own composer, big)
const PROMPT = 'add live polls to streams';
const s1 = mk('div', 'fill', '', world);
const s1cam = mk('div', 'fill', 'transform-origin:50% 50%', s1);
const LINES = VERT ? ['add live polls to', 'streams'] : [PROMPT];
const FS1 = VERT ? 66 : 72, LH1 = Math.round(FS1 * 1.3);
const BOXW = VERT ? W - 90 : 1380, PAD = VERT ? 36 : 40, BAR = VERT ? 108 : 104;
const head1 = mk('div', 'ab nowrap chrome', `width:${W}px;text-align:center;font-size:${VERT ? 76 : 84}px;font-weight:700;line-height:1.05;letter-spacing:-.02em`, s1cam, VERT ? 'What should we<br>build next?' : 'What should we build next?');
shineInit(head1);
const hint1 = mk('div', 'ab nowrap', `width:${W}px;text-align:center;font-size:${VERT ? 30 : 28}px;color:rgba(255,255,255,.55)`, s1cam, 'Describe it. Drop in a screenshot. Make it happen.');
const box = mk('div', 'ab', `width:${BOXW}px;border-radius:${VERT ? 34 : 30}px;border:2px solid rgba(255,255,255,.22);background:linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.03));box-shadow:0 30px 80px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.12);overflow:hidden;transform-origin:50% 50%`, s1cam);
const boxText = mk('div', 'ab', `left:${PAD}px;top:${PAD}px;width:${BOXW - PAD * 2}px;font-size:${FS1}px;line-height:${LH1}px;letter-spacing:-.01em`, box);
const placeholder = mk('div', 'ab nowrap', 'left:0;top:0;color:rgba(255,255,255,.35)', boxText, 'Describe an idea, improvement, or bug…');
const CH = [];
{
  let gi = 0;
  const N = PROMPT.length;
  LINES.forEach((ln, li) => {
    const row = mk('div', 'nowrap', `position:relative;height:${LH1}px`, boxText);
    [...ln].forEach(c => {
      const s = mk('span', '', 'display:inline-block;white-space:pre;opacity:0', row, c === ' ' ? ' ' : c);
      const tb = 0.45 + 2.3 * gi / (N - 1) + (rnd(gi * 1.7) - .5) * .05;
      CH.push({ s, b: tb, li });
      if (c !== ' ') EVENTS.type.push(bt(tb));
      gi++;
    });
    if (li < LINES.length - 1) gi++;
  });
}
const caret = mk('div', 'ab', `width:4px;height:${Math.round(FS1 * 1.05)}px;background:#fff;border-radius:2px;box-shadow:0 0 18px rgba(255,255,255,.7)`, boxText);
const bar1 = mk('div', 'ab', `left:0;width:${BOXW}px;height:${BAR}px;border-top:1.5px solid rgba(255,255,255,.12)`, box);
const attach1 = mk('div', 'ab nowrap', `left:${PAD - 6}px;top:${(BAR - 40) / 2}px;display:flex;align-items:center;gap:12px;font-size:${VERT ? 30 : 28}px;color:rgba(255,255,255,.85)`, bar1, luc('image', VERT ? 34 : 32, 2) + 'Attach images');
const postBtn = mk('div', 'ab nowrap glass', `top:${(BAR - (VERT ? 72 : 68)) / 2}px;height:${VERT ? 72 : 68}px;padding:0 ${VERT ? 30 : 30}px;border-radius:${VERT ? 22 : 20}px;display:flex;align-items:center;gap:12px;font-size:${VERT ? 32 : 30}px;font-weight:700;transform-origin:50% 50%`, bar1);
const postIco = mk('span', '', 'display:inline-flex', postBtn, cut('add', VERT ? 32 : 30));
mk('span', '', '', postBtn, 'Post prompt');
const ripple = mk('div', 'ab', `border-radius:${VERT ? 24 : 22}px;border:3px solid #fff;transform-origin:50% 50%;opacity:0`, s1cam);
const foot1 = mk('div', 'ab nowrap', `width:${BOXW}px;display:flex;justify-content:space-between;font-size:${VERT ? 24 : 22}px;color:rgba(255,255,255,.4);font-variant-numeric:tabular-nums`, s1cam);
const count1 = mk('span', '', '', foot1, '0/1000');
mk('span', '', '', foot1, 'Ctrl / ⌘ + Enter to post');
const eyebrow = mk('div', 'ab mono', `font-size:${VERT ? 26 : 22}px;color:rgba(255,255,255,.75);white-space:nowrap;display:flex;align-items:center;gap:14px`, s1cam);
const ebDot = mk('span', '', 'display:inline-block;width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 0 12px #fff', eyebrow);
const ebTxt = mk('span', '', '', eyebrow);
const EB = 'DEHUB  ·  REQUESTS';
const cur1 = mk('div', 'ab', 'transform-origin:4px 3px;filter:drop-shadow(0 6px 10px rgba(0,0,0,.5))', s1cam, cursorSvg(VERT ? 70 : 60));
EVENTS.click.push(bt(3.5));

function s1Update(b) {
  vis(s1, b < 4.02);
  if (b >= 4.02) return;
  let hl = 1;
  for (let li = 1; li < LINES.length; li++) { const first = CH.find(c => c.li === li); hl += oc(P(b, first.b - .05, first.b + .2)); }
  const bh = PAD * 2 + hl * LH1 + BAR;
  const headH = VERT ? 160 : 88, gapH = VERT ? 150 : 128;
  const total = headH + gapH + bh;
  const top = (H - total) / 2 + (VERT ? -30 : 10);
  const bx = (W - BOXW) / 2, by = top + headH + gapH;
  box.style.left = bx + 'px'; box.style.top = by + 'px'; box.style.height = bh + 'px';
  bar1.style.top = (bh - BAR) + 'px';
  const pin = oc(P(b, 0, .5));
  tf(box, `translateY(${(1 - pin) * 30}px) scale(${.94 + .06 * pin})`);
  op(box, P(b, 0, .3));
  head1.style.top = top + 'px';
  head1.style.clipPath = `inset(-10% ${100 - 100 * oq(P(b, .05, .6))}% -10% 0)`;
  shine(head1, P(b, 2.4, 3.3));
  hint1.style.top = (top + headH + (VERT ? 30 : 22)) + 'px';
  op(hint1, P(b, .3, .6));
  // chars
  let last = null, n = 0;
  for (const c of CH) {
    const p = P(b, c.b, c.b + .12);
    if (b >= c.b) { last = c; n++; }
    op(c.s, p > 0 ? 1 : 0);
    tf(c.s, `translateY(${(1 - oc(p)) * 14}px) scale(${.7 + .3 * ob(p, 2.2)})`);
  }
  txt(count1, `${n}/1000`);
  op(placeholder, b < CH[0].b ? .9 : 0);
  let cx = 0, cy = 0;
  if (last) { cx = last.s.offsetLeft + last.s.offsetWidth + 3; cy = last.s.parentNode.offsetTop; }
  caret.style.left = cx + 'px'; caret.style.top = (cy + (LH1 - FS1 * 1.05) / 2) + 'px';
  const typing = b > CH[0].b - .2 && b < CH[CH.length - 1].b + .3;
  op(caret, (typing || Math.floor(b * 2) % 2 === 0) ? (b < 3.4 ? 1 : 0) : 0);
  // post button
  const pw = postBtn.offsetWidth, ph = postBtn.offsetHeight;
  const sx = BOXW - pw - (VERT ? 26 : 26), sy = bh - BAR + (BAR - ph) / 2;
  postBtn.style.left = sx + 'px';
  const press = P(b, 3.42, 3.5) - P(b, 3.55, 3.75);
  op(postBtn, b < CH[0].b ? .4 : 1);
  tf(postBtn, `scale(${1 - .1 * press})`);
  const busy = b >= 3.5;
  if (postIco._b !== busy) { postIco._b = busy; postIco.innerHTML = busy ? luc('loader', VERT ? 32 : 30, 2.4) : cut('add', VERT ? 32 : 30); postIco.firstChild._tf = null; }
  if (b >= 3.5) tf(postIco.firstChild, `rotate(${bt(b) * 720}deg)`);
  foot1.style.left = bx + 'px'; foot1.style.top = (by + bh + (VERT ? 22 : 18)) + 'px';
  op(foot1, P(b, .4, .7));
  const rp = P(b, 3.5, 4.0);
  ripple.style.left = (bx + sx) + 'px'; ripple.style.top = (by + sy) + 'px'; ripple.style.width = pw + 'px'; ripple.style.height = ph + 'px';
  tf(ripple, `scale(${1 + .9 * oc(rp)})`);
  op(ripple, rp > 0 ? (1 - rp) * .9 : 0);
  // eyebrow scramble
  const GL = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#+*/';
  let s = '';
  for (let i = 0; i < EB.length; i++) {
    const settle = .1 + i * .035;
    if (b < settle - .4) s += ' ';
    else if (b < settle) s += EB[i] === ' ' ? ' ' : GL[Math.floor(rnd(i * 7.3 + Math.floor(b * 24)) * GL.length)];
    else s += EB[i];
  }
  txt(ebTxt, s);
  eyebrow.style.left = (W / 2 - eyebrow.offsetWidth / 2) + 'px';
  eyebrow.style.top = (top - (VERT ? 80 : 66)) + 'px';
  op(eyebrow, P(b, 0, .2));
  op(ebDot, .45 + .55 * (0.5 + 0.5 * Math.cos(b * Math.PI)));
  // cursor flies to Post prompt
  const cp = ioc(P(b, 2.55, 3.4));
  const tx = bx + sx + pw * .5, ty = by + sy + ph * .55;
  const fx0 = W * (VERT ? .86 : .84), fy0 = H * 1.04;
  cur1.style.left = lerp(fx0, tx, cp) + 'px'; cur1.style.top = (lerp(fy0, ty, cp) + Math.sin(cp * Math.PI) * -60) + 'px';
  tf(cur1, `scale(${1 - .14 * press})`);
  op(cur1, P(b, 2.55, 2.7));
  // camera: slow push, then a pull into the box on the click
  const cam = 1 + .04 * ioc(P(b, 0, 3.4)) + .12 * ic(P(b, 3.45, 4));
  const k = ic(P(b, 3.45, 4)) * .4;
  s1cam.style.transformOrigin = `${W / 2 + (bx + BOXW / 2 - W / 2) * k}px ${H / 2 + (by + bh / 2 - H / 2) * k}px`;
  tf(s1cam, `scale(${cam})`);
}

// ======================================================================= S2: the Requests page replica
const ST_STYLE = {
  under_review: ['Under Review', 'rgba(251,191,36,.15)', 'rgba(252,211,77,.9)', 'rgba(252,211,77,.25)'],
  planned: ['Planned', 'rgba(96,165,250,.15)', 'rgba(147,197,253,.9)', 'rgba(147,197,253,.25)'],
  in_progress: ['In Progress', 'rgba(167,139,250,.15)', 'rgba(196,181,253,.9)', 'rgba(196,181,253,.25)'],
  shipped: ['Shipped', 'rgba(255,255,255,.92)', '#000', 'rgba(255,255,255,.9)'],
};
function setStatus(e, st) {
  if (e._st === st) return; e._st = st;
  if (!st) { e.style.display = 'none'; return; }
  const [l, bg, c, bd] = ST_STYLE[st];
  e.style.display = ''; e.textContent = l; e.style.background = bg; e.style.color = c; e.style.borderColor = bd;
  e.style.fontWeight = st === 'shipped' ? '700' : '500';
}
const PW = 640, PH = 1400;
const s2 = mk('div', 'fill', `perspective:${VERT ? 2400 : 2200}px;perspective-origin:50% 50%`, world);
const rig = mk('div', 'ab', `width:${PW}px;height:${PH}px;transform-style:preserve-3d`, s2);
const pgShadow = mk('div', 'ab', `width:${PW}px;height:${PH}px;border-radius:22px;box-shadow:0 0 0 1px rgba(255,255,255,.16), 0 50px 140px rgba(0,0,0,.85)`, rig);
const pg = mk('div', 'ab pgx', `width:${PW}px;height:${PH}px;border-radius:22px;overflow:hidden;background:#000;padding:10px`, rig);
const R = {};
{
  // sticky header bento
  const hdr = mk('div', 'bento', '', pg);
  mk('div', 'row', 'justify-content:space-between;margin-bottom:16px', hdr,
    `<div class="row" style="gap:12px"><img src="a/bulb.png" style="width:48px;height:48px;filter:invert(1) brightness(1.1)"><div><div style="font-size:20px;font-weight:700;line-height:1.3">Requests</div><div style="font-size:14px;color:#71717a">Build DeHub with a prompt</div></div></div>` +
    `<div class="gbtn glass">${cut('add', 16)}New prompt</div>`);
  mk('div', 'row', 'height:40px;border-radius:12px;background:#27272a;border:1px solid #3f3f46;padding:0 12px;gap:12px;color:#71717a;margin-bottom:12px', hdr, cut('search', 16) + 'Search prompts…');
  const tabs = mk('div', 'row', 'position:relative;gap:4px;background:rgba(39,39,42,.4);border-radius:12px;padding:4px;margin-bottom:12px', hdr);
  R.tabInd = mk('div', 'glass', 'position:absolute;top:4px;bottom:4px;left:4px;width:calc(33.333% - 4px);border-radius:8px', tabs);
  R.tabs = [['Prompts', ''], ['Queued', luc('loader', 14)], ['Shipped', luc('check', 14)]].map(([l, ic]) => {
    const t = mk('div', 'tab', '', tabs, ic);
    mk('span', '', '', t, l);
    return { t, n: mk('span', 'cnt', '', t, '0') };
  });
  mk('div', 'row', 'height:32px;padding:0 12px;font-size:14px;color:#e4e4e7;margin-bottom:8px', hdr, 'Filter by category');
  const sorts = mk('div', 'row', 'gap:6px;position:relative', hdr);
  mk('div', '', 'padding:6px 12px;font-size:14px;color:#71717a', sorts, 'Most voted');
  mk('div', 'glass', 'padding:6px 12px;font-size:14px;border-radius:8px', sorts, 'Newest');
  // composer bento
  R.compWrap = mk('div', '', 'overflow:hidden', pg);
  const comp = mk('div', 'bento', '', R.compWrap);
  mk('div', '', 'font-size:18px;font-weight:600;font-weight:700;margin-bottom:4px', comp, 'What should we build next?');
  mk('div', '', 'font-size:12px;color:#a1a1aa;margin-bottom:12px', comp, 'Describe it. Drop in a screenshot. Make it happen.');
  R.compBox = mk('div', '', 'border-radius:12px;border:1px solid rgba(255,255,255,.4);background:rgba(0,0,0,.1);padding:12px', comp);
  R.compText = mk('div', '', 'min-height:96px;font-size:14px;line-height:1.6;color:#fff', R.compBox, PROMPT);
  const cbar = mk('div', 'row', 'gap:8px;border-top:1px solid rgba(255,255,255,.1);padding-top:12px;margin-top:8px', R.compBox);
  mk('div', 'row', 'gap:8px;font-size:14px;padding:0 8px;height:32px', cbar, luc('image', 16) + 'Attach images');
  mk('div', '', 'font-size:11px;color:#71717a', cbar, 'Paste or drop images here');
  R.compPost = mk('div', 'gbtn glass', 'margin-left:auto;height:40px', cbar);
  R.compPostIco = mk('span', '', 'display:inline-flex', R.compPost, luc('loader', 16));
  mk('span', '', '', R.compPost, 'Post prompt');
  const cfoot = mk('div', 'row', 'justify-content:space-between;margin-top:8px;font-size:11px;color:#71717a', comp);
  R.compCount = mk('span', '', '', cfoot, '25/1000');
  mk('span', '', '', cfoot, 'Ctrl / ⌘ + Enter to post');
  // request cards
  const list = mk('div', '', 'display:flex;flex-direction:column', pg);
  const card = (d, parent) => {
    const c = mk('div', 'card', '', parent);
    const avatar = d.you ? `<div class="av" style="background:#111;border:1px solid rgba(255,255,255,.25)"><img src="a/mark.png" style="width:16px"></div>` : `<div class="av" style="background:${d.col}">${d.name[0].toUpperCase()}</div>`;
    mk('div', 'row', 'gap:10px', c, avatar + `<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:14px">${d.name}</div><div style="font-size:12px;color:#71717a">@${d.name} · ${d.time}</div></div><div style="color:#71717a">${luc('more', 16)}</div>`);
    mk('div', '', 'font-weight:600;font-weight:700;font-size:14px;line-height:1.25;margin-top:10px', c, d.title);
    if (d.desc) mk('div', '', 'color:#a1a1aa;font-size:14px;line-height:1.55;margin-top:6px', c, d.desc);
    const badges = mk('div', 'row', 'gap:8px;margin-top:10px', c, `<span class="pill cat">${d.cat}</span>`);
    const st = mk('span', 'pill', 'transform-origin:0 50%', badges);
    const act = mk('div', 'act', '', c);
    const like = mk('span', '', 'transform-origin:30% 50%', act);
    const likeI = mk('span', '', 'display:inline-flex', like, cut('like', 18, false));
    const likeN = mk('span', '', '', like, fmtK(d.likes));
    mk('span', '', '', act, cut('dislike', 18) + d.dis);
    const cmN = mk('span', '', '', act, cut('chat', 18));
    const cmT = mk('span', '', '', cmN, String(d.cm));
    mk('span', '', 'margin-left:auto', act, cut('share', 18));
    setStatus(st, d.st);
    return { c, st, like, likeI, likeN, cmT };
  };
  R.newWrap = mk('div', '', 'overflow:hidden;height:0', list);
  R.newIn = mk('div', '', 'padding-bottom:12px;transform-origin:50% 0', R.newWrap);
  R.card = card({ you: true, name: 'you', time: 'now', title: PROMPT, cat: 'New Feature', st: null, likes: 0, dis: 3, cm: 0 }, R.newIn);
  R.card.c.style.borderColor = 'rgba(255,255,255,.3)';
  R.others = [
    { name: 'kaimoto', col: '#3b2f6b', time: '2h', title: 'Pin a comment on my own posts', desc: 'Let creators pin one reply to the top so the best answer is seen first.', cat: 'UI/UX', st: 'under_review', likes: 482, dis: 6, cm: 37 },
    { name: 'lunaverse', col: '#14532d', time: '5h', title: 'Offline downloads in the app', desc: 'Save videos to watch on flights and anywhere with no signal.', cat: 'New Feature', st: 'planned', likes: 913, dis: 11, cm: 64 },
    { name: 'marco', col: '#7c2d12', time: '1d', title: 'Faster upload previews', desc: 'Show the thumbnail the moment a video starts uploading.', cat: 'Performance', st: null, likes: 210, dis: 2, cm: 18 },
  ].map(d => { const w = mk('div', '', 'padding-bottom:12px', list); return card(d, w); });
  // shipped modal, in page space so it rides the camera
  R.overlay = mk('div', 'ab', `width:${PW}px;height:${PH}px;background:rgba(0,0,0,.6);opacity:0`, pg);
  R.modal = mk('div', 'ab', 'left:96px;width:448px;border-radius:16px;background:#18181b;border:1px solid #27272a;box-shadow:0 25px 50px rgba(0,0,0,.6);transform-origin:50% 50%;opacity:0;padding:20px', pg,
    `<div class="row" style="justify-content:space-between"><div style="width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.85)">${luc('check', 20)}</div><div style="color:#71717a">${cut('close', 20)}</div></div>` +
    `<div style="font-size:18px;font-weight:700;margin-top:12px;margin-bottom:6px">Your feedback shipped!</div>` +
    `<div style="font-size:14px;color:#a1a1aa;line-height:1.6;margin-bottom:16px">Thanks for helping make DeHub better — something you asked for is now live:</div>` +
    `<div class="row" style="gap:8px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);padding:10px 12px;margin-bottom:20px"><span style="flex:1;font-size:14px;font-weight:700">${PROMPT}</span><span class="pill" style="background:rgba(255,255,255,.1);color:rgba(255,255,255,.6);border-color:transparent">New Feature</span><span style="color:#71717a">${luc('arrowUR', 16)}</span></div>`);
  const mrow = mk('div', 'row', 'gap:8px', R.modal);
  R.mBtn = mk('div', '', 'flex:1;text-align:center;padding:10px 16px;border-radius:12px;background:#fff;color:#000;font-weight:700;font-size:14px;transform-origin:50% 50%', mrow, 'Check it out');
  mk('div', '', 'padding:10px 16px;font-size:14px;color:#a1a1aa', mrow, 'Thanks!');
  R.cur = mk('div', 'ab', 'transform-origin:4px 3px;filter:drop-shadow(0 4px 6px rgba(0,0,0,.5));opacity:0', pg, cursorSvg(30));
  R.floats = mk('div', 'ab', `width:${PW}px;height:${PH}px;pointer-events:none`, pg);
  // 3D callout above the page
  R.callout = mk('div', 'ab', 'left:0;top:0;width:1000px;text-align:center;transform-style:preserve-3d;transform-origin:50% 50%', rig);
  R.coBig = mk('div', 'chrome nowrap', 'font-size:112px;font-weight:700;letter-spacing:-.02em;line-height:1;filter:drop-shadow(0 12px 30px rgba(0,0,0,.9))', R.callout, '');
  R.coSmall = mk('div', 'mono nowrap', 'font-size:22px;margin-top:10px;color:rgba(255,255,255,.85);text-shadow:0 4px 18px rgba(0,0,0,.9)', R.callout, '');
}
const STATUS_AT = [[7, 'under_review'], [8.5, 'planned'], [10, 'in_progress'], [12.4, 'shipped']];
STATUS_AT.forEach(([b]) => EVENTS.status.push(bt(b)));
EVENTS.tab.push(bt(11), bt(12));
EVENTS.click.push(bt(15.15));
const LIKE_FLOATS = Array.from({ length: 18 }, (_, j) => ({ b0: 5.5 + j * .25, n: ['thumb', 'fire', 'thumb', 'heart', 'thumb', 'hundred'][j % 6], dx: (rnd(j * 9.1) - .5) * 90, s: .55 + rnd(j * 4.2) * .4 }));
LIKE_FLOATS.forEach(f => { f.e = mk('img', 'ab', 'width:64px;height:64px;transform-origin:50% 50%;opacity:0', R.floats); EVENTS.float.push(bt(f.b0)); });
const MODAL_EMO = [[13.5, 'party', -250, -60, -14], [13.9, 'rocket', 250, -40, 12]].map(([b0, n, x, y, r]) => ({ b0, n, x, y, r, e: mk('img', 'ab', 'width:150px;height:150px;transform-origin:50% 50%;opacity:0', R.floats) }));
EVENTS.pop.push(bt(13.5), bt(13.9));

const FIT = VERT ? W / 700 : H / 1150;
function camApply(f) {
  const [fx, fy, z, rx, ry, rz] = f;
  tf(rig, `translate(${W / 2}px,${H / 2}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${FIT * z}) translate(${-fx}px,${-fy}px)`);
}
function camAt(b, keys) {
  if (b <= keys[0][0]) return keys[0].slice(1, 7);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], c = keys[i + 1];
    if (b <= c[0]) {
      const e = (c[7] || ioc)(P(b, a[0], c[0]));
      return [1, 2, 3, 4, 5, 6].map(j => j === 3 ? Math.exp(lerp(Math.log(a[j]), Math.log(c[j]), e)) : lerp(a[j], c[j], e));
    }
  }
  return keys[keys.length - 1].slice(1, 7);
}
let CAM2 = null, POS = {};
const absPos = (e) => { let x = 0, y = 0; while (e && e !== pg) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; } return [x, y]; };
function measure() {
  vis(s2, true);
  const [, cy] = absPos(R.compBox);
  POS.comp = [PW / 2, cy + R.compBox.offsetHeight / 2];
  POS.compH = R.compWrap.offsetHeight;
  R.newWrap.style.height = 'auto';
  POS.newH = R.newWrap.offsetHeight;
  R.newWrap.style.height = '0px';
  const [, ny] = absPos(R.newWrap);
  POS.card = [PW / 2, ny + (POS.newH - 12) / 2];
  POS.cardTop = ny;
  const [lx, ly] = absPos(R.card.like);
  POS.like = [lx + 10, ly + 8];
  const [, ty] = absPos(R.tabInd);
  POS.tabs = [PW / 2, ty + 22];
  // after the composer collapses (Shipped tab) the card moves up by the composer's height
  POS.cardUp = [PW / 2, POS.card[1] - POS.compH];
  POS.modal = [PW / 2, POS.cardUp[1] + 40];
  CAM2 = [
    [4.0, POS.comp[0], POS.comp[1] - 10, zw(2.5, 1.55), 0, 0, 0],
    [4.7, POS.comp[0], POS.comp[1] + 40, zw(1.15, 1.0), 16, -14, 1.2, ox],
    [5.6, POS.card[0], POS.card[1] + POS.newH * .1, zw(1.35, 1.25), 10, 10, 0, ioc],
    [6.8, zw(250, 320), POS.card[1] + POS.newH * .3, zw(1.9, 1.3), 8, -6, 0, ioc],
    [9.8, zw(270, 320), POS.card[1] + POS.newH * .2, zw(2.1, 1.42), 6, -10, 0, t => t],
    [10.7, PW / 2, POS.tabs[1] + 80, zw(1.5, 1.2), 12, 8, 0, ioc],
    [12.3, PW / 2, POS.tabs[1] + 140, zw(1.6, 1.25), 10, -6, 0, t => t],
    [13.1, POS.cardUp[0], POS.cardUp[1], zw(1.7, 1.3), 6, 4, 0, ioc],
    [13.6, POS.modal[0], POS.modal[1] + 20, zw(1.9, 1.32), 0, 0, 0, ioc],
    [15.9, POS.modal[0], POS.modal[1] + 40, zw(2.3, 1.5), -2, -4, 0, t => t],
  ];
}
function s2Update(b) {
  const on = b >= 4 && b < 16.05;
  vis(s2, on); if (!on) return;
  const t = bt(b);
  const cam = camAt(b, CAM2);
  if (VERT) { cam[0] = PW / 2; cam[2] = Math.min(cam[2], 1.06); cam[4] *= .5; } // phone: keep the whole page width on screen
  camApply(cam);
  // composer: posting, then cleared
  const posted = b >= 4.3;
  if (R.compText._p !== posted) { R.compText._p = posted; R.compText.innerHTML = posted ? '<span style="color:#71717a">Describe an idea, improvement, or bug…</span>' : PROMPT; txt(R.compCount, posted ? '0/1000' : '25/1000'); R.compPostIco.innerHTML = posted ? cut('add', 16) : luc('loader', 16); R.compBox.style.borderColor = posted ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.4)'; }
  if (!posted) tf(R.compPostIco.firstChild, `rotate(${t * 720}deg)`);
  // composer collapses when the tab leaves Prompts
  const cc = oc(P(b, 11, 11.45));
  R.compWrap.style.height = cc > 0 ? (POS.compH * (1 - cc)) + 'px' : '';
  op(R.compWrap, 1 - cc);
  // the new request drops in
  const np = P(b, 4.35, 4.85);
  R.newWrap.style.height = (POS.newH * oc(np)) + 'px';
  const pin = ob(P(b, 4.45, 4.85), 2);
  tf(R.newIn, `scale(${.85 + .15 * pin}) translateY(${(1 - oc(np)) * -30}px)`);
  op(R.newIn, P(b, 4.4, 4.6));
  // votes
  const lp = oq(P(b, 5.4, 10.4));
  txt(R.card.likeN, lp >= .999 ? '1.2K' : fmtK(1204 * lp));
  txt(R.card.cmT, String(Math.round(48 * oq(P(b, 6, 10.6)))));
  const liked = b >= 5.4;
  if (R.card.likeI._l !== liked) { R.card.likeI._l = liked; R.card.likeI.innerHTML = cut('like', 18, liked); }
  R.card.like.style.color = liked ? '#fff' : '';
  const beatP = b > 5.4 && b < 10.5 ? Math.exp(-((b - 5.4) % .5) * 8) : 0;
  tf(R.card.like, `scale(${1 + .25 * beatP})`);
  // status
  let st = null, sb = 0;
  for (const [s0, s] of STATUS_AT) if (b >= s0) { st = s; sb = s0; }
  setStatus(R.card.st, st);
  const sp = st ? ob(P(b, sb, sb + .25), 2.4) : 1;
  tf(R.card.st, `scale(${.5 + .5 * sp})`);
  const glow = st === 'shipped' ? Math.exp(-bt(b - 12.4) * 2.2) : 0;
  R.card.c.style.boxShadow = glow > .01 ? `0 0 ${40 * glow}px ${10 * glow}px rgba(255,255,255,${.5 * glow}), inset 0 0 0 1px rgba(255,255,255,${.6 * glow})` : 'none';
  // tabs
  const tp = oc(P(b, 11, 11.35)) + oc(P(b, 12, 12.35));
  tf(R.tabInd, `translateX(${tp * (R.tabInd.offsetWidth + 4)}px)`);
  const active = b < 11.15 ? 0 : b < 12.15 ? 1 : 2;
  R.tabs.forEach((x, i) => { x.t.style.color = i === active ? '#fff' : '#71717a'; });
  txt(R.tabs[0].n, String(b < 4.5 ? 247 : 248));
  txt(R.tabs[1].n, String(b < 11.2 ? 12 : 13));
  txt(R.tabs[2].n, String(b < 12.25 ? 136 : 137));
  [[1, 11.2], [2, 12.25]].forEach(([i, b0]) => tf(R.tabs[i].n, `scale(${1 + .6 * Math.exp(-Math.max(0, bt(b - b0)) * 9) * (b >= b0 ? 1 : 0)})`));
  // floats from the like button
  LIKE_FLOATS.forEach(f => {
    const d = b - f.b0;
    if (d < 0 || d > 2) { op(f.e, 0); return; }
    const fr = emoFrame(f.n, bt(d)); if (f.e._src !== fr.src) { f.e.src = fr.src; f.e._src = fr.src; }
    const p = d / 2;
    f.e.style.left = (POS.like[0] - 32 + f.dx * p + Math.sin(d * 5 + f.b0) * 14) + 'px';
    f.e.style.top = (POS.like[1] - 40 - p * 300) + 'px';
    tf(f.e, `scale(${f.s * ob(P(d, 0, .25), 2)})`);
    op(f.e, 1 - ic(P(d, 1.2, 2)));
  });
  // callouts
  const co = b < 9.5 ? [6.1, 8.3, 'THE COMMUNITY VOTES', 'one prompt · anyone can post'] : [12.4, 13.25, 'SHIPPED', 'from prompt to live'];
  if (R.coBig._k !== co[2]) { R.coBig._k = co[2]; R.coBig.textContent = co[2]; R.coSmall.textContent = co[3]; R.coBig.style.fontSize = co[2].length > 10 ? '84px' : '130px'; }
  const cp = P(b, co[0], co[0] + .25), cOut = P(b, co[1] - .3, co[1]);
  const cy = (b < 9.5 ? POS.card[1] - 60 : POS.cardUp[1] - 90) - R.callout.offsetHeight / 2 + 60;
  R.callout.style.left = (PW / 2 - 500) + 'px'; R.callout.style.top = cy + 'px';
  const cfit = (VERT ? .86 : .62) * W / Math.max(1, R.coBig.offsetWidth * FIT * cam[2]);
  tf(R.callout, `translateZ(${120 + 40 * (1 - cOut)}px) scale(${lerp(1.7, 1, ox(cp)) * (1 - .2 * cOut) * cfit})`);
  op(R.callout, cp > 0 ? Math.min(P(b, co[0], co[0] + .06), 1 - cOut) : 0);
  // shipped modal
  const mIn = P(b, 13.2, 13.5);
  op(R.overlay, P(b, 13.1, 13.4));
  R.modal.style.top = (POS.modal[1] - 150) + 'px';
  op(R.modal, mIn);
  tf(R.modal, `translateY(${(1 - ob(mIn, 1.6)) * 20}px) scale(${.95 + .05 * ob(mIn, 1.6)})`);
  MODAL_EMO.forEach(m => {
    const d = b - m.b0;
    if (d < 0) { op(m.e, 0); return; }
    const fr = emoFrame(m.n, bt(d)); if (m.e._src !== fr.src) { m.e.src = fr.src; m.e._src = fr.src; }
    m.e.style.left = (PW / 2 + m.x - 75) + 'px'; m.e.style.top = (POS.modal[1] - 150 + m.y - 75) + 'px';
    tf(m.e, `rotate(${m.r + Math.sin(d * 9) * 6}deg) scale(${ob(P(d, 0, .3), 2.6)})`);
    op(m.e, 1);
  });
  // cursor to "Check it out"
  const mb = R.mBtn.offsetLeft + R.modal.offsetLeft + 20 + R.mBtn.offsetWidth * .55, myy = POS.modal[1] - 150 + R.mBtn.parentNode.offsetTop + 30;
  const c2 = ioc(P(b, 14.3, 15.1));
  const press = P(b, 15.1, 15.17) - P(b, 15.22, 15.4);
  R.cur.style.left = lerp(PW + 40, mb, c2) + 'px'; R.cur.style.top = lerp(POS.modal[1] + 260, myy, c2) + 'px';
  op(R.cur, P(b, 14.3, 14.45)); tf(R.cur, `scale(${1 - .15 * press})`);
  tf(R.mBtn, `scale(${1 - .06 * press})`);
  op(pgShadow, 1);
}

// ======================================================================= S3: kinetic type + how it works
const s3 = mk('div', 'fill', 'perspective:1600px', world);
const s3a = mk('div', 'fill', '', s3);
const FS3 = VERT ? 150 : 210;
const L3 = [0, 1].map(i => mk('div', 'ab nowrap', `width:${W}px;text-align:center;font-size:${FS3}px;font-weight:700;line-height:1;letter-spacing:-.025em;top:${H / 2 + (i ? FS3 * .06 : -FS3 * 1.02)}px`, s3a));
const WORDS3 = [[16, 'YOU', 0], [16.5, 'PROMPT IT.', 0], [18, 'WE', 1], [18.5, 'SHIP IT.', 1]].map(([b0, w, li]) => {
  const s = mk('span', 'chrome', 'display:inline-block;margin:0 .12em;transform-origin:50% 60%', L3[li], w);
  EVENTS.slam.push(bt(b0)); shineInit(s);
  return { b0, s };
});
const s3b = mk('div', 'fill', '', s3);
const STEPS = [['PROMPT', 'describe it in plain words'], ['VOTE', 'the community decides'], ['BUILD', 'top ideas get built'], ['SHIP', 'live for everyone']];
const FS3B = VERT ? 210 : 250;
const stepIdx = mk('div', 'ab nowrap', `width:${W}px;text-align:center;top:${H / 2 - (VERT ? 330 : 360)}px;font-size:${VERT ? 560 : 640}px;font-weight:700;line-height:1;color:transparent;-webkit-text-stroke:2px rgba(255,255,255,.09)`, s3b, '01');
const SEL = STEPS.map(([w, d], i) => {
  const bx = mk('div', 'ab', `width:${W}px;top:${H / 2 - FS3B * .62}px;text-align:center;transform-origin:50% 50%`, s3b);
  const word = mk('div', 'nowrap chrome', `display:inline-block;font-size:${FS3B}px;font-weight:700;line-height:1;letter-spacing:-.02em`, bx, w);
  shineInit(word);
  const desc = mk('div', 'mono', `font-size:${VERT ? 30 : 28}px;margin-top:${VERT ? 28 : 30}px;color:rgba(255,255,255,.7)`, bx, d);
  EVENTS.tick.push(bt(20 + i));
  return { box: bx, word, desc, b0: 20 + i };
});
const stepTop = mk('div', 'ab mono nowrap', `top:${VERT ? 330 : 130}px;width:${W}px;text-align:center;font-size:${VERT ? 28 : 24}px;color:rgba(255,255,255,.75)`, s3b, 'anyone can prompt');
const segs = mk('div', 'ab', `top:${H - (VERT ? 360 : 150)}px;left:${(W - (VERT ? 700 : 760)) / 2}px;width:${VERT ? 700 : 760}px;height:6px;display:flex;gap:8px`, s3b);
const SEG = STEPS.map(() => mk('div', '', 'flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.14)', segs));
function s3Update(b) {
  const on = b >= 16 && b < 24.1;
  vis(s3, on); if (!on) return;
  vis(s3a, b < 20.1);
  WORDS3.forEach(({ b0, s }) => {
    const p = P(b, b0, b0 + .32);
    op(s, P(b, b0 - .02, b0 + .04));
    tf(s, `translateY(${(1 - ox(p)) * -30}px) scale(${lerp(2.1, 1, ox(p))}) rotateX(${(1 - ox(p)) * 30}deg)`);
  });
  WORDS3.forEach(({ s }, i) => shine(s, P(b, 18.9 + i * .12, 19.5 + i * .12)));
  const sp = ic(P(b, 19.55, 20.05));
  tf(L3[0], `translateX(${-sp * W * 1.3}px) skewX(${sp * 20}deg) scale(${L3[0]._fit || 1})`);
  tf(L3[1], `translateX(${sp * W * 1.3}px) skewX(${-sp * 20}deg) scale(${L3[1]._fit || 1})`);
  vis(s3b, b >= 19.9);
  if (b < 19.9) return;
  let cur = 0;
  SEL.forEach((f, i) => {
    const pin = P(b, f.b0, f.b0 + .25), pout = i === 3 ? P(b, 23.75, 24) : P(b, f.b0 + .78, f.b0 + 1);
    const live = b >= f.b0 - .02 && pout < 1;
    vis(f.box, live); if (!live) return;
    if (b >= f.b0) cur = i;
    tf(f.box, `scale(${lerp(.5, 1, ox(pin)) * lerp(1, 2.6, ic(pout)) * (f.fit || 1)}) translateY(${(1 - ox(pin)) * 40}px)`);
    op(f.box, Math.min(P(b, f.b0 - .02, f.b0 + .05), 1 - pout));
    op(f.desc, P(b, f.b0 + .08, f.b0 + .2));
    shine(f.word, P(b, f.b0 + .2, f.b0 + .8));
  });
  txt(stepIdx, String(cur + 1).padStart(2, '0'));
  tf(stepIdx, `scale(${lerp(1.15, 1, oc(P(b, 20 + cur, 20.3 + cur)))})`);
  op(stepIdx, P(b, 20, 20.2) * (1 - P(b, 23.75, 24)));
  SEG.forEach((s, i) => { s.style.background = i <= cur && b >= 20 ? '#fff' : 'rgba(255,255,255,.14)'; });
  op(stepTop, P(b, 20, 20.3) * (1 - P(b, 23.75, 24))); op(segs, P(b, 20, 20.2) * (1 - P(b, 23.75, 24)));
}

// ======================================================================= S4: the question
const s4 = mk('div', 'fill', 'perspective:1400px', world);
const QL = VERT ? ["THE WORLD'S", 'FIRST TRULY', 'COMMUNITY-', 'BUILT', 'PLATFORM'] : ["THE WORLD'S FIRST", 'TRULY COMMUNITY-BUILT', 'PLATFORM'];
const QB = VERT ? [24, 24.5, 25, 25.5, 26] : [24, 24.75, 25.5];
const QMARK_B = VERT ? 26.75 : 26.5;
const FS4 = VERT ? 150 : 150, LH4 = FS4 * .98;
const qTop = H / 2 - (QL.length * LH4) / 2 - (VERT ? 60 : 50);
const QEL = QL.map((l, i) => {
  const e = mk('div', 'ab nowrap', `width:${W}px;text-align:center;top:${qTop + i * LH4}px;font-size:${FS4}px;font-weight:700;line-height:1;letter-spacing:-.025em;transform-origin:50% 50%`, s4);
  const s = mk('span', 'chrome', 'display:inline-block', e, l);
  shineInit(s);
  EVENTS.slam.push(bt(QB[i]));
  return { e, s, b0: QB[i], fit: 1 };
});
const qmark = mk('span', 'chrome', 'display:inline-block;transform-origin:50% 80%;margin-left:.04em', QEL[QEL.length - 1].e, '?');
shineInit(qmark);
EVENTS.slam.push(bt(QMARK_B)); EVENTS.qmark = bt(QMARK_B);
const q4sub = mk('div', 'ab mono nowrap', `width:${W}px;text-align:center;top:${qTop + QL.length * LH4 + (VERT ? 50 : 40)}px;font-size:${VERT ? 28 : 26}px;color:rgba(255,255,255,.75)`, s4, 'you prompt it · we ship it');
const SPARK = [['sparkle', -.38, -.32, 150], ['star', .4, -.28, 120], ['sparkles-duo', .36, .3, 140], ['megaphone', -.4, .28, 130]].map(([n, x, y, s], i) => {
  const e = mk('img', 'ab', `width:${s * (VERT ? 1.15 : 1)}px;transform-origin:50% 50%;filter:drop-shadow(0 20px 30px rgba(0,0,0,.6))`, s4);
  loads.push(whenLoaded(e, ICON3D[n])); e.src = ICON3D[n];
  return { e, x, y, s: s * (VERT ? 1.15 : 1), i };
});
function s4Update(b) {
  const on = b >= 23.95 && b < 30.1;
  vis(s4, on); if (!on) return;
  const t = bt(b);
  QEL.forEach(({ e, s, b0, fit }, qi) => {
    const p = P(b, b0, b0 + .3);
    op(e, P(b, b0 - .01, b0 + .04));
    tf(e, `translateY(${(1 - ox(p)) * -60}px) rotateX(${(1 - ox(p)) * -60}deg) scale(${lerp(VERT ? 1.15 : 1.4, 1, ox(p)) * fit})`);
    shine(s, P(b, 27.4 + qi * .15, 28.3 + qi * .15));
  });
  const qp = P(b, QMARK_B, QMARK_B + .4);
  op(qmark, P(b, QMARK_B - .01, QMARK_B + .03));
  tf(qmark, `scale(${lerp(3.2, 1, ox(qp))}) rotate(${(1 - ox(qp)) * -40 + Math.sin(t * 3) * 4 * P(b, QMARK_B + .4, QMARK_B + 1)}deg)`);
  shine(qmark, P(b, 28.4, 29.1));
  const sp = P(b, QMARK_B + .6, QMARK_B + 1.1);
  q4sub.style.clipPath = `inset(0 ${100 - 100 * oq(sp)}% 0 0)`; op(q4sub, sp > 0 ? 1 : 0);
  SPARK.forEach(({ e, x, y, s, i }) => {
    const b0 = QMARK_B + i * .2, p = ob(P(b, b0, b0 + .4), 2);
    e.style.left = (W / 2 + x * (VERT ? W * 1.55 : W) - s / 2) + 'px';
    e.style.top = (H / 2 + y * (VERT ? H * .62 : H) - s / 2 + Math.sin(t * 1.6 + i) * 14) + 'px';
    tf(e, `rotate(${Math.sin(t * .8 + i * 2) * 18 + (1 - p) * 90}deg) scale(${p})`);
    op(e, P(b, b0, b0 + .1));
  });
  const push = 1 + .04 * ioc(P(b, 24, 29.6));
  tf(s4, `scale(${push * (1 + .4 * ic(P(b, 29.65, 30.1)))})`);
}

// ======================================================================= S5: end card (the editor's download ending)
const s5 = mk('div', 'fill', 'background:#000', world);
const cvEnd = mk('canvas', '', `width:${W}px;height:${H}px;display:block`, s5); cvEnd.width = W; cvEnd.height = H;
const endLine = mk('div', 'ab mono nowrap', `width:${W}px;text-align:center;font-size:${VERT ? 26 : 22}px;color:rgba(255,255,255,.6)`, s5, 'Requests · anyone can prompt');
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
  const size = Math.max(11, unit * .046);
  ctx.font = '500 ' + size + 'px Exo';
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
  ctx.beginPath(); ctx.rect((width - unit * .9) / 2, textY - size * .8, unit * .9, size * 1.6); ctx.clip();
  ctx.fillText(label, width / 2, textY + (1 - textEase) * size * .9);
  ctx.restore();
  return textY + size;
}
function s5Update(b) {
  const on = b >= 30;
  vis(s5, on); if (!on) return;
  const ty = drawOutro(cvEnd.getContext('2d'), W, H, bt(b) - bt(30), 'dehub.io/features');
  endLine.style.top = (ty + Math.min(W, H) * .03) + 'px';
  const p = P(b, 32.4, 33.2);
  op(endLine, oc(p) * .9);
  tf(endLine, `translateY(${(1 - oc(p)) * 12}px)`);
}

// ======================================================================= global fx
// [beat, rgbPx, tear(0..1), flash(0..1), shake(px), decayBeats]
const FXE = [
  [4, 22, .9, .85, 16, .55], [4.4, 6, 0, 0, 6, .3], [7, 6, 0, 0, 6, .3], [8.5, 6, 0, 0, 6, .3], [10, 6, 0, 0, 6, .3],
  [11, 8, .15, 0, 8, .35], [12, 8, .15, 0, 8, .35], [12.4, 14, .3, .15, 14, .5], [13.2, 8, 0, 0, 6, .35],
  [16, 26, 1, .45, 18, .6], [16.5, 8, 0, 0, 10, .35], [18, 8, 0, 0, 12, .35], [18.5, 10, .2, 0, 14, .4],
  [20, 14, .6, 0, 10, .45], [21, 8, .2, 0, 8, .35], [22, 8, .2, 0, 8, .35], [23, 10, .3, 0, 10, .4],
  [30, 28, 1, .5, 14, .6],
];
QB.forEach((b, i) => FXE.push([b, 10 + i * 2, i === 0 ? .7 : .15, i === 0 ? .3 : 0, 12, .45]));
FXE.push([QMARK_B, 22, .8, .35, 24, .6]);
// motion-blur windows [b0, b1, subframes, shutter(frames)]
const MB = [[3.7, 4.9, 6, 1], [5.4, 5.8, 4, .7], [10.6, 12.5, 5, 1], [12.9, 13.7, 5, 1], [15.7, 16.8, 5, 1], [17.9, 18.8, 5, 1], [19.5, 20.4, 6, 1],
  [20.9, 21.3, 4, .8], [21.9, 22.3, 4, .8], [22.9, 23.3, 4, .8], [23.6, 24.4, 5, 1], [29.6, 30.3, 6, 1]];
function fxAt(t) {
  const b = sceneB(t / B);
  let rgb = 0, tear = 0, flash = 0, shake = 0, tearSeed = 0;
  for (const [eb, r, te, fl, sh, d] of FXE) {
    if (b < eb || b > eb + d) continue;
    const k = (1 - (b - eb) / d) ** 2;
    rgb = Math.max(rgb, r * k * .5); shake = Math.max(shake, sh * k * .45); flash = Math.max(flash, fl * k ** 1.5 * .45);
    if (te * k * .45 > tear) { tear = te * k * .45; tearSeed = Math.round(eb * 100) + Math.floor((b - eb) / d * 6); }
  }
  let mb = 1, sh = 0;
  for (const [a, z, n, s] of MB) if (b >= a && b < z) { mb = n; sh = s; }
  return { rgb, tear, tearSeed, flash, shake, mb, sh };
}
window.fxAt = fxAt;
const flashL = mk('div', 'fill', 'background:#fff;opacity:0;pointer-events:none');

// ======================================================================= render
function render(t) {
  const b = sceneB(t / B);
  const fx = fxAt(t);
  const f = Math.floor(t * 60);
  const sx = fx.shake * (rnd(f * 1.37) - .5) * 2, sy = fx.shake * (rnd(f * 2.71 + 9) - .5) * 2;
  tf(world, `translate(${sx.toFixed(2)}px,${sy.toFixed(2)}px)`);
  op(flashL, fx.flash);
  if (b < 4) bgSet({ '12': [.62 * P(b, 0, .6), 1.12 + .05 * b / 4, -2 + b * .5] });
  else if (b < 16) bgSet({ '01': [.5, 1.15 + .004 * (b - 4), (b - 4) * .25] });
  else if (b < 20) bgSet({});
  else if (b < 24) bgSet({ '30': [.3 * P(b, 20, 20.5), 1.25, (b - 20) * .6] });
  else if (b < 30) bgSet({ '40': [.55 * P(b, 24, 24.6), 1.18 + .01 * (b - 24), (b - 24) * .5] });
  else bgSet({});
  op(spot, b < 30 ? 1 : 0);
  s1Update(b);
  s2Update(b);
  s3Update(b);
  s4Update(b);
  s5Update(b);
}
window.render = render;
window.FILM = { W, H, TOTAL, BPM, fps: 60 };
window.ready = (async () => {
  await document.fonts.load('500 40px Exo'); await document.fonts.load('700 40px Exo'); await document.fonts.load('20px DMono');
  await Promise.all(loads);
  await document.fonts.ready;
  measure();
  [head1, R.coBig, ...L3, ...SEL.map(f => f.word), ...QEL.map(q => q.e)].forEach(e => e.classList.add('hm'));
  await document.fonts.ready;
  // fit the big words to the frame
  L3.forEach(l => { const w = [...l.children].reduce((a, c) => a + c.offsetWidth + FS3 * .24, 0); l._fit = Math.min(1, W * .9 / w); l.style.transformOrigin = '50% 50%'; });
  SEL.forEach(f => { vis(f.box, true); f.fit = Math.min(1, (W * (VERT ? .88 : .8)) / f.word.offsetWidth); vis(f.box, false); });
  vis(s4, true);
  QEL.forEach(q => { const w = q.s.offsetWidth + (q === QEL[QEL.length - 1] ? qmark.offsetWidth : 0); q.fit = Math.min(1, (W * (VERT ? .9 : .86)) / w); });
  for (const k in EVENTS) EVENTS[k] = Array.isArray(EVENTS[k]) ? EVENTS[k].map(x => bt(filmB(x / B))) : bt(filmB(EVENTS[k] / B));
  render(0);
  return true;
})();
