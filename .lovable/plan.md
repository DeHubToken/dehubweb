

## Audit Results: Legacy Locale Files

Here's the full breakdown of locale files that have the same problem Sadri had — incomplete schema causing mixed English/native text throughout the UI.

### Tier 3 — Worst (316 lines vs 1063 in English)
Missing ~70% of all UI strings. These are barely functional:

| File | Language | Lines |
|------|----------|-------|
| `rkt.json` | Rangpuri | 316 |
| `skr.json` | Saraiki | 316 |
| `syl.json` | Sylheti | 316 |
| `tts.json` | Thai, Northeastern (Isan) | 316 |

### Tier 2 — Bad (381-425 lines)
Missing ~60% of all UI strings. Same problem Sadri had before the fix:

| File | Language | Lines |
|------|----------|-------|
| `lo.json` | Lao | 381 |
| `hne.json` | Chhattisgarhi | 425 |
| `cjy.json` | Chinese, Jinyu | 425 |
| `mnp.json` | Chinese, Min Bei | 425 |
| `aec.json` | Arabic, Sa'idi | 425 |
| `acw.json` | Arabic, Hijazi | 425 |
| `acm.json` | Arabic, Mesopotamian | 425 |
| `ajp.json` | Arabic, South Levantine | 425 |
| `ayn.json` | Arabic, Sanaani | 425 |
| `dcc.json` | Deccan | 425 |
| `dyu.json` | Jula | 425 |
| `ctg.json` | Chittagonian | 425 |
| `mag.json` | Magahi | 425 |

### Tier 1.5 — Partially Incomplete (585-759 lines)
Missing ~30-45% of strings:

| File | Language | Lines |
|------|----------|-------|
| `pbt.json` | Pashto, Southern | 585 |
| `wes.json` | Pidgin, Cameroon | 585 |
| `om.json` | Oromo | 759 |

### Already OK (880+ lines)
These are mostly complete: `gsw` (921), `pcm` (881), `sa` (1045), `es` (1044), and all other major languages.

**Total: 20 locale files need the same rebuild treatment as Sadri.**

## Plan

Rebuild each file one at a time, in priority order (Tier 3 first since they're the worst), using the same approach as Sadri — rewrite to match the full `en.json` schema with proper translations while preserving existing good translations.

Due to the size of each file (~1063 lines), this will need to be done in batches across multiple messages. Suggested order:

1. **Batch 1**: `rkt.json`, `skr.json`, `syl.json`, `tts.json` (Tier 3)
2. **Batch 2**: `lo.json`, `hne.json`, `cjy.json`, `mnp.json` 
3. **Batch 3**: `aec.json`, `acw.json`, `acm.json`, `ajp.json`, `ayn.json` (Arabic dialects)
4. **Batch 4**: `dcc.json`, `dyu.json`, `ctg.json`, `mag.json`
5. **Batch 5**: `pbt.json`, `wes.json`, `om.json` (Tier 1.5)

Each file gets fully rebuilt to match the 33-section `en.json` structure with native translations for every key.

