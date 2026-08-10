# Supabase migrations

Migrations in `supabase/migrations/` are applied to the project by hand. Nothing
in CI runs them, and nothing fails when a merged migration never reaches the
database — so the repo and the deployed schema can disagree indefinitely.

## Why this page exists

`20260804120000_community_admin_system.sql` merged on 6 August 2026 and was
still unapplied on 10 August. It creates the tables and the SECURITY DEFINER
RPCs behind every privileged community action, so in production all of these
were calling functions that did not exist:

promote/demote admin · ban · unban · kick · mute · unmute · approve or reject a
join request · create or revoke an invite link · update community settings ·
delete a community · pin or delete a message · the admin log

The UI reported them as ordinary failures ("failed to create link", "promote
fails"), and two bug reports were filed against the community feature before
anyone looked at the deploy. The code was correct the whole time.

## Checking for drift

```sh
npm run check:db
```

Prints every table and column the migrations create that the database does not
have, grouped by the migration that introduces it, and exits non-zero if there
are any. It needs no privileged credentials — it uses the same publishable anon
key the app ships with, and distinguishes "missing" from "present but blocked by
RLS" through the PostgREST error code.

Run it after applying migrations, and before blaming application code for a
feature that fails only in production.

Two things it deliberately does not check:

- **Functions.** An RPC called with the wrong argument list answers `404
  PGRST202` exactly as a missing one does, so with the anon key the two cannot
  be told apart. Every migration that adds behaviour also adds a table or a
  column, so the check still catches it.
- **Column types, constraints, policies and grants.** Presence only.

## Applying a migration

Apply files in filename order — they are not independent. Then re-run
`npm run check:db` to confirm.

If a migration adds a column the client writes to, ship the client change so it
degrades when the column is absent (see `isMissingColumn` in
`src/hooks/use-feature-requests.ts`), or apply the migration before the deploy.
Given the gap above, assume a new column is not there yet.
