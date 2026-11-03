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
/** Set by the app on dehub.io while it holds a login or an unsecured wallet. */
export const LOCAL_STATE_COOKIE = 'dh_local';

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
  // The new address owns the session from here on.
  try { for (const k of Object.keys(ls)) if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k); } catch (e) {}
  document.cookie = '${LOCAL_STATE_COOKIE}=; Max-Age=0; Path=/; Secure; SameSite=Lax';
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
  location.replace(safePath(data.next));
})();
`;

function page(script) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>DeHub</title><style>html,body{margin:0;height:100%;background:#000;color:#fff;font:15px system-ui,sans-serif;display:flex;align-items:center;justify-content:center}</style></head><body><p>Moving you to riftn.com…</p><script>${script}</script></body></html>`;
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
  if (url.pathname === '/_handoff-out' && OLD_HOSTS.has(url.hostname)) return page(OUT_SCRIPT);
  if (url.pathname === '/_handoff' && NEW_HOSTS.has(url.hostname)) return page(IN_SCRIPT);
  return null;
}
