

# Fix Missing "Close" Translation Key

## Problem
The PPV drawer's Close button uses `t('common.close', 'Close')`, but no locale file has a `close` key in the `common` section. The fallback English string "Close" is always shown regardless of language.

"Pagar" (Pay) is correct -- that's the Spanish translation working as intended.

## Solution
Add the `close` key to the `common` section of all 23 locale files.

## Changes

| Language | File | Value |
|----------|------|-------|
| English | en.json | "Close" |
| Spanish | es.json | "Cerrar" |
| French | fr.json | "Fermer" |
| German | de.json | "Schließen" |
| Italian | it.json | "Chiudi" |
| Portuguese | pt.json | "Fechar" |
| Russian | ru.json | "Закрыть" |
| Chinese | zh.json | "关闭" |
| Japanese | ja.json | "閉じる" |
| Korean | ko.json | "닫기" |
| Arabic | ar.json | "إغلاق" |
| Hindi | hi.json | "बंद करें" |
| Thai | th.json | "ปิด" |
| Vietnamese | vi.json | "Đóng" |
| Dutch | nl.json | "Sluiten" |
| Polish | pl.json | "Zamknij" |
| Turkish | tr.json | "Kapat" |
| Ukrainian | uk.json | "Закрити" |
| Romanian | ro.json | "Închide" |
| Bengali | bn.json | "বন্ধ করুন" |
| Indonesian | id.json | "Tutup" |
| Malay | ms.json | "Tutup" |
| Tagalog | tl.json | "Isara" |

No code changes needed -- the component already references the correct key.

