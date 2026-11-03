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

// The uplink readout both pages show while they work: packets run from
// dehub.io to riftn.com, a meter fills and a short log ticks off what travels.
// The outbound page plays the first half and the inbound page the second, each
// held on screen for at least SHOW_MS so the move reads as one sequence.
const SHOW_MS = 1000;

const STYLE = `html,body{margin:0;height:100%;background:#000;color:#fff;font:15px system-ui,sans-serif;overflow:hidden}
#u{position:fixed;inset:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
#c{position:absolute;inset:0;width:100%;height:100%}
.b{position:absolute;width:22px;height:22px;border:1.5px solid #fff}
.tl{top:16px;left:16px;border-right:0;border-bottom:0}.tr{top:16px;right:16px;border-left:0;border-bottom:0}
.bl{bottom:16px;left:16px;border-right:0;border-top:0}.br{bottom:16px;right:16px;border-left:0;border-top:0}
.hd{position:absolute;top:24px;left:48px;right:48px;display:flex;justify-content:space-between;gap:12px;font-size:10px;letter-spacing:.14em;color:rgba(255,255,255,.55)}
.nd{position:absolute;left:10%;right:10%;top:40%;display:flex;justify-content:space-between;font-weight:700;font-size:clamp(12px,2.2vw,20px);letter-spacing:.04em}
.nd small{display:block;font-size:9px;font-weight:500;letter-spacing:.16em;color:rgba(255,255,255,.5);margin-bottom:6px}
.nd .r{text-align:right}
.m{position:absolute;left:10%;right:10%;top:60%;display:grid;grid-template-columns:repeat(24,1fr);gap:3px;height:8px}
.m i{background:rgba(255,255,255,.1)}.m i.on{background:#fff;box-shadow:0 0 6px rgba(255,255,255,.5)}
.lg{position:absolute;left:10%;top:calc(60% + 20px);font-size:10.5px;line-height:1.7;letter-spacing:.1em;color:rgba(255,255,255,.55)}
.lg div{opacity:0}.lg div.on{opacity:1}.lg b{color:#fff;font-weight:600}
.pc{position:absolute;right:10%;top:calc(60% + 20px);font-size:11px;letter-spacing:.1em;font-variant-numeric:tabular-nums}
.st{position:absolute;left:0;right:0;bottom:30px;margin:0;text-align:center;font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.45)}
@media (max-width:520px){.hd{font-size:8.5px;left:44px;right:44px}.nd,.m{left:8%;right:8%}.m{gap:2px}.lg{left:8%}.pc{right:8%}}`;

const MARKUP = `<div id="u" aria-hidden="true"><canvas id="c"></canvas>
<i class="b tl"></i><i class="b tr"></i><i class="b bl"></i><i class="b br"></i>
<div class="hd"><span>LINK DH-114 → RF-001</span><span>SECURE / E2E</span></div>
<div class="nd"><div><small>SOURCE</small>DEHUB.IO</div><div class="r"><small>DESTINATION</small>RIFTN.COM</div></div>
<div class="m">${'<i></i>'.repeat(24)}</div>
<div class="lg"><div>LOGIN ······ <b>CARRIED</b></div><div>SETTINGS ··· <b>CARRIED</b></div><div>WALLET ····· <b>SEALED</b></div><div>ROUTE ······ <b>OPEN</b></div></div>
<div class="pc">000%</div></div>
<p class="st" role="status">Moving you to riftn.com…</p>`;

// Plays progress `from` -> `to` and exposes window.__shown, which the hand-off
// script awaits before it navigates. Any failure here leaves the move untouched.
const uplink = (from, to) => `(() => {
  const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.__shown = new Promise((ok) => setTimeout(ok, rm ? 250 : ${SHOW_MS}));
  try {
    const cv = document.getElementById('c'), g = cv.getContext('2d');
    const cells = [...document.querySelectorAll('.m i')], logs = [...document.querySelectorAll('.lg div')];
    const pc = document.querySelector('.pc'), nodes = document.querySelectorAll('.nd > div');
    const packets = Array.from({ length: 14 }, (_, i) => ({ o: i / 14, s: 0.8 + Math.random() * 0.6, j: Math.random() - 0.5 }));
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const t0 = performance.now();
    let lastCells = -1, lastLogs = -1, lastPct = -1;
    const frame = (now) => {
      const p = ${from} + (${to} - ${from}) * ease(rm ? 1 : Math.min(1, (now - t0) / ${SHOW_MS}));
      const d = Math.min(2, devicePixelRatio || 1), W = Math.round(innerWidth * d), H = Math.round(innerHeight * d);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      g.clearRect(0, 0, W, H);
      const a = nodes[0].getBoundingClientRect(), b = nodes[1].getBoundingClientRect();
      const y = (a.bottom - 9) * d, x1 = (a.right + 16) * d, x2 = (b.left - 16) * d;
      const fill = Math.min(1, p / 0.88), xf = x1 + (x2 - x1) * fill;
      g.lineWidth = d; g.strokeStyle = 'rgba(255,255,255,.2)'; g.setLineDash([4 * d, 4 * d]);
      g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke(); g.setLineDash([]);
      g.lineWidth = 1.5 * d; g.strokeStyle = 'rgba(255,255,255,.9)';
      g.beginPath(); g.moveTo(x1, y); g.lineTo(xf, y); g.stroke();
      if (!rm && p < 0.97) for (const k of packets) {
        const t = ((now / 1000) * 0.55 * k.s + k.o) % 1;
        if (t > fill + 0.02) continue;
        g.fillStyle = 'rgba(255,255,255,' + (0.3 + 0.7 * Math.sin(t * Math.PI)) + ')';
        g.fillRect(x1 + (x2 - x1) * t, y - 1.5 * d + k.j * 6 * d, 6.5 * d, 3 * d);
      }
      const lock = Math.max(0, Math.min(1, (p - 0.82) / 0.14));
      if (lock > 0) {
        const r = (20 - 9 * ease(lock)) * d;
        g.strokeStyle = 'rgba(255,255,255,' + lock + ')'; g.beginPath();
        for (let q = 0; q < 4; q++) { const s = q * Math.PI / 2 + Math.PI / 4; g.moveTo(x2 + Math.cos(s - 0.35) * r, y + Math.sin(s - 0.35) * r); g.arc(x2, y, r, s - 0.35, s + 0.35); }
        g.stroke();
      }
      const n = Math.round(fill * cells.length);
      if (n !== lastCells) { cells.forEach((c, i) => c.classList.toggle('on', i < n)); lastCells = n; }
      const l = [0.12, 0.3, 0.5, 0.86].filter((v) => p >= v).length;
      if (l !== lastLogs) { logs.forEach((e, i) => e.classList.toggle('on', i < l)); lastLogs = l; }
      const v = Math.round(p * 100);
      if (v !== lastPct) { pc.textContent = String(v).padStart(3, '0') + '%'; lastPct = v; }
      if (!rm) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  } catch (e) {}
})();`;

function page(script, from, to) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="theme-color" content="#000"><title>DeHub</title><style>${STYLE}</style></head><body>${MARKUP}<script>${uplink(from, to)}</script><script>${script}</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}

/** The hand-off pages, or null when the request is not for one. */
export function handleDomainHandoff(url) {
  if (url.pathname === '/_handoff-out' && OLD_HOSTS.has(url.hostname)) return page(OUT_SCRIPT, 0, 0.55);
  if (url.pathname === '/_handoff' && NEW_HOSTS.has(url.hostname)) return page(IN_SCRIPT, 0.55, 1);
  return null;
}
