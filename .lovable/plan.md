You're right — the app has 108 locale files in `src/i18n/`, not 18.

## What's actually there today

- 108 `.ts` locale files total.
- 104 of them have a `team:` section, but most only contain the shell keys (`title`, `subtitle`, `coreTeam`, `advisors`, `viewLinkedIn`, `readMore`, `showLess`).
- Only 18 locales (en, es, fr, de-adjacent set: el, gsw, fi, th, fa, no, et, bn, ne, lt, acm, lo, lv, ms, mn) have the full member keys: `experience`, `malName/Role/Bio/Exp1-4`, `mikeName/Role/Bio/Exp1-4`, `indiName/Role/Bio/Exp1-3`, `baileyName/Role/Bio/Exp1-3`.
- The other ~86 locales fall back silently to English at runtime for everything below the header.

That's why my last update only touched 18 files — those were the only ones that had `malBio` to replace.

## Plan

1. Extend every `team:` block in the remaining ~86 locale files to include the full member key set, matching the shape used in `es.ts`/`fr.ts`:
   - `experience`
   - `malName`, `malRole`, `malBio`, `malExp1..4`
   - `mikeName`, `mikeRole`, `mikeBio`, `mikeExp1..4`
   - `indiName`, `indiRole`, `indiBio`, `indiExp1..3`
   - `baileyName`, `baileyRole`, `baileyBio`, `baileyExp1..3`
2. Names stay as-is (Mal Jan, Mike Hales, Indi Jay Cammish, Bailey Young). Roles, bios, and experience bullets get translated per locale, keeping `$`, `£`, `m`, `bn`, brand names (Pixcellor, Randstad, Blue Arrow, ITS, Guide Dogs, Rapz, First Class, UFC, TikTok, DeHub) intact.
3. Re-sync the 18 already-populated locales so any drift (older Mal bio text, older Mike/Indi/Bailey copy if it diverged) matches the current English source of truth.
4. Insert the keys right before the closing `}` of each `team:` block via a script so we don't reflow the rest of the file.
5. Spot-check a few RTL/CJK locales (ar, zh, ja, he) after the edit to confirm quotes/apostrophes don't break the TS file.

## Question before I run it

Which translation route do you want?

- A) Machine-translate per locale using the existing English copy (fastest, covers all ~86 locales in one pass, quality varies on long bios).
- B) Leave bios + experience bullets in English everywhere, only translate the short role labels ("Co-founder", "Experience"). Cleaner, no risk of mistranslated brand/finance terms.
- C) English-only fallback intentionally — remove the per-locale member keys from the 18 that have them so every language reads the same authoritative English copy.

Default if you don't pick: A.

## Technical notes

- Edits happen via a Python script that parses each `team: { ... }` block and injects the missing keys before the closing brace; double-quoted strings used so apostrophes in bios (UK's, etc.) don't need escaping.
- No component changes — `Team.tsx` already reads every key via `t('team.<key>')`.
- I'll also re-run the bio sync on the 18 existing files so the latest Mal copy is identical everywhere.
