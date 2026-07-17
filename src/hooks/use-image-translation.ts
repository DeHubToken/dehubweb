/**
 * Image Translation Hook
 * ======================
 * Manages OCR + translation state for images using the translate-image edge function.
 * Includes client-side caching via sessionStorage.
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TranslationResult {
  extractedText: string;
  translatedText: string;
  sourceLang: string;
  hasText: boolean;
}

interface UseImageTranslationReturn {
  isLoading: boolean;
  error: string | null;
  result: TranslationResult | null;
  translateImage: (imageUrl: string, targetLang?: string) => Promise<TranslationResult | null>;
  clearResult: () => void;
}

// Client-side cache key prefix
const CACHE_PREFIX = 'img-translate:';

function getCacheKey(imageUrl: string, targetLang: string): string {
  // Use a hash-like approach for the URL to keep key short
  const urlHash = imageUrl.slice(-50).replace(/[^a-zA-Z0-9]/g, '_');
  return `${CACHE_PREFIX}${urlHash}:${targetLang}`;
}

function getFromSessionCache(key: string): TranslationResult | null {
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Ignore cache errors
  }
  return null;
}

function setSessionCache(key: string, value: TranslationResult): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore cache errors (quota exceeded, etc.)
  }
}

export function useImageTranslation(): UseImageTranslationReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TranslationResult | null>(null);

  const translateImage = useCallback(async (
    imageUrl: string,
    targetLang?: string
  ): Promise<TranslationResult | null> => {
    // Get user's language preference
    const userLang = targetLang || navigator.language.split('-')[0] || 'en';
    
    // Check client cache first
    const cacheKey = getCacheKey(imageUrl, userLang);
    const cached = getFromSessionCache(cacheKey);
    if (cached) {
      setResult(cached);
      setError(null);
      return cached;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('translate-image', {
        body: { imageUrl, targetLang: userLang },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Translation failed');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const translationResult: TranslationResult = {
        extractedText: data.extractedText || '',
        translatedText: data.translatedText || '',
        sourceLang: data.sourceLang || '',
        hasText: data.hasText ?? false,
      };

      // Cache the result
      setSessionCache(cacheKey, translationResult);
      
      setResult(translationResult);
      return translationResult;

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to translate image';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    result,
    translateImage,
    clearResult,
  };
}

// Export language names for UI display
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
  hi: 'Hindi',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  vi: 'Vietnamese',
  th: 'Thai',
  id: 'Indonesian',
  uk: 'Ukrainian',
  sv: 'Swedish',
  da: 'Danish',
  fi: 'Finnish',
  no: 'Norwegian',
  cs: 'Czech',
  el: 'Greek',
  he: 'Hebrew',
  ro: 'Romanian',
  hu: 'Hungarian',
};
