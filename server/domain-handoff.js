// Carries what only this browser holds from dehub.io to riftn.com.
//
// A browser keeps logins, settings and unsecured wallets per address, so a
// plain dehub.io -> riftn.com redirect would sign everyone out and strand any
// wallet whose words live only in this browser (lib/wallet-core/device-seed.ts).
// Two tiny standalone pages move it instead, with no app code and no
// third-party scripts on either side:
//
//   dehub.io/_handoff-out?next=/path   reads localStorage and the device-seed
//     store, removes the Supabase session here (so no other dehub.io tab
//     refreshes a token the new address now owns), then jumps to
//   riftn.com/_handoff#<payload>       writes them into riftn.com's storage,
//     wipes the fragment from history and continues to /path.
//
// The payload rides in the URL fragment, which browsers never send to a server.
// Keys already present on riftn.com are left alone, so a hand-off never
// overwrites a login made there.

import { DEHUB_LOGO, RIFTN_LOGO } from './handoff-logos.js';

export const OLD_HOSTS = new Set(['dehub.io', 'www.dehub.io']);
export const NEW_HOSTS = new Set(['riftn.com', 'www.riftn.com']);
export const NEW_ORIGIN = 'https://riftn.com';

const DEVICE_SEED_DB = 'dehub-wallet-device-seed';
const DEVICE_SEED_STORE = 'seeds';

// Shared by both pages: base64url <-> UTF-8 JSON.
const CODEC = `
const enc = (o) => { const b = new TextEncoder().encode(JSON.stringify(o)); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''); };
const dec = (t) => { const s = atob(t.replace(/-/g, '+').replace(/_/g, '/')); return JSON.parse(new TextDecoder().decode(Uint8Array.from(s, (c) => c.charCodeAt(0)))); };
const safePath = (p) => (typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/_handoff') ? p : '/');
const idb = (req) => new Promise((ok, no) => { req.onsuccess = () => ok(req.result); req.onerror = () => no(req.error); });
const openSeeds = () => { const r = indexedDB.open(${JSON.stringify(DEVICE_SEED_DB)}, 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(${JSON.stringify(DEVICE_SEED_STORE)})) r.result.createObjectStore(${JSON.stringify(DEVICE_SEED_STORE)}); }; return idb(r); };
`;

const OUT_SCRIPT = `${CODEC}
(async () => {
  const next = safePath(new URLSearchParams(location.search).get('next'));
  const ls = {};
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = k == null ? null : localStorage.getItem(k);
      if (v == null) continue;
      const auth = /^sb-.*-auth-token$/.test(k);
      // Logins always travel; settings travel while they are small, so a big
      // feed cache cannot push the URL past what browsers accept.
      if (!auth && (v.length > 8192 || total + v.length > 65536)) continue;
      ls[k] = v;
      if (!auth) total += v.length;
    }
  } catch (e) {}
  const seeds = [];
  try {
    const known = indexedDB.databases ? (await indexedDB.databases()).some((d) => d.name === ${JSON.stringify(DEVICE_SEED_DB)}) : true;
    if (known) {
      const db = await openSeeds();
      const store = db.transaction(${JSON.stringify(DEVICE_SEED_STORE)}).objectStore(${JSON.stringify(DEVICE_SEED_STORE)});
      const keys = await idb(store.getAllKeys());
      const records = await idb(store.getAll());
      for (let i = 0; i < keys.length; i++) {
        const r = records[i];
        try {
          const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: r.iv }, r.wrapKey, r.ciphertext);
          seeds.push({ userId: String(keys[i]), secret: new TextDecoder().decode(plain), address: r.address });
        } catch (e) {}
      }
      db.close();
    }
  } catch (e) {}
  await (window.__shown || 0);
  // The new address owns the session from here on.
  try { for (const k of Object.keys(ls)) if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k); } catch (e) {}
  location.replace(${JSON.stringify(NEW_ORIGIN)} + '/_handoff#' + enc({ v: 1, ls, seeds, next }));
})();
`;

const IN_SCRIPT = `${CODEC}
(async () => {
  let data = null;
  try { data = dec(location.hash.slice(1)); } catch (e) {}
  history.replaceState(null, '', '/_handoff');
  if (!data || data.v !== 1) return location.replace('/');
  try {
    for (const [k, v] of Object.entries(data.ls || {})) {
      if (typeof v === 'string' && localStorage.getItem(k) === null) localStorage.setItem(k, v);
    }
  } catch (e) {}
  try {
    if (Array.isArray(data.seeds) && data.seeds.length) {
      const db = await openSeeds();
      for (const s of data.seeds) {
        if (!s || !s.userId || !s.secret) continue;
        const have = await idb(db.transaction(${JSON.stringify(DEVICE_SEED_STORE)}).objectStore(${JSON.stringify(DEVICE_SEED_STORE)}).get(s.userId));
        if (have) continue;
        // Same record shape as lib/wallet-core/device-seed.ts, under a fresh
        // unexportable key that belongs to this address.
        const wrapKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, new TextEncoder().encode(s.secret));
        const tx = db.transaction(${JSON.stringify(DEVICE_SEED_STORE)}, 'readwrite');
        tx.objectStore(${JSON.stringify(DEVICE_SEED_STORE)}).put({ wrapKey, iv, ciphertext, address: String(s.address || '').toLowerCase() }, s.userId);
        await new Promise((ok, no) => { tx.oncomplete = ok; tx.onerror = () => no(tx.error); });
      }
      db.close();
    }
  } catch (e) {}
  await (window.__shown || 0);
  location.replace(safePath(data.next));
})();
`;

// The jump both pages show while they work: stars speed up into streaks as the
// DeHub logo stretches away, a white flash, then the Riftn logo lands as the
// stars settle. The outbound page plays the first half and the inbound page the
// second, each held on screen for at least SHOW_MS so the move reads as one jump.
const SHOW_MS = 1000;

const STYLE = `html,body{margin:0;height:100%;background:#000;color:#fff;overflow:hidden}
#c{position:fixed;inset:0;width:100%;height:100%}
#m{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4vh;pointer-events:none}
#l{position:relative;width:min(34vw,420px);aspect-ratio:604/180}
#l img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
#s{margin:0;font:12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.2em;color:rgba(255,255,255,.62);white-space:nowrap}
@media (max-width:600px){#l{width:62vw}#s{font-size:10px}}`;

const MARKUP = `<canvas id="c" aria-hidden="true"></canvas>
<div id="m"><div id="l"><img id="a" alt="" src="${DEHUB_LOGO}"><img id="b" alt="Riftn" src="${RIFTN_LOGO}" style="opacity:0"></div>
<p id="s" role="status">dehub.io → riftn.com</p></div>`;

// Plays progress `from` -> `to` and exposes window.__shown, which the hand-off
// script awaits before it navigates. Any failure here leaves the move untouched.
const jump = (from, to) => `(() => {
  const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.__shown = new Promise((ok) => setTimeout(ok, rm ? 250 : ${SHOW_MS}));
  try {
    const cv = document.getElementById('c'), g = cv.getContext('2d');
    const a = document.getElementById('a'), b = document.getElementById('b');
    const clamp = (v) => Math.min(1, Math.max(0, v)), seg = (p, x, y) => clamp((p - x) / (y - x));
    const ease = (t) => 1 - Math.pow(1 - t, 3), easeIn = (t) => t * t * t;
    const stars = Array.from({ length: 240 }, () => ({ ang: Math.random() * Math.PI * 2, r: Math.random(), z: Math.random() }));
    const t0 = performance.now();
    let last = t0;
    const frame = (now) => {
      const p = rm ? 1 : ${from} + (${to} - ${from}) * Math.min(1, (now - t0) / ${SHOW_MS});
      const d = Math.min(2, devicePixelRatio || 1), W = Math.round(innerWidth * d), H = Math.round(innerHeight * d);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      const cx = W / 2, cy = H / 2, R = Math.hypot(W, H) / 2, dt = Math.min(50, now - last) / 1000;
      last = now;
      const ramp = easeIn(seg(p, 0.05, 0.5)), settle = ease(seg(p, 0.55, 0.95));
      const speed = rm ? 0 : 0.08 + 2.8 * ramp * (1 - settle) + 0.04 * settle, streak = ramp * (1 - settle);
      g.fillStyle = 'rgba(0,0,0,' + (rm ? 1 : 0.6 - 0.4 * streak) + ')';
      g.fillRect(0, 0, W, H);
      g.lineCap = 'round';
      for (const s of stars) {
        s.z += speed * dt * (0.4 + s.r);
        if (s.z > 1) { s.z = 0.02; s.ang = Math.random() * Math.PI * 2; s.r = Math.random(); }
        const r1 = Math.pow(s.z, 2.2) * R, r0 = Math.pow(Math.max(0, s.z - 0.04 - 0.26 * streak), 2.2) * R;
        const c = Math.cos(s.ang), sn = Math.sin(s.ang);
        g.strokeStyle = 'rgba(255,255,255,' + (0.25 + 0.75 * s.z) + ')';
        g.lineWidth = (0.6 + 1.8 * s.z) * d;
        g.beginPath(); g.moveTo(cx + c * r0, cy + sn * r0); g.lineTo(cx + c * r1 + 0.1, cy + sn * r1); g.stroke();
      }
      const flash = seg(p, 0.48, 0.53) * (1 - seg(p, 0.53, 0.68));
      if (flash > 0) { g.fillStyle = 'rgba(255,255,255,' + flash * 0.92 + ')'; g.fillRect(0, 0, W, H); }
      const out = seg(p, 0.08, 0.47), inn = ease(seg(p, 0.56, 0.82));
      a.style.cssText = 'opacity:' + (1 - out) + ';transform:scale(' + (1 + 1.6 * easeIn(out)) + ',' + (1 - 0.15 * out) + ');filter:blur(' + out * 4 + 'px)';
      b.style.cssText = 'opacity:' + inn + ';transform:scale(' + (1.35 - 0.35 * inn) + ');filter:blur(' + (1 - inn) * 6 + 'px)';
      if (!rm) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  } catch (e) {}
})();`;

function page(script, from, to) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="theme-color" content="#000"><title>Riftn</title><style>${STYLE}</style></head><body>${MARKUP}<script>${jump(from, to)}</script><script>${script}</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}

/** The hand-off pages, or null when the request is not for one. */
export function handleDomainHandoff(url) {
  if (url.pathname === '/_handoff-out' && OLD_HOSTS.has(url.hostname)) return page(OUT_SCRIPT, 0, 0.5);
  if (url.pathname === '/_handoff' && NEW_HOSTS.has(url.hostname)) return page(IN_SCRIPT, 0.5, 1);
  return null;
}
