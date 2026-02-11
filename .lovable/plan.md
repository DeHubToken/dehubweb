

## Reduce Unnecessary Language Detection API Calls

### Problem
Every post with Latin-script text longer than 15 characters triggers an AI call to `detect-language` (using `gemini-2.5-flash-lite`), even when the user's browser language is English and the post is almost certainly English. This wastes Lovable AI credits on calls that just return "en" and never show a translate button.

### Solution
Add an early exit in the `useTranslation` hook: when the user's preferred language is English, skip AI detection for Latin-only text entirely. The translate button will still appear for non-Latin scripts (detected instantly via regex at zero cost). Non-English users will continue to get full AI detection for Latin text.

### File Changed

**src/components/app/TranslatableText.tsx** -- `needsAIDetection` logic (~line 187-193)

Current:
```typescript
const needsAIDetection = useMemo(() => {
  if (isTooShort) return false;
  if (nonLatinLang) return false;
  if (text.length < MIN_TEXT_LENGTH_FOR_DETECTION) return false;
  if (!isLatinText(text)) return false;
  return true;
}, [text, nonLatinLang, isTooShort]);
```

Proposed:
```typescript
const needsAIDetection = useMemo(() => {
  if (isTooShort) return false;
  if (nonLatinLang) return false;
  if (text.length < MIN_TEXT_LENGTH_FOR_DETECTION) return false;
  if (!isLatinText(text)) return false;
  // English users: skip AI detection for Latin text.
  // Non-Latin scripts are already caught above for free.
  if (userLang === 'en') return false;
  return true;
}, [text, nonLatinLang, isTooShort, userLang]);
```

### Impact
- English-speaking users (the majority): zero AI detection calls, saving all those credits
- Non-English users: behavior unchanged, AI still detects Latin languages (French, Spanish, etc.)
- Non-Latin scripts (Chinese, Arabic, Korean, etc.): still detected instantly via regex for all users

### Trade-off
English users will not see a "Translate" button on French/Spanish/German posts (since those are Latin-script and detection is skipped). If this is acceptable given the user base, this is a significant cost saving. If not, we could explore a lighter heuristic (e.g., common word lists) instead of AI.
