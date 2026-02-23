

## Fix Noun Class Prefix/Suffix Issues in Zulu and Quechua

Two languages have the same "Mga" problem that Tagalog had, where grammatical markers clutter up short UI labels like page titles, nav items, and tab labels.

---

### 1. Zulu (zu) - Noun Class Prefixes

Zulu uses noun class prefixes (Ama-, Izi-, Imi-, Iza-) that make UI labels unnecessarily long and cluttered. These need to be stripped from short labels (titles, nav, tabs) while keeping them in descriptive sentences where they're grammatically needed.

**Changes needed in `src/i18n/locales/zu.json`:**

| Key | Current | Fixed |
|-----|---------|-------|
| nav.notifications | Izaziso | Zaziso or Aziso |
| nav.messages | Imilayezo | Layezo |
| nav.bookmarks | Amabhukimakhi | Bhukimakhi |
| nav.settings | Izilungiselelo | Zilungiselelo |
| nav.docs | Amadokhumenti | Dokhumenti |
| nav.featureRequests | Izicelo | Zicelo |
| nav.careers | Amathuba Omsebenzi | Thuba Lomsebenzi |
| feed.videos | Amavidiyo | Vidiyo |
| feed.images | Izithombe | Zithombe |
| settings.title | Izilungiselelo | Zilungiselelo |
| bookmarks.title | Amabhukimakhi | Bhukimakhi |
| notifications.title | Izaziso | Aziso |
| messages.title | Imilayezo | Layezo |
| features.title | Izicelo Zezici | Zicelo Zezici |
| agents.title | Ama-ejensi e-AI | Ejensi ye-AI |
| leaderboard.title | Ibhodi Yabaholi | Bhodi Yabaholi |

Plus similar fixes throughout explore tabs, feed tabs, and other short labels.

---

### 2. Quechua (qu) - Plural Suffix "-kuna"

Quechua appends "-kuna" as a plural marker on many titles. For short UI labels, the singular/base form is cleaner.

**Changes needed in `src/i18n/locales/qu.json`:**

| Key | Current | Fixed |
|-----|---------|-------|
| nav.notifications | Willaykuna | Willay |
| nav.messages | Willakuykuna | Willakuy |
| nav.bookmarks | Waqaychasqakuna | Waqaychasqa |
| nav.settings | Churanakuna | Churana |
| nav.docs | Qillqakuna | Qillqa |
| nav.featureRequests | Mañakuykuna | Mañakuy |
| nav.careers | Llamkaykuna | Llamkay |
| settings.title | Churanakuna | Churana |
| bookmarks.title | Waqaychasqakuna | Waqaychasqa |
| notifications.title | Willaykuna | Willay |
| messages.title | Willakuykuna | Willakuy |

Plus similar fixes for feed/explore tab labels.

---

### 3. Other Languages - No Issues Found

The remaining 32 languages were checked and are clean:
- **Swahili, Yoruba, Hausa, Igbo** - use proper short labels
- **Arabic, Egyptian Arabic, Moroccan Arabic** - definite article "ال" is standard and expected
- **Amharic, Bengali, Hindi, Persian** - clean labels
- **European languages** - all fine
- **Nigerian Pidgin** - uses English base words, clean

---

### Technical Details

- Edit `src/i18n/locales/zu.json` - strip noun class prefixes from nav, titles, tabs, and short labels
- Edit `src/i18n/locales/qu.json` - strip "-kuna" suffix from nav, titles, tabs, and short labels
- Only modify short UI labels (titles, nav items, tab labels); leave descriptive text and sentences intact where grammar requires the full form

