

# Bring All Languages to Spanish Parity

## The Problem
Spanish (`es.json`) has **1060 lines** covering every UI section. Out of 109 other languages:
- **0 languages** are at full parity with Spanish
- **1 language** (German) is ~75% there at 777 lines
- **~12 languages** (fr, ja, cs, da, nl, etc.) are 40-60% complete at 450-625 lines
- **~95 languages** are 50-85% complete or worse, with some as low as 51 lines

## Approach

Given the scale (109 files, each needing hundreds of new keys), manually writing each file is not feasible. Instead:

### Strategy: Runtime Injection via AI Translation

1. **Extract the Spanish master key structure** -- parse `es.json` to get every section and key path
2. **Create a build-time/boot-time injection system** similar to the existing `auth-toast-translations.ts` but covering ALL missing sections
3. **Use a backend function** to generate translations for missing keys on-demand using AI (Gemini Flash), caching results to the locale files over time

### Concrete Implementation

1. **Create `src/i18n/fill-missing-translations.ts`** -- At app boot, compare each loaded locale against the English master keys. For any missing key, inject the English fallback immediately (so nothing is blank), then queue a background AI translation request.

2. **Create a backend function `translate-locale-batch`** -- Accepts a batch of English keys + target language, returns translations using Gemini 2.5 Flash. Results get merged into the runtime i18n bundles via `addResourceBundle`.

3. **Prioritize the 13 "major" languages first** (de, fr, ja, zh, ko, ar, hi, pt, it, ru, tr, pl, ro) by pre-generating their missing keys and hardcoding them into a static file, so they never need an API call.

4. **For the remaining ~95 languages**, use the runtime AI translation on first load, with localStorage caching so it only happens once per user.

### File Changes

| File | Change |
|------|--------|
| `src/i18n/fill-missing-translations.ts` | New -- detects missing keys, injects English fallback, queues AI translation |
| `src/i18n/auth-toast-translations.ts` | Expand to include ALL missing toast keys (not just auth ones) |
| `supabase/functions/translate-locale-batch/index.ts` | New edge function -- batch translates missing keys via Gemini Flash |
| `src/i18n/major-locale-patches/*.ts` | Static translation patches for the 13 major languages covering all missing sections |
| `src/main.tsx` | Import the fill-missing system |

### Outcome
- Every language shows fully translated UI immediately (English fallback worst case)
- Major languages get static, human-quality translations baked in
- Minor languages get AI translations cached after first load
- No more per-file manual JSON editing

