

# Add Turkish, Romanian, and 10 More Languages

## Current State
11 languages supported: English, Spanish, French, German, Portuguese, Chinese, Japanese, Korean, Russian, Arabic, Hindi.

## Languages to Add (12 new)
1. **Turkish** (tr) - 80M+ speakers
2. **Romanian** (ro) - 24M+ speakers
3. **Bengali** (bn) - 270M+ speakers
4. **Indonesian** (id) - 200M+ speakers
5. **Vietnamese** (vi) - 85M+ speakers
6. **Thai** (th) - 60M+ speakers
7. **Italian** (it) - 65M+ speakers
8. **Dutch** (nl) - 25M+ speakers
9. **Polish** (pl) - 45M+ speakers
10. **Ukrainian** (uk) - 40M+ speakers
11. **Tagalog/Filipino** (tl) - 28M+ speakers
12. **Malay** (ms) - 80M+ speakers

Total after: **23 languages**

## Changes

### 1. Create 12 new locale JSON files
- `src/i18n/locales/tr.json`, `ro.json`, `bn.json`, `id.json`, `vi.json`, `th.json`, `it.json`, `nl.json`, `pl.json`, `uk.json`, `tl.json`, `ms.json`
- Each file mirrors the exact same key structure as `en.json` (nav, feed, explore, settings, common sections)

### 2. Update `src/i18n/index.ts`
- Import all 12 new locale files
- Add them to the `resources` object
- Add entries to the `SUPPORTED_LANGUAGES` array with code, name, and native name

### 3. Update `src/hooks/use-user-language.ts`
- Add the 12 new language codes to the `LANGUAGE_NAMES` map (some like Turkish, Italian, Dutch, Polish, Ukrainian, Vietnamese, Malay, Romanian are already there; Bengali, Indonesian, Thai, Tagalog need adding)

