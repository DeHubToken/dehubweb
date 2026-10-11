# God's Eye View — DeHub Arcade

Upstream: `bilawalsidhu/gods-eye-view` at `591f299d11f38a612629a274463196d57ae3862e` (10 October 2026).
DeHub build source: `DeHubToken/gods-eye-view` at `07b8d5a`.
Cloud build: https://github.com/DeHubToken/gods-eye-view/actions/runs/38168689654

The DeHub arcade bundle workflow builds with `vite.dehub.config.js`, flattens Cesium assets for `/gods-eye-game/`, excludes non-commercial Bhote Koshi imagery and river coordinates, and verifies opaque-origin iframe startup. Both web and native mobile load these same production assets.

Community pins are explicitly opt-in, publicly visible, and stored approximately at the existing 25 km setting. Users may select a point, use device location, or remove their pin. Authenticated writes stay in the DeHub host. Provider-backed upstream features require their respective server services and credentials.

Source licence: `LICENSE-GodsEyeView` at the web repository root. Third-party terms remain in the bundled `THIRD_PARTY_NOTICES.md`.

Public member lookup includes overlapping pins. Cloud browser coverage loads 5,001 pins without credentials on desktop and mobile.
