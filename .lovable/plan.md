
What I got wrong is this: I’ve been deduplicating actors by text labels (display names / handles), not by a stable user identity. In your case, the same person is arriving under two different name forms, so Alcazar gets counted into two avatar slots, and one real user gets pushed out of the first 3.

Plan to fix it properly:

1) Unify actor identity before rendering
- Build one canonical identity key per actor (priority: resolved username from enrichment, then normalized username text).
- Use that identity key everywhere (grid, drawer, link resolution), not raw display strings.

2) Fix dedupe logic in `buildCanonicalActors`
- Deduplicate by canonical identity key, not `latestActorNames` raw key.
- When appending primary actor fallback, skip if that canonical identity already exists.
- This prevents “same person twice with different casing/name forms.”

3) Fix enrichment cache key mismatch
- Enrichment currently stores username keys with lowercase only, while render lookup uses normalized usernames.
- Store and read usernames using the exact same normalization function (strip `@`, trim, lowercase).
- Keep aliases (raw + normalized) pointing to same enriched record so mixed API formats still resolve to one user.

4) Use resolved identity for avatar lookup
- In grid and drawer avatar lookup, prefer `resolvedUsername` identity first, then fallback keys.
- This prevents one slot showing a fallback initial while another slot shows the same user’s real avatar.

5) Enforce unique grid slots
- Before rendering the 2x2 grid, create a strict unique actor list by canonical identity and slice first 3 unique users.
- This guarantees “3 different users” means 3 different avatar identities, always.

6) Validate against your exact failure case
- Re-test the notification row with “sherdil and 3 others”.
- Confirm the three avatar slots are three unique users (no duplicate Alcazar).
- Confirm drawer list also has unique users and matching profile links.

Technical details
- Files to update:
  - `src/pages/app/NotificationsPage.tsx`
- Key functions/areas:
  - `buildCanonicalActors(...)`
  - aggregated username enrichment effect (`uniqueNewUsernames`, keying into `moduleEnrichedKeys` / `enrichedAvatars`)
  - grid avatar resolver (`findAvatarByUsername` usage)
  - drawer actor avatar/link rendering
- Core invariant after fix:
  - Every rendered actor object has one canonical identity key.
  - UI dedupe is based on canonical identity key only, never raw display text.
