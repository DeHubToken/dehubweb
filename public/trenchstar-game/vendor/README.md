# Vendored dependencies

TRENCHSTAR has no build step. Everything it needs is committed here so the page
works from `file://`, from a static host, and offline, with no third-party request
from a visitor's session.

## three r180

Pinned to **three 0.180.0**, fetched from
`https://cdn.jsdelivr.net/npm/three@0.180.0/`, directory layout preserved so the
addons' own relative imports resolve untouched.

The importmap in `index.html` is what binds it:

```json
{ "imports": {
  "three": "./vendor/three/build/three.module.js",
  "three/addons/": "./vendor/three/examples/jsm/"
} }
```

Files, and why each is here:

| path | pulled in by |
| --- | --- |
| `build/three.module.js` | the engine |
| `build/three.core.js` | **`three.module.js` itself** — see below |
| `examples/jsm/postprocessing/EffectComposer.js` | render pipeline |
| `examples/jsm/postprocessing/Pass.js` | base class for every pass |
| `examples/jsm/postprocessing/RenderPass.js` | scene → buffer |
| `examples/jsm/postprocessing/ShaderPass.js` | required by EffectComposer |
| `examples/jsm/postprocessing/MaskPass.js` | required by EffectComposer |
| `examples/jsm/postprocessing/UnrealBloomPass.js` | the screen glow |
| `examples/jsm/postprocessing/OutputPass.js` | tone map + sRGB |
| `examples/jsm/shaders/CopyShader.js` | EffectComposer, UnrealBloomPass |
| `examples/jsm/shaders/LuminosityHighPassShader.js` | UnrealBloomPass |
| `examples/jsm/shaders/OutputShader.js` | OutputPass |
| `examples/jsm/environments/RoomEnvironment.js` | PMREM env map for the metal floor |
| `examples/jsm/objects/Reflector.js` | the live mirror floor (one extra scene render per frame) |
| `examples/jsm/lights/RectAreaLightUniformsLib.js` | soft panel lights on the wall |
| `examples/jsm/lights/RectAreaLightTexturesLib.js` | LTC tables, required by the above |

Since r16x the build ships in **two halves**: `three.module.js` opens with
`import { … } from './three.core.js'`. Vendoring only the file the importmap
names leaves a 404 on the very first import in the graph, which takes the whole
module down — the page then sits on the boot screen at "LOADING ENGINE" with
nothing in the console but a bare 404, because the classic boot script survives
the module dying. If the app ever hangs there, check the network tab for
`three.core.js` first.

`RectAreaLightTexturesLib.js` is 315 KB uncompressed — the single largest file
after the engine — and exists only to make `RectAreaLight` work. Dropping the
three `RectAreaLight`s in `areaLight()` for `SpotLight`s would remove it, at the
cost of the soft rectangular wash the screen wall throws on the floor.

**Do not "upgrade to match" a host app's three version.** The version is pinned
because the app is designed to run inside an iframe alongside other three
builds; isolation is the point.

To re-vendor, re-fetch each path above from the same base URL and re-run the
import check: every relative import in `examples/jsm` must resolve to a file
that exists here.

## Fonts

Chakra Petch (500/600/700) and JetBrains Mono, latin subset, from Google Fonts,
declared as `@font-face` in `index.html`.

JetBrains Mono is a **single variable file** — the 400 and 700 `@font-face`
rules deliberately point at the same `.woff2`, which is what Google's own CSS
does. Both weights come off the file's weight axis.

These are not decoration. The canvas painters address the families by name
(`ctx.font = '700 12px "JetBrains Mono"'`), so if they fail to load every screen
on the wall silently redraws in a system fallback with different metrics.
`document.fonts.ready` triggers one full repaint to cover the swap.
