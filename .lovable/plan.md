# Characters for Image & Video Prompts

Let users build a personal library of **characters** (a named subject with reference photos + a short persona/style description) and reference them in any image or video prompt with `@name`. The assistant injects the character's reference image(s) into the generation request and prepends the persona to the prompt so the output stays visually consistent across generations.

This is the same pattern Midjourney `--cref`, Higgsfield "Soul ID", and Sora "Cameos" use, adapted to our existing skills/asset pipeline.

## Why a new entity (not just skills)

Skills already store `asset_urls + system_prompt`, but skills are **trigger-phrase tools** ("make a dehub poster"). Characters are **named nouns** referenced *inside* a prompt ("@nova on a rooftop"). Forcing them into skills means:
- One skill = one character (no combining @nova + @rex in one shot).
- Trigger phrases collide with normal prompt text.
- No clean UI for portrait galleries, reference uploads, character cards.

So: dedicated `user_characters` table + a parallel UI, but reuse the storage bucket, paywall bypass logic, and the `image_paths[]` source-image plumbing that's already in `AssistantPage`.

## User flow

1. **Create**: Settings → Characters → "New character". Upload 1–6 reference photos (front, side, expression), give it a name (`Nova`), short description ("28yo, silver hair, leather jacket, cinematic noir lighting"), optional default style.
2. **Reference**: In Assistant, Prompt page, or Composer image/video prompts, type `@` → autocomplete shows characters (same dropdown as user mentions, different color). Pick one or several.
3. **Generate**:
   - **Image (Nano Banana 2 via `edit_image`)** — character reference images are passed as `image_paths[]`, persona prepended to the prompt. Multiple `@chars` merge their refs.
   - **Video** — first reference image is used as `starting_frame` (i2v keeps the look). If multiple characters, we first run a quick `edit_image` "scene composite" to produce a single starting frame, then animate.
4. **Cross-surface**: characters are also available as a `kind: 'character'` source image in the existing image/video paywall modal (a "Use character" picker chip next to "Attach image").

## Data model

New table `public.user_characters`:

- `name` (display, e.g. "Nova")
- `slug` (lowercased, unique per creator, used by `@nova`)
- `description` (persona/style block injected before user prompt)
- `reference_image_urls` (text[], 1–6 entries, public storage URLs)
- `primary_image_url` (text, used as starting_frame for video)
- `visibility` ('private' | 'public') — public ones appear in a future shared library, private by default
- `usage_count`, `is_featured`, timestamps, `creator_wallet_address`, `creator_username`

RLS:
- Read: own characters always; public ones readable by anyone.
- Write/delete: owner only via `x-wallet-address` header (same pattern as `user_skills`).

Storage: reuse `ai-media-uploads` bucket under `characters/{slug}/...`.

## Mention parser

New util `src/lib/characters/parseCharacterMentions.ts`:

- Scans input for `@token` where token matches a character slug owned by the user (or public).
- Returns `{ cleanedPrompt, characters: Character[] }`.
- Reused by Assistant, PromptLanding, and Composer image/video flows.

## Assistant integration (`src/pages/app/AssistantPage.tsx`)

In `handleSend`, after the existing skill matcher:

```ts
const { characters, cleanedPrompt } = parseCharacterMentions(messageToSend, userCharacters);
if (characters.length) {
  const personaBlock = characters.map(c => `${c.name}: ${c.description}`).join('\n');
  effectiveInput = `${personaBlock}\n\nUser request: ${cleanedPrompt}`;
  charSourceImages = await Promise.all(
    characters.flatMap(c => c.reference_image_urls.slice(0, 2)).map(imageUrlToBase64)
  );
}
```

Then thread `charSourceImages` into:
- `handleImageGenerationConfirm` — extend `sourceImage?: string` to `sourceImages?: string[]` so `edit_image` receives all refs.
- `handleVideoGenerationConfirm` — use `characters[0].primary_image_url` as `starting_frame`. If 2+ characters, first call `edit_image` to merge into one composite frame, then animate.

Bypass the DHB image paywall when a character is referenced **and** the user owns it (same exemption pattern as `dehub-poster`), or keep paywall and just attach refs — open question below.

## UI surfaces

- `src/pages/app/CharactersPage.tsx` — grid of character cards (portrait, name, ref count, usage), "New character" CTA. Reachable from Settings → Characters and from Skills Library tab "Characters".
- `src/components/app/characters/CharacterCreateModal.tsx` — upload (drag-drop multi-file, max 6, auto-thumbnail first as primary), name, description, visibility toggle.
- `src/components/app/characters/CharacterMentionDropdown.tsx` — `@` autocomplete in the assistant composer (reuse styling from the existing mentions parser memory).
- `src/components/app/characters/CharacterChip.tsx` — small pill rendered inline in the prompt preview ("Nova ×") so users see what got attached.

Styling: liquid-glass cards (`bg-black/60 backdrop-blur-[24px] border-white/10`), `rounded-2xl` portraits, `rounded-xl` chips, no blue. Matches the existing Skills Library look.

## Technical notes

- `imagegen` accepts up to ~5 input images for `edit_image`; cap combined character refs at 4 to leave room for a user-attached image.
- For video, Seedance/Runway only take one starting frame. The 2+ character composite step uses Nano Banana 2 with a prompt like "Group shot of @nova and @rex standing together, neutral background, character sheet" before animation.
- Cache `imageUrlToBase64` results in a `Map<url, base64>` for the session — characters are reused often, base64 conversion is the slow part.
- Mention parser must not match email-like patterns or existing `@username` user mentions — disambiguate by checking character slugs first, fall back to user mention if no match.

## Open questions for you

1. **Paywall**: Should referencing a character bypass the DHB image paywall (like `dehub-poster`) or still charge? Default proposal: still charge — characters are user content, not branded.
2. **Public character library**: Ship private-only in v1 and add a discover tab later, or include "make public" + browse from day one?
3. **Video starting frame for multi-char**: auto-composite via Nano Banana 2 (slower, ~2s extra) or restrict `@` in video prompts to a single character in v1?
4. **Limits per user**: cap at e.g. 20 characters, 6 refs each, 5 MB per image?
