

# Add Sidebar Translation Keys (Topics/Tickers) to All Locales

## Context
The "Topics" and "Tickers" tab labels in the WhatsHappening sidebar widget use `t('sidebar.posts')` and `t('sidebar.tickers')`, plus `sidebar.searches`, `sidebar.noTickersYet`, and `sidebar.noCategoriesYet`. These 5 keys only exist in `en.json` — all other locales fall back to English.

## How the "View All" button worked instantly
It uses `t('commandCentre.viewAll')`, which was **already translated** in every locale from the earlier Command Centre translation pass. No per-file work was needed — it just referenced an existing key.

## Plan
Add these 5 missing keys to the `sidebar` section of **all 17 major locale files** (es, de, fr, ja, tr, da, nl, pl, pt, it, ru, ko, zh, ar, hi, sv, no). The remaining 90+ minor locales will gracefully fall back to English via i18next.

**Keys to add per locale:**
| Key | EN value |
|-----|----------|
| `posts` | Topics |
| `tickers` | Tickers |
| `noTickersYet` | Search $tickers to see them here |
| `noCategoriesYet` | No trending categories yet |
| `searches` | searches |

**Example (German):**
```json
"sidebar": {
  "talkOfTheTown": "Stadtgespräch",
  "nothingTrending": "Noch keine Trends",
  "posts": "Themen",
  "tickers": "Ticker",
  "noTickersYet": "Suche nach $Tickern, um sie hier zu sehen",
  "noCategoriesYet": "Noch keine Trendkategorien",
  "searches": "Suchen",
  "post": "Posten",
  "logOut": "Abmelden",
  "logIn": "Anmelden"
}
```

Single task: update 17 locale files by inserting 5 keys each into their existing `sidebar` objects. No component changes needed — the code already uses these translation keys.

