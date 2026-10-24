/**
 * Image Translation Hook
 * ======================
 * Manages OCR + translation state for images using the translate-image edge function.
 * Includes client-side caching via sessionStorage.
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { translateCopy as _translateCopy } from '@/i18n/copy';

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

// Same key/order useUserLanguage resolves with, read directly so the hook stays
// free of context. Browser locale is only the fallback: reading it first (as
// this hook used to) meant a user browsing DeHub in Turkish on an English
// Chrome got the OCR text handed back untranslated.
const LANGUAGE_STORAGE_KEY = 'user-preferred-language';

function resolveUserLanguage(): string {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // Private mode / storage disabled — fall through to the browser locale
  }
  return navigator.language?.split('-')[0] || 'en';
}

function getCacheKey(imageUrl: string, targetLang: string): string {
  // Whole URL. Keying on the last 50 characters collapsed any two images whose
  // paths only differ earlier in the string into one entry, which served one
  // post's extracted text as another's.
  return `${CACHE_PREFIX}${imageUrl}:${targetLang}`;
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
    const userLang = targetLang || resolveUserLanguage();
    
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
        throw new Error(fnError.message || _translateCopy("copy.037091068590", { defaultValue: "Translation failed" }));
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
      const message = err instanceof Error ? err.message : _translateCopy("copy.352e9cca701e", { defaultValue: "Failed to translate image" });
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
  get en() { return _translateCopy("copy.ba118bf7fc9c", { defaultValue: "English" }); },
  get es() { return _translateCopy("copy.3411059cb8e0", { defaultValue: "Spanish" }); },
  get fr() { return _translateCopy("copy.7458199fe97a", { defaultValue: "French" }); },
  get de() { return _translateCopy("copy.a659b60d246d", { defaultValue: "German" }); },
  get it() { return _translateCopy("copy.fe1d9c7db376", { defaultValue: "Italian" }); },
  get pt() { return _translateCopy("copy.98b01b890687", { defaultValue: "Portuguese" }); },
  get ru() { return _translateCopy("copy.5bcc40adf6e0", { defaultValue: "Russian" }); },
  get zh() { return _translateCopy("copy.8a9779f42128", { defaultValue: "Chinese" }); },
  get ja() { return _translateCopy("copy.be4ee906d3ef", { defaultValue: "Japanese" }); },
  get ko() { return _translateCopy("copy.04656c6fe003", { defaultValue: "Korean" }); },
  get ar() { return _translateCopy("copy.bafb66f32cd7", { defaultValue: "Arabic" }); },
  get hi() { return _translateCopy("copy.63c2dc51d089", { defaultValue: "Hindi" }); },
  get nl() { return _translateCopy("copy.45f16144c18c", { defaultValue: "Dutch" }); },
  get pl() { return _translateCopy("copy.770341d6e89e", { defaultValue: "Polish" }); },
  get tr() { return _translateCopy("copy.6e7aac65db01", { defaultValue: "Turkish" }); },
  get vi() { return _translateCopy("copy.f25499e9df5c", { defaultValue: "Vietnamese" }); },
  get th() { return _translateCopy("copy.ad705ee19c04", { defaultValue: "Thai" }); },
  get id() { return _translateCopy("copy.4fe1bb67f3b9", { defaultValue: "Indonesian" }); },
  get uk() { return _translateCopy("copy.6f424303fa12", { defaultValue: "Ukrainian" }); },
  get sv() { return _translateCopy("copy.a89a9329d3d4", { defaultValue: "Swedish" }); },
  get da() { return _translateCopy("copy.fe4338ad620c", { defaultValue: "Danish" }); },
  get fi() { return _translateCopy("copy.5710b435f90a", { defaultValue: "Finnish" }); },
  get no() { return _translateCopy("copy.71f4cf5c7a23", { defaultValue: "Norwegian" }); },
  get cs() { return _translateCopy("copy.8b463ea23a7e", { defaultValue: "Czech" }); },
  get el() { return _translateCopy("copy.5c74e5b8100c", { defaultValue: "Greek" }); },
  get he() { return _translateCopy("copy.33e00df2aac3", { defaultValue: "Hebrew" }); },
  get ro() { return _translateCopy("copy.096b861df653", { defaultValue: "Romanian" }); },
  get hu() { return _translateCopy("copy.58801e6907f0", { defaultValue: "Hungarian" }); },
};
