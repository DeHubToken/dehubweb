

## Issue: "Command" sidebar label not translating

The sidebar navigation item "Command" maps to translation key `nav.command` (defined in `SidebarNavItem.tsx` line 13). However, **this key is missing from all 37 non-English locale files**. Only `en.json` has it. The other locales have `nav.commandCentre` but not `nav.command`, so i18next falls back to the raw key string "nav.command" or the English fallback "Command" depending on config.

## Root cause

When the sidebar label was shortened from "Command Centre" to "Command", the new `nav.command` key was added to `en.json` but never propagated to the other locale files.

## Plan

Add the `"command"` key to the `nav` object in all 37 non-English locale files, with appropriate translations for each language. Here are the translations that will be added:

| File | Value |
|------|-------|
| es.json | "Comando" |
| fr.json | "Commande" |
| de.json | "Kommando" |
| it.json | "Comando" |
| pt.json | "Comando" |
| ru.json | "Команда" |
| zh.json | "指挥" |
| ja.json | "コマンド" |
| ko.json | "명령" |
| ar.json | "القيادة" |
| hi.json | "कमांड" |
| th.json | "คำสั่ง" |
| vi.json | "Lệnh" |
| nl.json | "Commando" |
| pl.json | "Komenda" |
| tr.json | "Komut" |
| uk.json | "Команда" |
| ro.json | "Comandă" |
| id.json | "Perintah" |
| ms.json | "Arahan" |
| bn.json | "কমান্ড" |
| tl.json | "Utos" |
| pcm.json | "Command" |
| ha.json | "Umarni" |
| yo.json | "Aṣẹ" |
| ig.json | "Iwu" |
| arz.json | "القيادة" |
| ary.json | "لقيادة" |
| fa.json | "فرمان" |
| af.json | "Bevel" |
| qu.json | "Kamachiy" |
| am.json | "ትዕዛዝ" |
| sw.json | "Amri" |
| zu.json | "Umyalo" |
| el.json | "Εντολή" |
| gsw.json | "Befehl" |
| hr.json | "Naredba" |

Each file will have the `"command"` key inserted into its existing `nav` object alongside the existing `commandCentre` key. No other changes needed.

