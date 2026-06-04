# Launchpad — Phase 1 (Hidden Build)

Locked decisions:
- **Base pair**: DHB only.
- **Fees**: 1% trade fee → 40% burn, 30% stakers, 20% creator, 10% platform (display only in Phase 1).
- **Graduation threshold**: $42k market cap (DHB-denominated equivalent shown live).
- **Trades**: mocked via edge function; UI fully clickable, no real txs yet.
- **Hidden**: no entry in `AppSidebar`, `MobileBottomNav`, `DesktopSidebar`, command centre, or any menu. Reachable only by typing the URL `/app/launchpad`. No SEO sitemap entry, `<meta name="robots" content="noindex">` on the page.

## Routes (added in `src/App.tsx`, inside `AppLayout`, no nav links)
- `/app/launchpad` → `LaunchpadPage` (board)
- `/app/launchpad/create` → `LaunchpadCreatePage` (3-step flow)
- `/app/launchpad/:mintId` → `LaunchpadCoinPage` (detail + trade + chat)

All lazy-loaded like the other app routes.

## New files
- `src/pages/app/LaunchpadPage.tsx` — hero strip, live ticker tape, filters (New • About to graduate • Trending • Graduated • Mine), sort, search, bento grid of coin cards.
- `src/pages/app/LaunchpadCoinPage.tsx` — chart + trade panel + meta + holders + chat.
- `src/pages/app/LaunchpadCreatePage.tsx` — Identity → Economics → Review.
- `src/components/app/launchpad/CoinCard.tsx` — logo, ticker/name, creator chip, age, **bonding curve progress ring**, mcap, 24h vol, sparkline, holders.
- `src/components/app/launchpad/LiveActivityTicker.tsx` — realtime stream of buys/sells.
- `src/components/app/launchpad/TradePanel.tsx` — buy/sell tabs, DHB amount, slippage (reuse `SlippageSettings`), mock confirm.
- `src/components/app/launchpad/BondingCurveProgress.tsx` — ring + "X / 42,000 mcap to graduation".
- `src/components/app/launchpad/FeeBreakdown.tsx` — static 40/30/20/10 display.
- `src/hooks/use-launchpad-tokens.ts` — list + filters + realtime.
- `src/hooks/use-launchpad-trades.ts` — per-token trades + realtime + mock buy/sell.
- `src/lib/launchpad/curve.ts` — pure math (price = f(supply), mcap, progress %, derive next price for given DHB in).

All UI uses liquid-glass tokens (`bg-black/60 backdrop-blur-[24px] border-white/10`), white/white-opacity accents only, button rounding standard (`rounded-2xl` primary, `rounded-xl` secondary), Safari 14-safe regex.

## Database (single migration, with GRANTs + RLS)

`launchpad_tokens`
- id uuid pk, chain_id int (8453 or 56), mint_address text unique-nullable (null until graduation), creator_address text, name, symbol, image_url, description, socials jsonb, curve_type text default 'standard', status text default 'bonding' check in ('bonding','graduating','graduated'), supply_sold numeric default 0, market_cap_usd numeric default 0, volume_24h numeric default 0, progress_bps int default 0, graduation_target_usd numeric default 42000, created_at, updated_at.
- RLS: anyone SELECT; INSERT requires `lower(creator_address) = get_request_wallet_address()`; creator UPDATE own.

`launchpad_trades`
- id uuid pk, token_id uuid fk, trader_address text, side text check in ('buy','sell'), dhb_in numeric, tokens_out numeric, price_per_token numeric, tx_hash text nullable, created_at.
- RLS: anyone SELECT; INSERT requires `lower(trader_address) = get_request_wallet_address()` (Phase 1 mock writes via edge function with service role).
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.launchpad_trades;` for live ticker.

Triggers: after-insert on `launchpad_trades` recomputes `supply_sold`, `market_cap_usd`, `volume_24h`, `progress_bps`, flips `status` to `graduating` at ≥ $42k, and `graduated` after graduation handler runs (handler stubbed in Phase 1).

GRANTs:
```
GRANT SELECT ON public.launchpad_tokens TO anon;
GRANT SELECT, INSERT, UPDATE ON public.launchpad_tokens TO authenticated;
GRANT ALL ON public.launchpad_tokens TO service_role;
GRANT SELECT ON public.launchpad_trades TO anon;
GRANT SELECT, INSERT ON public.launchpad_trades TO authenticated;
GRANT ALL ON public.launchpad_trades TO service_role;
```

## Edge function (mock)
`supabase/functions/launchpad-mock-trade/index.ts`
- `verify_jwt = false`, explicit CORS.
- Input: `{ token_id, side, dhb_in, trader_address }`.
- Computes `tokens_out` from `src/lib/launchpad/curve.ts` ported to Deno (shared math file in `supabase/functions/_shared/curve.ts`), inserts a `launchpad_trades` row using service role, returns the new row.
- No real on-chain interaction.

## Bonding-curve math (Phase 1)
Standard pump-fun-style virtual reserves: `price = (virtualDHB + supplySold) / (virtualSupply - supplySold)`. Constants chosen so graduation lands at ~$42k mcap given current DHB price (resolved via existing `getDHBPrice`). Pure module, unit-testable, shared by client + edge function.

## Realtime
- `launchpad_trades` subscription drives `LiveActivityTicker` and the per-coin trades table.
- Optimistic insert on buy/sell click; reconcile when the realtime row arrives.

## What is NOT in this phase
- Real bonding-curve contracts on Base/BNB.
- Uniswap V3 graduation / LP seeding.
- Fee splits actually paid to stakers/creator/burn.
- Cashtag `$TICKER` routing to launchpad coins.
- Embedding launchpad cards inside the home feed.
- Any nav entry or public link.

## Verification
- Visit `/app/launchpad` directly — board renders with seeded mock tokens; no link to it from anywhere in the app.
- Create a coin — appears in board, navigates to detail page.
- Mock-buy a small DHB amount — trade lands in the ticker via realtime, progress ring advances, mcap updates.
- At $42k mcap, status flips to `graduating`, banner shows "Graduation pending (Phase 2)".
- `grep` confirms no `launchpad` string in `AppSidebar`, `MobileBottomNav`, `DesktopSidebar`, `NAV_ITEMS`, `sitemap.xml`.
