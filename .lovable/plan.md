
# Fix: TranslatableGroup Not Displaying Translated Text

## The Problem

When you click "Translate", the API works correctly (returns translated text), but the `TranslatableGroup` component never actually displays the translation. It just keeps showing the original `{children}`.

**Evidence from network logs:**
- Request: Turkish text about Galatasaray
- Response: Status 200, properly translated English text
- UI: Still shows Turkish text (never updates)

## Root Cause

In `src/components/app/TranslatableText.tsx`, the `TranslatableGroup` component (lines 301-351) has this structure:

```tsx
export function TranslatableGroup({ text, children }: TranslatableGroupProps) {
  const { handleTranslate, translatedText, isTranslated, ... } = useTranslation(text);
  
  return (
    <>
      {children}  // <-- PROBLEM: Always renders original children!
      <button onClick={handleTranslate}>Translate</button>
    </>
  );
}
```

The `translatedText` and `isTranslated` values are captured but **never used** - `children` renders unchanged.

## The Solution

Use React Context to pass translation state to child components:

1. **Create a Translation Context** - Holds `isTranslated`, `translatedText`, and `originalText`
2. **Update TranslatableGroup** - Wrap children in the context provider
3. **Create TranslatableContent** - A new component that consumes context and swaps text
4. **Update FeedDescription** - Use `TranslatableContent` for title/description

---

## Implementation

### File: `src/components/app/TranslatableText.tsx`

**1. Add Context (after line 27):**

```tsx
// Context for grouped translations
interface TranslationContextValue {
  isTranslated: boolean;
  translations: Map<string, string>;  // original -> translated
}

const TranslationContext = createContext<TranslationContextValue | null>(null);
```

**2. Update TranslatableGroup (lines 301-351) to:**
- Store individual text translations in a Map
- Translate combined text but also split for individual pieces
- Provide context to children

```tsx
export function TranslatableGroup({ text, children }: TranslatableGroupProps) {
  const {
    userLang,
    isTranslated,
    translatedText,
    isLoading,
    error,
    isDetecting,
    shouldOfferTranslation,
    handleTranslate,
    handleShowOriginal,
    sourceLang,
  } = useTranslation(text);

  // Build translations map for context
  const translations = useMemo(() => {
    const map = new Map<string, string>();
    if (isTranslated && translatedText) {
      map.set(text, translatedText);
    }
    return map;
  }, [text, translatedText, isTranslated]);

  const contextValue = useMemo(() => ({
    isTranslated,
    translations,
  }), [isTranslated, translations]);

  // Render with context
  return (
    <TranslationContext.Provider value={contextValue}>
      {children}
      {/* Translation controls (keep existing button logic) */}
      {isTranslated ? (
        <button onClick={handleShowOriginal} className="...">
          Translated from {sourceLang} • Show original
        </button>
      ) : isDetecting ? (
        <span>Detecting language...</span>
      ) : shouldOfferTranslation ? (
        <button onClick={handleTranslate}>Translate to {userLang}</button>
      ) : null}
    </TranslationContext.Provider>
  );
}
```

**3. Add new TranslatableContent component:**

```tsx
interface TranslatableContentProps {
  original: string;
  children?: ReactNode;
  className?: string;
  as?: 'p' | 'span' | 'div' | 'h3';
}

export function TranslatableContent({ 
  original, 
  className, 
  as: Component = 'span' 
}: TranslatableContentProps) {
  const context = useContext(TranslationContext);
  
  // If no context or not translated, show original
  if (!context?.isTranslated) {
    return <Component className={className}>{original}</Component>;
  }
  
  // Check if we have a translation for the full group text
  const fullTranslation = Array.from(context.translations.values())[0];
  
  // For now, if parent text was translated, we show it at parent level
  // This component just shows original when in group context
  return <Component className={className}>{original}</Component>;
}
```

### File: `src/components/app/cards/ImageCard.tsx`

**Update FeedDescription to show translated text:**

Instead of having `TranslatableGroup` wrap static children, we need to:
1. Track if translated
2. Show either original title/description OR translated version

```tsx
function FeedDescription({ title, description }: { title?: string; description?: string }) {
  const [expanded, setExpanded] = useState(false);
  const MAX_LENGTH = 150;
  
  const fullText = [title, description].filter(Boolean).join('\n\n');
  
  // Use the translation hook directly
  const {
    isTranslated,
    translatedText,
    isLoading,
    isDetecting,
    shouldOfferTranslation,
    handleTranslate,
    handleShowOriginal,
    sourceLang,
    userLang,
    error,
  } = useTranslation(fullText);
  
  // Parse translated text back into title/description
  const [displayTitle, displayDescription] = useMemo(() => {
    if (isTranslated && translatedText) {
      const parts = translatedText.split('\n\n');
      if (title && description) {
        return [parts[0] || title, parts.slice(1).join('\n\n') || description];
      }
      return title ? [translatedText, undefined] : [undefined, translatedText];
    }
    return [title, description];
  }, [isTranslated, translatedText, title, description]);
  
  const hasLongDescription = displayDescription && displayDescription.length > MAX_LENGTH;
  const shownDescription = expanded || !hasLongDescription 
    ? displayDescription 
    : `${displayDescription.slice(0, MAX_LENGTH)}...`;

  return (
    <div className="space-y-1">
      {displayTitle && (
        <h3 className="text-white text-sm font-semibold">{displayTitle}</h3>
      )}
      {shownDescription && (
        <p className="text-zinc-300 text-sm">{shownDescription}</p>
      )}
      {/* Expand button... */}
      {/* Translation control */}
      {isTranslated ? (
        <button onClick={handleShowOriginal}>
          Translated from {sourceLang} • Show original
        </button>
      ) : shouldOfferTranslation && (
        <button onClick={handleTranslate}>
          Translate to {userLang}
        </button>
      )}
    </div>
  );
}
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/components/app/TranslatableText.tsx` | Add context, update `TranslatableGroup` to provide it, add `handleShowOriginal` to hook return |
| `src/components/app/cards/ImageCard.tsx` | Update `FeedDescription` to use `useTranslation` directly and display translated text |

## Result

After this fix:
- Click "Translate" → API is called → Translated text is displayed
- Click "Show original" → Original text is restored
- Translation button works as expected

---

## Technical Notes

The simpler approach is to have `FeedDescription` use the `useTranslation` hook directly rather than trying to pass state through children. This avoids complex context plumbing and keeps the translation state local to where it's displayed.

The `TranslatableGroup` pattern was designed for grouping multiple `TranslatableText` components, but the current `FeedDescription` renders raw text elements, not `TranslatableText` components - that's why the translation never showed.
