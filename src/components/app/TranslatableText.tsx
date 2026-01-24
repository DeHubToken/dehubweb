/**
 * Translatable Text Component
 * ===========================
 * Wraps text content and offers translation when foreign language detected.
 * Uses hybrid detection: instant regex for non-Latin + AI for Latin scripts.
 */

import { useState, useMemo, useEffect } from 'react';
import { Globe, RotateCcw, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useUserLanguage, LANGUAGE_NAMES } from '@/hooks/use-user-language';
import { getCachedLanguage, cacheLanguage } from '@/lib/language-detection-cache';
import { cn } from '@/lib/utils';

interface TranslatableTextProps {
  text: string;
  className?: string;
  as?: 'p' | 'span' | 'div' | 'h1' | 'h2' | 'h3';
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

export function TranslatableText({ 
  text, 
  className,
  as: Component = 'span' 
}: TranslatableTextProps) {
  const { language: userLang } = useUserLanguage();
  const [isTranslated, setIsTranslated] = useState(false);
  const [translatedText, setTranslatedText] = useState('');
  const [sourceLang, setSourceLang] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Language detection state
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  // Instant detection for non-Latin scripts
  const nonLatinLang = useMemo(() => detectNonLatinScript(text), [text]);
  
  // Check if text is Latin-based and long enough for detection
  const needsAIDetection = useMemo(() => {
    if (nonLatinLang) return false; // Already detected via regex
    if (text.length < MIN_TEXT_LENGTH_FOR_DETECTION) return false;
    if (!isLatinText(text)) return false;
    return true;
  }, [text, nonLatinLang]);

  // AI-powered language detection for Latin scripts
  useEffect(() => {
    if (!needsAIDetection) {
      setDetectedLang(nonLatinLang);
      return;
    }

    // Check cache first
    const cached = getCachedLanguage(text);
    if (cached) {
      setDetectedLang(cached);
      return;
    }

    // Call AI detection
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

  // Determine if translation should be offered
  const shouldOfferTranslation = useMemo(() => {
    const langToCheck = detectedLang || nonLatinLang;
    if (!langToCheck) return false;
    if (langToCheck === userLang) return false;
    // If user's language is English and detected is English, don't offer
    if (userLang === 'en' && langToCheck === 'en') return false;
    return true;
  }, [detectedLang, nonLatinLang, userLang]);

  const handleTranslate = async () => {
    const cacheKey = `${text}-${userLang}`;
    
    // Check cache first
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

      // Cache the result
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

  // If no translation needed and not detecting, just render the text
  if (!shouldOfferTranslation && !isDetecting) {
    return <Component className={className}>{text}</Component>;
  }

  return (
    <div className="space-y-1">
      <AnimatePresence mode="wait">
        {isTranslated ? (
          <motion.div
            key="translated"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.2 }}
          >
            <Component className={className}>{translatedText}</Component>
            <button
              onClick={handleShowOriginal}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-400 transition-colors mt-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>
                Translated from {LANGUAGE_NAMES[sourceLang || ''] || sourceLang}
                {' • Show original'}
              </span>
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="original"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.2 }}
          >
            <Component className={className}>{text}</Component>
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
                    : "text-blue-400 hover:text-blue-300"
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
