

## Problem

The Sadri (`sdr.json`) locale file is a **Tier 2 legacy locale** — it has the old, simplified schema for most sections while the English source (`en.json`) has been significantly expanded. When the app renders the settings page (or other pages), it falls back to English for any key missing from `sdr.json`, causing a mix of Sadri and English text.

### Affected Sections (comparing `sdr.json` vs `en.json`)

| Section | sdr.json keys | en.json keys | Status |
|---------|--------------|-------------|--------|
| `settings` | ~30 basic | ~100+ (profile, notifications, privacy, appearance, content, messages, assets) | **Severely incomplete** |
| `common` | ~25 | ~10 (restructured) | Schema mismatch |
| `tip` | legacy format | restructured | Mismatch |
| `postOptions` | legacy format | expanded (queue, watchList, etc.) | Missing keys |
| `filters` | 5 keys | 25+ keys (sort, category, contentType, etc.) | Missing keys |
| `drawers` | 5 keys | 30+ keys (PPV, bounty, gated, etc.) | Severely incomplete |
| `assistant` | legacy 11 keys | 50+ keys (image gen, voice, PIN, etc.) | Severely incomplete |
| `publicChat` | 5 keys | 20+ keys | Missing keys |
| `aiChat` | 6 keys | 15+ keys | Missing keys |
| `wallet` | legacy 14 keys | 40+ keys (send, receive, import, stake) | Severely incomplete |
| `bookmarks` | 4 keys | 20+ keys | Missing keys |
| `notifications` | legacy format | restructured/expanded | Mismatch |
| `leaderboard` | legacy format | restructured/expanded | Mismatch |
| `explorePage` | 7 keys | 55+ keys | Severely incomplete |
| `features` | legacy 8 keys | 35+ keys | Missing keys |
| `profile` | legacy 18 keys | expanded with offer system | Missing keys |
| `buyCoins` | 7 keys | 25+ keys | Missing keys |
| `agents` | 7 keys | 25+ keys | Missing keys |
| `hero` | 4 keys | restructured | Mismatch |
| `creators` | 5 keys | 20+ keys | Missing keys |
| `loginModal` | present | present | OK-ish |
| `governance` | present | present | OK |
| `commandCentre` | present | present | OK |

## Plan

**Rebuild `sdr.json` completely** to match the full `en.json` schema (all ~1063 lines / 33 sections), translating every key into Sadri. This involves:

1. **Rewrite `src/i18n/locales/sdr.json`** — Full translation of all ~1063 lines from `en.json` into Sadri, preserving existing good translations and adding all missing keys with proper Sadri translations.

This is a single large file update. The existing nav, feed, explore, post, create, profile, governance, commandCentre, careers, and a few other sections already have good Sadri translations that will be preserved. Everything else gets translated.

### Other locales potentially affected

This is likely a systemic issue across all Tier 2 locales. However, per the user's question, I'll focus on `sdr.json` first. The same rebuild would need to happen for other legacy locales if they show the same symptoms.

