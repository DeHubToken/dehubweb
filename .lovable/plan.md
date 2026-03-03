

## Fix: Translate "Governance" in remaining locale files

### Problem
The `nav.governance` key is left as the English word "Governance" in 5 locale files: `de.json` (German), `it.json` (Italian), `gsw.json` (Swiss German), `pcm.json` (Nigerian Pidgin), and `wes.json` (Cameroon Pidgin). 71 other locales have it properly translated.

### Changes

Update `nav.governance` in these 5 files:

| File | Current | Fix |
|------|---------|-----|
| `de.json` | "Governance" | "Verwaltung" |
| `it.json` | "Governance" | "Governanza" |
| `gsw.json` | "Governance" | "Verwaltig" |
| `pcm.json` | "Governance" | "Rul Dem" |
| `wes.json` | "Governance" | "Govnas" |

Also update the `governance.title` and `governance.governanceBadge` keys in those same files where they're also set to "Governance".

