## Goal

Let community owners flip their community between **Private** and **Public** from inside the community page. Members and non-owners never see the control.

## Where it lives

Add a small toggle row in the **About** tab of the community page (`CommunityAbout.tsx`), visible only when `isOwner === true`. The About tab is the natural home — it already shows the Private/Public label, rules, etc. Placing it inline avoids building a whole new Settings screen for one switch.

Layout:
```text
Privacy                          [ Public  ●─── ]
Private communities require approval to join.
```
- Liquid-glass row (`bg-white/[0.04] border border-white/10 rounded-xl`)
- shadcn `Switch` on the right
- Below, helper text that swaps copy based on current state
- A tiny "Saving…" indicator while the mutation is pending

## Data layer

`is_private` column already exists on `communities` and the existing RLS policy *"Creators can update their communities"* already permits this update via the `x-wallet-address` header — **no migration, no policy change needed.**

Add a new mutation in `src/hooks/use-communities.ts`:

- `useUpdateCommunityPrivacy()` — takes `{ communityId, isPrivate }`, runs `supabase.from('communities').update({ is_private }).eq('id', communityId)` wrapped in `withWalletHeader`.
- On success: invalidate `['community', slug]` and `['communities']` so the lock icon on cards and the About label refresh.
- Optimistic update on the `['community', slug]` cache so the switch flips instantly; rollback on error with a toast.

## UX details

- Owner-only: gate the entire row behind `isOwner` passed from `CommunityPage` → `CommunityAbout` (currently not passed — add the prop).
- Confirm when going **Public → Private** with a small inline confirm ("Existing members stay, new joiners will need approval. Continue?"). No confirm needed Private → Public.
- Toast on success: "Community is now Public" / "Community is now Private".
- Disable switch while pending.

## Files touched

- `src/hooks/use-communities.ts` — add `useUpdateCommunityPrivacy` mutation.
- `src/components/app/communities/CommunityAbout.tsx` — add owner-only privacy row + switch + confirm.
- `src/pages/app/CommunityPage.tsx` — pass `isOwner` prop into `<CommunityAbout />`.

## Out of scope

- No new Settings page (can come later if more owner controls pile up).
- No changes to membership status of existing members when flipping privacy.
- No bulk approval UI changes — pending-member flow already exists.
