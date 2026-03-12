

## Fix Toast Translation: Use Static i18n System (Not Live API)

### Problem
The current toast interceptor calls the `translate-text` edge function (designed for user posts), causing:
- English flash before translation appears
- Unnecessary API costs per toast
- Different system from how all other UI text translates

### How the UI System Actually Works
- **110+ pre-translated JSON files** in `src/i18n/locales/` (e.g., `de.json` has `"logOut": "Abmelden"`)
- Components use `t('key')` from `react-i18next` — returns translated string **instantly, synchronously**
- Language file lazy-loaded once on app start, then all lookups are local
- Zero API calls, zero flicker

### Plan

**1. Add toast keys to `en.json`** under a `toasts` namespace:
```json
"toasts": {
  "saved_to_bookmarks": "Saved to bookmarks",
  "removed_from_bookmarks": "Removed from bookmarks",
  "copied_to_clipboard": "Copied to clipboard",
  "failed_to_send_message": "Failed to send message",
  ...
}
```
This requires scanning the codebase for all `toast.success(...)`, `toast.error(...)` etc. calls to collect every string.

**2. Add translations to all 110+ locale JSON files** — add the `toasts` namespace with translated values to `de.json`, `fr.json`, `es.json`, etc.

**3. Rewrite `src/lib/toast-i18n-interceptor.ts`** to use `i18n.t()`:
- Remove the edge function call, remove the translation cache
- Normalize English toast strings to keys (e.g., `"Saved to bookmarks"` → `toasts.saved_to_bookmarks`)
- Call `i18n.t(key, { defaultValue: originalEnglish })` — instant, synchronous, falls back to English if key missing

**4. No other files change** — all existing `toast.success("Saved to bookmarks")` calls stay exactly as they are. The interceptor handles the translation transparently.

### Result
- Toasts appear in the user's language **immediately** — same as all other UI text
- Zero API calls for toasts
- Falls back to English gracefully if a key is missing

### Files to Change
- `src/lib/toast-i18n-interceptor.ts` — rewrite to use `i18n.t()` instead of edge function
- `src/i18n/locales/en.json` — add `toasts` namespace with all toast strings
- `src/i18n/locales/*.json` (110+ files) — add translated `toasts` namespace to each

