# User Skills System

Let anyone create AI "skills" (like DeHub Poster) — prompt templates with brand assets — and surface them in Settings and in the AI assistant.

## What gets built

### 1. Database (new table `user_skills`)

Columns:
- `id` uuid pk
- `creator_wallet_address` text (lowercased)
- `creator_username` text (denormalized for display)
- `name` text — display name
- `slug` text unique — url/id
- `description` text — when to use it
- `trigger_phrases` text[] — phrases that auto-trigger (e.g. "dehub poster", "dehub image")
- `system_prompt` text — the instruction body
- `asset_urls` text[] — uploaded brand assets (logos, references) in `ai-media-uploads`
- `model` text default `'google/gemini-3.1-flash-image'` — assistant uses this when skill activates
- `kind` text default `'image'` — `image | chat` (drives which assistant tool runs)
- `usage_count` int default 0
- `is_featured` bool default false
- `created_at` / `updated_at` timestamptz

RLS (public read, creator-only write):
- SELECT to `anon` + `authenticated` (public library)
- INSERT/UPDATE/DELETE only when `lower(get_request_wallet_address()) = creator_wallet_address` (matches the project's existing wallet-header identity pattern)

Seed row: insert the DeHub Poster skill on migration so it shows up immediately, marked `is_featured = true`, creator = platform wallet.

### 2. Settings → Skills section

New route: `/app/settings` gets a "Skills" tab (or new collapsible card if the page uses cards).

UI:
- Search bar at top (filters by name / description / trigger phrases / creator)
- Filter chips: `All` · `Featured` · `Mine`
- Grid of skill cards (liquid glass, `rounded-2xl`) showing: thumbnail (first asset or generated initials), name, creator @handle, description, trigger phrase preview, usage count
- `+ Create Skill` button (top-right, LiquidGlassBubble2) → opens create modal
- Click a card → detail drawer with full prompt, all assets, "Use in Assistant" button, and Edit/Delete (only for creator)

Create/Edit modal:
- Name, description, trigger phrases (tag input), system prompt (textarea)
- Asset uploader (drag-drop, multi-file, stored in `ai-media-uploads/skills/<skill-id>/`)
- Kind toggle: Image generation / Chat-only
- Save → upserts row, toast confirmation

### 3. Assistant integration (`/app/assistant`)

Two surfaces:

**Auto-trigger**: before sending each user message, lowercase-match the message against every skill's `trigger_phrases`. On strongest match (longest phrase wins), prepend the skill's `system_prompt` and assets to the request, increment `usage_count`, and show a small "Using skill: <name>" chip above the assistant reply.

**Slash menu**: typing `/` in the composer opens a popover with the searchable skill list (same data as Settings). Selecting one inserts a tag (`/dehub-poster`) into the prompt, locks the skill for that turn, and adds the same prompt+assets to the request. Tag is removable.

When a skill of `kind = image` activates, the assistant routes through the existing image-generation edge function with model `google/gemini-3.1-flash-image` and passes the skill's assets as reference images (matches the DeHub Poster skill behavior).

## Files

New:
- `supabase/migrations/<ts>_user_skills.sql`
- `src/hooks/use-user-skills.ts` — list / search / create / update / delete / increment-usage
- `src/components/app/skills/SkillCard.tsx`
- `src/components/app/skills/SkillDetailDrawer.tsx`
- `src/components/app/skills/SkillCreateModal.tsx`
- `src/components/app/skills/SkillsLibrary.tsx` — search + grid (used in Settings and slash menu)
- `src/components/app/assistant/SkillSlashMenu.tsx`
- `src/lib/skills/matchTriggerPhrases.ts`

Edited:
- `src/pages/app/SettingsPage.tsx` — add Skills tab/section mounting `SkillsLibrary`
- Assistant composer (existing file in `src/pages/app/AssistantPage.tsx` or equivalent) — wire slash menu and auto-trigger
- Assistant send handler — apply matched/selected skill prompt + assets, increment usage
- i18n: add `skills.*` keys across locale files (title, search placeholder, create button, kind labels, empty states)

## Behavior details

- Public read, so unauthenticated visitors browsing Settings see the library too (read-only).
- Wallet identity required to create/edit/delete (existing `withWalletHeader` flow).
- Slug auto-generated from name; collisions get a numeric suffix.
- Assets capped at 5 per skill, 5 MB each, png/jpg/webp/svg.
- Usage counter increments server-side via a tiny edge function (or RPC) to avoid client tampering inflating the leaderboard.
- Slash menu and Settings grid share `SkillsLibrary` so search behavior is consistent.

## Out of scope (call out if user wants later)

- Skill versioning / forking
- Per-skill access control (private, paid)
- Rating / reviews
- Categories or tags beyond `featured`
- Editing the DeHub Poster seed skill from the UI (it's owned by the platform wallet)
