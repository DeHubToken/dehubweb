

## On-Demand Translation (No Auto-Detection)

### What Changes
Remove all automatic language detection API calls. Instead, show a subtle Globe icon button on every post (next to the view count in the metadata row). Translation only happens when the user clicks it.

### How It Works Now (Problem)
Every post with Latin text > 15 chars fires an AI call to `detect-language` to check if it's foreign. For English users viewing English posts, this is wasted money -- the result is always "en" and no translate button appears.

### New Behavior
- A small Globe icon appears on every post in the metadata row (next to timestamp and view count)
- Clicking it calls `translate-text` directly (which already detects source language as part of translation)
- If the text is already in the user's language, the API returns the same text and we show a brief "Already in English" message
- No `detect-language` calls at all -- zero AI cost until the user explicitly asks for translation
- After translating, the Globe becomes a "Show original" button

### Files Changed

**1. `src/components/app/TranslatableText.tsx`**
- Remove `needsAIDetection`, `isDetecting`, `detectNonLatinScript` usage, and the `detect-language` API call from `useTranslation`
- Simplify `useTranslation` to only expose: `handleTranslate`, `handleShowOriginal`, `isTranslated`, `translatedText`, `isLoading`, `error`
- `handleTranslate` calls `translate-text` directly (it already returns `detectedLanguage`)
- If returned translation matches the original text or detected language matches user language, set a "Already in your language" message briefly
- Keep the `SharedTranslationProvider` context working the same way
- `TranslatableText` component still renders translated text when active, but no longer shows its own translate controls (those move to PostMetadata)
- Remove `shouldOfferTranslation` and `isDetecting` -- the button is always available

**2. `src/components/app/cards/PostMetadata.tsx`**
- Replace the complex `translateControl` prop with a simpler interface:
  ```typescript
  translateControl?: {
    isTranslated: boolean;
    isLoading: boolean;
    error: string | null;
    onTranslate: () => void;
    onShowOriginal: () => void;
  };
  ```
- Always render the translate button (subtle Globe icon) after the view count when `translateControl` is provided
- When translated: show RotateCcw "Show original" instead
- When loading: show spinner

**3. `src/components/app/cards/PostCard.tsx`**
- Add `useTranslation` hook for the post text
- Pass `translateControl` to `PostMetadata`
- Pass translated text to `TranslatableText` (or use the hook's state to swap text)

**4. `src/components/app/cards/ImageCard.tsx`**
- Already uses `useTranslation` in `FeedDescription` -- wire it to pass `translateControl` to `PostMetadata`

**5. `src/components/app/cards/VideoCard.tsx`**
- Add `useTranslation` hook, pass `translateControl` to `PostMetadata`

### Cost Impact
- Before: 1 AI call per post per session (detect-language)
- After: 0 AI calls until user clicks translate, then 1 call (translate-text, which also detects language)
- Net savings: ~100% reduction in detection costs for the vast majority of posts

