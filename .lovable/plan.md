
# /premium — Marketing Page

A pure marketing/landing page at `/premium`. No checkout, no DB writes, no perk gating wired up in this pass — just the public sales surface. Two tiers, clear perks, transparent limits, and a callout that high-tier stakers already get it free.

## Tiers & pricing

**DeHub Extra — $4.99/mo**
- Ad-free feed (no promoted posts, no upgrade banners)
- Background audio & video playback (screen-off, multitask)
- Animated **Extra** badge on profile + comments
- Profile flair: gradient username + 3 exclusive profile themes
- AI Assistant: **500 messages/mo** (vs 50 free)
- Image generation: **150 images/mo**
- Video generation: **20 seconds/mo** of generated video
- Free for **Top 7 staking tiers**

**DeHub Family — $8.99/mo**
- Everything in Extra, for **up to 5 @usernames**
- Owner manages seats from `/app/settings` (future)
- Each seat gets their own quotas (not pooled)
- Free for **Top 4 staking tiers**

Limits are intentionally generous-feeling but capped so margins stay healthy at $4.99. Numbers shown above are placeholders we can tune — they are display-only on this page.

## Page structure

```text
/premium
 ├─ Hero
 │   "DeHub Extra. Less noise. More you."
 │   Two CTAs: [Get Extra] [Get Family]   ← link to /app/settings#premium (placeholder)
 │   Subtext: "Already a top-tier staker? It's on us."
 │
 ├─ Tier comparison (2-column on desktop, stacked on mobile)
 │   Extra card  |  Family card (highlighted "Best value")
 │   Each lists perks with check icons + limit numbers
 │
 ├─ Perks deep-dive (3 feature blocks, alternating left/right)
 │   1. Ad-free + background play  (mock phone screen)
 │   2. AI you can actually rely on (Assistant/image/video icons + quotas)
 │   3. Badge & profile flair  (animated badge preview)
 │
 ├─ Staker reward callout
 │   "Top 7 tiers → Extra free. Top 4 tiers → Family free."
 │   Links to /app/stake
 │
 ├─ FAQ accordion
 │   - What counts as an ad on DeHub?
 │   - Can I switch between Extra and Family?
 │   - How do family seats work?
 │   - What happens if I unstake?
 │   - Can I pay in DHB? (Answer: coming soon)
 │
 └─ Footer CTA band
     "Try DeHub Extra" + secondary "Compare with Family"
```

## Visual direction

- Follows the project's liquid-glass standard: `bg-black/60 backdrop-blur-[24px] border-white/10`, `rounded-2xl` primary CTAs via `LiquidGlassBubble2`.
- No blue. White + white-opacity per project color rule.
- Family card gets a subtle white gradient ring to read as "best value" without breaking the no-blue rule.
- Animated Extra badge: small SVG with a slow shimmer sweep.

## Technical details

- New file: `src/pages/Premium.tsx` (public route, not under `/app`).
- Route registered in `src/App.tsx` alongside other public marketing routes (`/affiliate`, `/work`, `/guide`).
- Add nav entry in `src/constants/app.constants.ts` `NAV_ITEMS` (icon: `Sparkles` or `Crown` from lucide), label `Premium`, path `/premium`.
- Add i18n keys under `common.premium.*` (hero, tiers, perks, faq) — English only in this pass; existing translation pipeline will pick the rest up later, matching the established pattern.
- SEO: `<SEOHead>` with title "DeHub Premium — Extra & Family plans", meta description under 160 chars, single H1, OG image (reuse existing brand asset for now).
- CTAs link to `/app/settings` with a `#premium` hash as a placeholder anchor — real checkout is out of scope here.
- No backend changes. No new tables. No edge functions. No payment provider enabled yet (that comes when we wire checkout).

## Explicitly out of scope (next passes)

- Stripe/DHB checkout
- `premium_subscriptions` table + RLS
- Family seat invite flow
- Perk gating in feed/Assistant/image-gen code paths
- Auto-comping logic that reads staking tier and grants Premium
