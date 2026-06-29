## Why Telegram and Facebook show no preview image

The SSR HTML and OG tags are correct. The broken link is the image format:

- `supabase/functions/affiliate-share-image` returns `image/svg+xml`.
- **Facebook, Telegram, WhatsApp, LinkedIn, Discord, Slack** all reject SVG as an OG image (their crawlers only accept PNG/JPG/GIF/WebP).
- X (Twitter) is the lenient outlier — that's why the X card works and the others don't.
- Hosting: this project uses **Netlify edge functions** (`netlify/edge-functions/ssr-seo.js`), not Cloudflare. That part is fine.

## Fix

Rasterize the SVG to PNG inside the existing edge function. No new infra, no schema changes, no frontend changes.

### Changes

1. **`supabase/functions/affiliate-share-image/index.ts`**
   - Add `resvg-wasm` (`https://esm.sh/@resvg/resvg-wasm@2.6.2`) — runs in Deno, no native deps.
   - Default response: render the SVG → PNG (1200×630), return `Content-Type: image/png`.
   - Keep `?format=svg` as an opt-in for the in-app `/affiliate` preview (lighter, sharper at any size) — flip the `<img>` in `AffiliatePage.tsx` to request `?format=svg` so the dashboard stays snappy.
   - Cache: `public, s-maxage=86400, stale-while-revalidate=604800` on the PNG so social scrapers cache aggressively; keep `no-store` only for `?format=svg&fresh=1` refresh button.

2. **`supabase/functions/ssr-seo/index.ts`**
   - No code change needed — the OG meta already points at `affiliate-share-image?code=...&width=1200&height=630`, which will now be a PNG.
   - Confirm `og:image:type` stays `image/png` (already derived from URL extension; add explicit `.png`-style query handling if needed — easiest: append `&fmt=png` to the OG URL and have the function honor it).

3. **`src/pages/app/AffiliatePage.tsx`**
   - Switch the on-page preview `<img>` to `?format=svg` so the page itself loads the lightweight SVG (faster, crisp on retina). Sharing/OG still uses PNG via the SSR meta tags.

### Post-deploy: bust social caches

Telegram/Facebook cache previews aggressively. After deploy the user must force a re-scrape per platform, or the old (image-less) preview persists for hours/days:

- **Facebook/WhatsApp:** https://developers.facebook.com/tools/debug/ → paste link → "Scrape Again"
- **LinkedIn:** https://www.linkedin.com/post-inspector/
- **Telegram:** message `@WebpageBot` with the link, or append `?v=2` to force a fresh fetch
- **X:** already works

### Verification

- `curl -I "https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/affiliate-share-image?code=CPZQS9G9"` → expect `content-type: image/png`.
- Run the Facebook debugger on `https://dehub.io/r/CPZQS9G9` → expect og:image to load and a card preview to render.
- Re-share in Telegram with `?v=2` → expect image to appear.

## Not changing

- No DB, no auth, no contracts, no frontend logic beyond the one `<img src>` swap.
- No migration off Netlify.
- The SSR function, bot detection, and OG tag structure all stay as-is.