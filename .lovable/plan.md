
# /work — Jobs & Bounties Marketplace

A new top-level page where anyone can post jobs, anyone can complete them, funds sit in on-chain escrow, and both sides review each other.

## Job types

1. **Shill / Comment** — pay per verified comment on X, YouTube, Instagram, TikTok, etc. Poster sets target URL/topic, price per comment, max slots. Workers submit proof links; poster (or auto-verify where API allows) approves each submission; contract releases per-slot payment.
2. **Clipping** — pay per N views. Poster sets $/1k views, max payout, allowed platforms (TikTok, Instagram, YouTube — X excluded as requested). Worker posts clip + link. Hybrid view tracking: hourly edge-function poll for TikTok oEmbed / IG Graph / YouTube Data v3 where available, manual approval fallback otherwise. Payouts streamed as milestones (e.g. every 1k views).
3. **Contract** — fixed-price gig. Workers apply, poster picks one applicant, funds escrowed on award. Worker submits deliverable; poster approves → release, or opens dispute → admin (your wallet) arbitrates.

## Currency & escrow

- **DHB + USDC on Base.** Poster picks per job.
- **New Solidity contract `DeHubWork.sol`** deployed on Base, holding all funds. Single source of truth for: createJob, fundJob, applyToJob (contract type), awardApplicant, submitProof (logged), approveSubmission (releases pro-rata to worker), openDispute, adminResolve (admin only, splits to worker/refunds poster), cancelJob (only before funding/award).
- **5% platform fee** taken on every release, sent to platform treasury wallet.
- **Only the platform admin wallet** can call `adminResolve`.
- Off-chain Supabase DB mirrors on-chain state for fast UI + indexing the things that don't belong on-chain (proof URLs, descriptions, reviews, view counts, comments).

## Reviews

- 1–5 stars + comment, one per completed job per side.
- Worker can review poster, poster can review worker. Average rating shown on profile + on job cards.
- Only released/completed jobs unlock reviews; disputes don't.

## Pages & UI

- **`/work`** — feed of open jobs with filters (type, currency, budget, platform, sort: newest / highest pay / ending soon). Big "Post a Job" CTA. Liquid-glass cards consistent with the rest of the app.
- **`/work/post`** — multi-step form. Step 1 pick type. Step 2 details (varies by type). Step 3 budget + escrow funding (wallet tx).
- **`/work/:jobId`** — job detail: description, budget, slots filled, applicants (contract) or submissions (shill/clipping), proof feed, action buttons depending on viewer role (poster / applicant / worker / visitor / admin), dispute button, review module after completion.
- **`/work/my`** — tabs: Posted, Working On, Applications, Completed, Disputes.
- **Profile tab** — new "Work" tab on user profile showing jobs posted/completed + reviews + avg rating.
- **Admin disputes view** — `/work/disputes` visible only to your admin wallet, with slider to split funds and "Resolve" button calling `adminResolve`.

Sidebar gets a "Work" link with briefcase icon. Existing `/app/jobs` placeholder is repurposed to redirect into `/work`.

## Tech details

### Smart contract (`contracts/DeHubWork.sol`)
- Solidity 0.8.20, OpenZeppelin `SafeERC20`, `ReentrancyGuard`, `Ownable`.
- Token whitelist (DHB, USDC); per-job currency stored.
- Storage: `Job { id, poster, token, totalAmount, released, jobType, status, worker, slotsTotal, slotsApproved }`, `Submission { jobId, worker, approved }`, `Application { jobId, applicant }`.
- Events for every state change so an edge function indexer can sync to Supabase.

### Supabase tables (new)
- `work_jobs` — mirror of on-chain job + off-chain title/description/tags/cover_image, job_type enum, platform enum, price_per_unit, max_units, target_url, status.
- `work_applications` — for contract jobs.
- `work_submissions` — proof_url, platform, view_count_cached, approval_status, payout_tx_hash.
- `work_reviews` — reviewer_address, reviewee_address, job_id, rating (1-5), comment, role ('poster'|'worker').
- `work_view_snapshots` — submission_id, view_count, polled_at (for clipping milestones).
- `work_disputes` — job_id, opened_by, reason, status, resolution_tx_hash.
- RLS: public read on jobs/submissions/reviews; insert/update gated by `x-wallet-address` header matching the row owner. Admin wallet has full write via `is_admin(wallet)` helper.
- GRANTs for `authenticated` + `service_role` + `anon SELECT` on public-readable tables.

### Edge functions
- `work-indexer` — pulls contract events, syncs to `work_jobs` / `work_submissions`. Triggered by cron every 1 min + webhook from frontend after tx.
- `work-view-poller` — cron every 15 min, iterates active clipping submissions, hits TikTok oEmbed / YouTube Data v3 / Instagram Graph, writes to `work_view_snapshots`, and when a 1k-view milestone is crossed calls `approveSubmission` from a relayer wallet OR flags poster for manual approval if API failed twice in a row.
- `work-admin-resolve` — admin-only, signs `adminResolve` from the admin wallet (server-held key via secret) so disputes can be settled from the UI.

### Frontend
- New folder `src/features/work/` mirroring `src/features/post/` structure: `components/`, `hooks/`, `lib/work-contract.ts`, `types.ts`.
- Hooks: `useWorkJobs`, `useWorkJob`, `useCreateJob`, `useApplyToJob`, `useSubmitProof`, `useApproveSubmission`, `useOpenDispute`, `useWorkReviews`, `useAdminDisputes`.
- All wallet writes via existing wagmi + smart-account stack (matches `useTipPayment` / `usePpvPayment` pattern).
- i18n: all strings added to `common.work.*` keys in all 110 locale files (English source, autotranslated by existing translator script).

### "Make it perfect" extras included
- **Reputation score** computed from completion rate × avg rating, shown as a badge.
- **Slashing on no-show**: contract worker who fails to deliver by deadline → funds auto-refund to poster after a 7-day grace window via cron.
- **Boost slot**: posters can pay extra DHB to pin their job to top of `/work` for 24h (re-uses existing pin pattern).
- **Saved searches + notifications**: workers can subscribe to filters; new matching jobs trigger `custom_notifications`.
- **Anti-spam**: minimum 10 DHB stake required to post a job (refundable on completion, slashed on confirmed fraud disputes).
- **Public dispute log** for transparency: anonymized resolutions visible on a `/work/transparency` page.

## Secrets needed
- `WORK_ADMIN_PRIVATE_KEY` — server-held key for admin resolve + relayer milestone approvals.
- `TIKTOK_API_KEY`, `YOUTUBE_API_KEY`, `INSTAGRAM_GRAPH_TOKEN` — view polling (request via add_secret when we get to that step; TikTok available via existing connector).

## Out of scope (for first ship)
- X/Twitter view tracking (excluded by request).
- Multi-currency beyond DHB + USDC.
- Mobile push notifications (will piggyback on existing browser notifications).
- Subcontracting / team jobs.

## Build order
1. Solidity contract + deploy script (Base testnet first, then mainnet).
2. Supabase tables + RLS + indexer edge function.
3. `/work` feed + job detail + post-job flow.
4. Submission + approval flow + reviews.
5. View-poller cron + milestone auto-release.
6. Admin disputes page + `adminResolve` edge function.
7. Reputation, boost, saved searches, anti-spam stake.

Ship in that order so the marketplace is usable after step 4; the rest layers on.
