
# Image Translation (OCR + Translate) Implementation Plan

## Overview
Add the ability to extract text from images using Gemini's vision capabilities and translate it to the user's language. This feature will integrate seamlessly with the existing translation infrastructure.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface                           │
├─────────────────────────────────────────────────────────────────┤
│  ImageCard / FullscreenImageViewer                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  "Translate Image" button (Globe + Languages icon)      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ImageTranslationOverlay (extracted + translated text)  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Edge Function Layer                          │
├─────────────────────────────────────────────────────────────────┤
│  supabase/functions/translate-image/index.ts                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. Receive image URL                                    │   │
│  │  2. Call Gemini Vision API for OCR                       │   │
│  │  3. Detect source language (reuse existing logic)        │   │
│  │  4. Translate extracted text to target language          │   │
│  │  5. Return structured response                           │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Lovable AI Gateway                           │
├─────────────────────────────────────────────────────────────────┤
│  google/gemini-2.5-flash (vision + text capabilities)          │
│  - OCR: Extract text from image with position data              │
│  - Translation: Convert to target language                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Create the Edge Function

**File:** `supabase/functions/translate-image/index.ts`

The edge function will:
1. Accept an image URL and target language
2. Use Gemini 2.5 Flash's vision capabilities to extract text from the image
3. Detect the source language of extracted text
4. Translate the text to the user's language
5. Return both extracted and translated text

**Key Features:**
- Uses `LOVABLE_API_KEY` (pre-configured, no user setup needed)
- Model: `google/gemini-2.5-flash` (supports vision + text)
- Caches results to avoid repeated API calls for same image
- Returns structured data with original text, translated text, and source language

**Request/Response Format:**
```typescript
// Request
{
  imageUrl: string;      // URL of image to translate
  targetLang: string;    // e.g., "en", "es", "fr"
}

// Response
{
  extractedText: string;      // Original text from image
  translatedText: string;     // Translated text
  sourceLang: string;         // Detected source language
  hasText: boolean;           // Whether image contains text
}
```

---

### Step 2: Create UI Components

**File:** `src/components/app/cards/ImageTranslationSheet.tsx`

A bottom sheet/drawer component that displays:
- Loading state with spinner
- Extracted original text (collapsible)
- Translated text (main display)
- Source language indicator
- "No text found" state for images without text

**File:** `src/hooks/use-image-translation.ts`

Custom hook for image translation logic:
- Manages loading, error, and result states
- Handles caching (sessionStorage) to avoid repeat API calls
- Provides `translateImage(imageUrl, targetLang)` function

---

### Step 3: Integrate into ImageCard

**File:** `src/components/app/cards/ImageCard.tsx` (modify)

Add a "Translate Image" button to the image actions:
- Appears in the dropdown menu or as an overlay button
- Uses the Globe icon with a language indicator
- Triggers the translation sheet when clicked

---

### Step 4: Integrate into FullscreenImageViewer

**File:** `src/components/app/cards/FullscreenImageViewer.tsx` (modify)

Add translation functionality to fullscreen view:
- "Translate" button in the toolbar
- Overlay panel showing translated text
- Toggle between original view and text overlay

---

### Step 5: Update Config

**File:** `supabase/config.toml` (modify)

Add the new edge function configuration:
```toml
[functions.translate-image]
verify_jwt = false
```

---

## File Changes Summary

| File | Action | Purpose |
|------|--------|---------|
| `supabase/functions/translate-image/index.ts` | Create | OCR + Translation edge function |
| `supabase/config.toml` | Modify | Register new edge function |
| `src/hooks/use-image-translation.ts` | Create | Translation state management |
| `src/components/app/cards/ImageTranslationSheet.tsx` | Create | Translation results UI |
| `src/components/app/cards/ImageCard.tsx` | Modify | Add translate button to dropdown |
| `src/components/app/cards/FullscreenImageViewer.tsx` | Modify | Add translate overlay |

---

## Technical Details

### Edge Function Implementation

The translate-image function will use Gemini's multimodal capabilities:

```typescript
// Gemini vision request structure
{
  model: "google/gemini-2.5-flash",
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Extract all visible text from this image. Return ONLY the text..."
        },
        {
          type: "image_url",
          image_url: { url: imageUrl }
        }
      ]
    }
  ]
}
```

### Caching Strategy

1. **Server-side cache:** In-memory Map with LRU eviction (1000 entries)
2. **Client-side cache:** sessionStorage keyed by `imageUrl + targetLang`

### Error Handling

- Image load failures: Show "Unable to process image"
- No text detected: Show "No text found in this image"
- Translation failures: Fall back to showing extracted text only
- Rate limits (429/402): Show appropriate user-facing message

### Cost Optimization

- Use `google/gemini-2.5-flash` (cheapest vision-capable model)
- Truncate very long extracted text before translation
- Cache aggressively to minimize repeat API calls
- Only call API when user explicitly requests translation

---

## User Experience Flow

1. User sees an image with foreign text in feed
2. User taps the "..." menu or long-presses the image
3. User selects "Translate Image"
4. Loading spinner appears (1-3 seconds)
5. Bottom sheet slides up showing:
   - Source language detected
   - Translated text
   - Collapsible original text section
6. User can dismiss sheet and continue browsing
7. Result is cached - instant on repeat views

---

## Accessibility Considerations

- Screen reader support for extracted text
- Sufficient color contrast in translation sheet
- Keyboard navigation support in fullscreen viewer
- Loading state announcements

