# TRENCHSTAR — vendored arcade build

Upstream: `Downloads/claude/trenchstar`, commit `aeaacd9`.
Engine: three.js r180, vendored under `vendor/three/`. No build step — the entry
is `index.html` with an importmap, the same shape as Jungle Trail.

## What differs from upstream

- `window.TRENCHSTAR_ASSETS` is `''`. Upstream points it at an R2 bucket; in a
  sandboxed frame the origin is opaque, and the bucket answers `Origin: null`
  with no `Access-Control-Allow-Origin`, so every model would fail. Everything
  is vendored beside this file instead and nothing crosses an origin.
- Two characters, not three. Fat Chad's mesh is 27 MB even with 128px textures —
  the weight is geometry, and geometry cannot be decimated without unbinding the
  skin from the rig. That is over Cloudflare's 20 MiB per-asset limit.
- Lady Luck's own walk clip is not here. It was a 19 MB Mixamo "With Skin"
  download, whose duplicate character mesh is discarded on load anyway; she
  borrows the donor rig's walk, which is what the other characters already did.

## Live data

Binance (`data-api.binance.vision`, `fapi.binance.com`) and DexScreener, all of
which answer `Access-Control-Allow-Origin: *` — verified from `Origin: null`,
which is what this frame sends. There is no key and no account: if a feed is
unreachable the room falls back to its own simulation and says `SIM` on the
affected panels.

## Exit

`window.parent.postMessage({source:'trenchstar',type:'exit'},'*')`, from the
✕ EXIT button, which only renders when framed.
