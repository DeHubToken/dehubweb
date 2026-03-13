

# Fix: "Tickers" Left Untranslated in Many Locales

## Problem

The `sidebar.tickers` value is set to the raw English word `"Tickers"` in **28+ locale files** — including French, Spanish, Portuguese, Dutch, Greek, Swedish, Norwegian, Danish, and many others. These should use the proper localized term for stock/crypto ticker symbols in each language.

For example:
- **French**: should be `"Boursiers"`, not `"Tickers"`
- **Spanish**: should be `"Cotizaciones"`
- **Portuguese**: should be `"Cotações"`
- etc.

## Scope

Update `sidebar.tickers` (and the related `sidebar.noTickersYet` which references `$tickers`) in all locale files where the value is currently the untranslated English `"Tickers"`.

**Files affected (~28):** fr, es, pt, el, nl, sv, no, da, af, ca, et, fi, gsw, ha, id, ig, jv, ku, lo, lt, lv, mg, mi, mn, om, plus others from the recent batch that also used raw "Tickers".

Also audit the ~34 remaining files that haven't been updated yet (or, pa, pbt, pcm, qu, rkt, ro, sa, sd, sdr, si, sk, skr, so, sq, sr, sw, syl, ta, te, tg, th, ti, tk, tl, tts, ug, uk, ur, uz, vi, wes, wuu, yo, yue, zu) — these still need the 7 sidebar keys added AND should use properly translated ticker terms.

## Translations

| Language | Code | Tickers Translation |
|----------|------|---------------------|
| French | fr | Boursiers |
| Spanish | es | Cotizaciones |
| Portuguese | pt | Cotações |
| Italian | it | Quotazioni |
| German | de | Kurse |
| Dutch | nl | Koersen |
| Greek | el | Δείκτες |
| Swedish | sv | Kurser |
| Norwegian | no | Kurser |
| Danish | da | Kurser |
| Finnish | fi | Kurssit |
| Estonian | et | Börsisümbolid |
| Lithuanian | lt | Biržos |
| Latvian | lv | Biržas |
| Catalan | ca | Cotitzacions |
| Croatian | hr | Burzovni |
| Hungarian | hu | Árfolyamok |
| Czech | cs | Kotace |
| Bulgarian | bg | Котировки |
| Romanian | ro | Cotații |
| Slovak | sk | Kurzy |
| Turkish | tr | Borsa |
| Indonesian | id | Saham |
| Malay | ms | Saham |
| Javanese | jv | Saham |
| Afrikaans | af | Aandele |
| Swahili | sw | Hisa |
| + all remaining languages with appropriate terms |

## Implementation

1. Fix `sidebar.tickers` in all 28 files that currently have `"Tickers"` untranslated
2. Also fix the corresponding `sidebar.noTickersYet` to use the translated term instead of `$tickers`
3. Complete the remaining ~34 locale files that still need the 7 sidebar keys added — using proper translations from the start

