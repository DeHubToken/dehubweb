/**
 * Translatable Text Component
 * ===========================
 * Wraps text content and offers translation when foreign language detected.
 * Uses hybrid detection: instant regex for non-Latin + AI for Latin scripts.
 * 
 * Two usage patterns:
 * 1. TranslatableText - single text with inline translate control
 * 2. TranslatableGroup - wraps multiple elements, shows single control at end
 */

import { useState, useMemo, useEffect, createContext, useContext, ReactNode } from 'react';
import { Globe, RotateCcw, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useUserLanguage, LANGUAGE_NAMES } from '@/hooks/use-user-language';

// Re-export for convenience
export { LANGUAGE_NAMES };
import { getCachedLanguage, cacheLanguage } from '@/lib/language-detection-cache';
import { cn } from '@/lib/utils';

// URL regex pattern for detecting links (with or without protocol)
// Only matches common TLDs to avoid false positives like "higher.mp4"
const COMMON_TLDS = 'com|org|net|io|ai|co|uk|de|fr|es|it|nl|be|ru|jp|cn|kr|in|au|ca|br|mx|app|dev|xyz|info|biz|me|tv|cc|gg|ly|to|fm|so|is|sh';
const URL_REGEX = new RegExp(
  `(?:https?:\\/\\/)?(?:www\\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\\.(?:${COMMON_TLDS})(?:\\.[a-zA-Z]{2,3})?\\b(?:[-a-zA-Z0-9()@:%_+.~#?&\\/=]*)`,
  'gi'
);

interface TranslatableTextProps {
  text: string;
  className?: string;
  as?: 'p' | 'span' | 'div' | 'h1' | 'h2' | 'h3';
  /** When true, hides the translate/show-original controls (text still gets translated if auto-translated via parent) */
  hideControls?: boolean;
}

/**
 * Renders text with URLs replaced by clickable link emojis
 */
function renderTextWithLinks(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  const regex = new RegExp(URL_REGEX.source, 'gi');
  
  while ((match = regex.exec(text)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    
    // Add clickable link emoji
    const url = match[0];
    // Ensure URL has protocol for the href
    const href = url.match(/^https?:\/\//i) ? url : `https://${url}`;
    parts.push(
      <a
        key={`${url}-${match.index}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center hover:scale-110 transition-transform"
        onClick={(e) => e.stopPropagation()}
        title={url}
      >
        🔗
      </a>
    );
    
    lastIndex = regex.lastIndex;
  }
  
  // Add remaining text after last URL
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  
  return parts.length > 0 ? parts : [text];
}

// Translation cache to avoid repeat API calls
const translationCache = new Map<string, { translated: string; sourceLang: string }>();

// Minimum text length for AI detection (avoid detecting single words)
const MIN_TEXT_LENGTH_FOR_DETECTION = 15;

// Detect if text contains non-Latin scripts (instant, no API needed)
function detectNonLatinScript(text: string): string | null {
  const patterns: [RegExp, string][] = [
    [/[\u3040-\u309F]/, 'ja'], // Hiragana
    [/[\u30A0-\u30FF]/, 'ja'], // Katakana
    [/[\u4E00-\u9FFF]/, 'zh'], // CJK (Chinese/Japanese)
    [/[\uAC00-\uD7AF]/, 'ko'], // Korean Hangul
    [/[\u0400-\u04FF]/, 'ru'], // Cyrillic
    [/[\u0600-\u06FF]/, 'ar'], // Arabic
    [/[\u0E00-\u0E7F]/, 'th'], // Thai
    [/[\u0900-\u097F]/, 'hi'], // Devanagari (Hindi)
    [/[\u0590-\u05FF]/, 'he'], // Hebrew
    [/[\u1100-\u11FF]/, 'ko'], // Korean Jamo
    [/[\u0370-\u03FF]/, 'el'], // Greek
  ];

  for (const [pattern, lang] of patterns) {
    if (pattern.test(text)) {
      return lang;
    }
  }

  return null;
}

// Check if text is predominantly ASCII/Latin
function isLatinText(text: string): boolean {
  const latinChars = text.match(/[a-zA-Z]/g)?.length || 0;
  const totalChars = text.replace(/\s/g, '').length;
  return totalChars > 0 && latinChars / totalChars > 0.7;
}

// Minimum length to even consider translation (skip very short text)
const MIN_TEXT_LENGTH_FOR_TRANSLATION = 10;

// Custom hook for translation logic (shared between components)
export function useTranslation(text: string) {
  const { language: userLang } = useUserLanguage();
  const [isTranslated, setIsTranslated] = useState(false);
  const [translatedText, setTranslatedText] = useState('');
  const [sourceLang, setSourceLang] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  // Early exit for very short text - skip all detection
  const isTooShort = text.length < MIN_TEXT_LENGTH_FOR_TRANSLATION;

  const nonLatinLang = useMemo(() => {
    if (isTooShort) return null;
    return detectNonLatinScript(text);
  }, [text, isTooShort]);
  
  const needsAIDetection = useMemo(() => {
    if (isTooShort) return false;
    if (nonLatinLang) return false;
    if (text.length < MIN_TEXT_LENGTH_FOR_DETECTION) return false;
    if (!isLatinText(text)) return false;
    return true;
  }, [text, nonLatinLang, isTooShort]);

  useEffect(() => {
    if (!needsAIDetection) {
      setDetectedLang(nonLatinLang);
      return;
    }

    const cached = getCachedLanguage(text);
    if (cached) {
      setDetectedLang(cached);
      return;
    }

    const detectLanguage = async () => {
      setIsDetecting(true);
      try {
        const { data, error: fnError } = await supabase.functions.invoke('detect-language', {
          body: { text: text.slice(0, 100) },
        });

        if (fnError) {
          console.error('Language detection error:', fnError);
          setDetectedLang(null);
          return;
        }

        const lang = data?.language || null;
        if (lang) {
          cacheLanguage(text, lang);
          setDetectedLang(lang);
        }
      } catch (err) {
        console.error('Language detection failed:', err);
        setDetectedLang(null);
      } finally {
        setIsDetecting(false);
      }
    };

    detectLanguage();
  }, [text, needsAIDetection, nonLatinLang]);

  const shouldOfferTranslation = useMemo(() => {
    const langToCheck = detectedLang || nonLatinLang;
    if (!langToCheck) return false;
    if (langToCheck === userLang) return false;
    if (userLang === 'en' && langToCheck === 'en') return false;
    return true;
  }, [detectedLang, nonLatinLang, userLang]);

  const handleTranslate = async () => {
    const cacheKey = `${text}-${userLang}`;
    
    if (translationCache.has(cacheKey)) {
      const cached = translationCache.get(cacheKey)!;
      setTranslatedText(cached.translated);
      setSourceLang(cached.sourceLang);
      setIsTranslated(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('translate-text', {
        body: { text, targetLang: userLang },
      });

      if (fnError) throw fnError;

      const translated = data.translatedText;
      const detected = data.detectedLanguage?.language || detectedLang || nonLatinLang || 'unknown';

      translationCache.set(cacheKey, { translated, sourceLang: detected });

      setTranslatedText(translated);
      setSourceLang(detected);
      setIsTranslated(true);
    } catch (err) {
      console.error('Translation failed:', err);
      setError('Translation unavailable');
    } finally {
      setIsLoading(false);
    }
  };

  const handleShowOriginal = () => {
    setIsTranslated(false);
  };

  return {
    userLang,
    isTranslated,
    translatedText,
    sourceLang,
    isLoading,
    error,
    isDetecting,
    shouldOfferTranslation,
    handleTranslate,
    handleShowOriginal,
  };
}

/**
 * TranslatableText - single text element with translation
 */
export function TranslatableText({ 
  text, 
  className,
  as: Component = 'span',
  hideControls = false,
}: TranslatableTextProps) {
  const {
    userLang,
    isTranslated,
    translatedText,
    sourceLang,
    isLoading,
    error,
    isDetecting,
    shouldOfferTranslation,
    handleTranslate,
    handleShowOriginal,
  } = useTranslation(text);

  // If no translation needed and not detecting, just render the text
  if (!shouldOfferTranslation && !isDetecting) {
    return <Component className={cn("whitespace-pre-wrap", className)}>{renderTextWithLinks(text)}</Component>;
  }

  const renderTranslateControl = () => {
    if (isTranslated) {
      return (
        <button
          onClick={handleShowOriginal}
          className="flex items-center gap-1.5 text-xs text-white hover:text-zinc-300 transition-colors mt-1"
        >
          <RotateCcw className="w-3 h-3" />
          <span>
            Translated from {LANGUAGE_NAMES[sourceLang || ''] || sourceLang}
            {' • Show original'}
          </span>
        </button>
      );
    }

    if (isDetecting) {
      return (
        <span className="flex items-center gap-1.5 text-xs text-zinc-600 mt-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Detecting language...</span>
        </span>
      );
    }

    if (shouldOfferTranslation) {
      return (
        <button
          onClick={handleTranslate}
          disabled={isLoading}
          className={cn(
            "flex items-center gap-1.5 text-xs transition-colors mt-1",
            error 
              ? "text-red-400" 
              : "text-white hover:text-zinc-300"
          )}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Translating...</span>
            </>
          ) : error ? (
            <span>{error}</span>
          ) : (
            <>
              <Globe className="w-3 h-3" />
              <span>Translate to {LANGUAGE_NAMES[userLang] || 'English'}</span>
            </>
          )}
        </button>
      );
    }

    return null;
  };

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div
          key={isTranslated ? 'translated' : 'original'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <Component className={cn("whitespace-pre-wrap", className)}>
            {renderTextWithLinks(isTranslated ? translatedText : text)}
          </Component>
        </motion.div>
      </AnimatePresence>
      {!hideControls && renderTranslateControl()}
    </>
  );
}

/**
 * TranslatableGroup - wraps multiple text elements with a single translate control at the end
 * Use when you have title + description that should share one translate button
 */
interface TranslatableGroupProps {
  /** Combined text for language detection (e.g., title + " " + description) */
  text: string;
  children: ReactNode;
}

export function TranslatableGroup({ text, children }: TranslatableGroupProps) {
  const {
    userLang,
    isLoading,
    error,
    isDetecting,
    shouldOfferTranslation,
    handleTranslate,
  } = useTranslation(text);

  // If no translation needed, just render children
  if (!shouldOfferTranslation && !isDetecting) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      {isDetecting ? (
        <span className="flex items-center gap-1.5 text-xs text-zinc-600 mt-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Detecting language...</span>
        </span>
      ) : shouldOfferTranslation ? (
        <button
          onClick={handleTranslate}
          disabled={isLoading}
          className={cn(
            "flex items-center gap-1.5 text-xs transition-colors mt-1",
            error 
              ? "text-red-400" 
              : "text-white hover:text-zinc-300"
          )}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Translating...</span>
            </>
          ) : error ? (
            <span>{error}</span>
          ) : (
            <>
              <Globe className="w-3 h-3" />
              <span>Translate to {LANGUAGE_NAMES[userLang] || 'English'}</span>
            </>
          )}
        </button>
      ) : null}
    </>
  );
}
