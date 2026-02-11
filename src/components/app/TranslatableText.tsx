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

import { useState, useMemo, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
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
// All 2-letter country-code TLDs + popular generic TLDs (~300+)
// Brand TLDs (.xbox, .toyota, .amazon etc.) excluded to prevent false positives
const CC_TLDS = 'ac|ad|ae|af|ag|al|am|ao|aq|ar|as|at|au|aw|ax|az|ba|bb|bd|be|bf|bg|bh|bi|bj|bm|bn|bo|br|bs|bt|bw|by|bz|ca|cd|cf|cg|ch|ci|ck|cl|cm|cn|co|cr|cu|cv|cw|cx|cy|cz|de|dj|dk|dm|do|dz|ec|ee|eg|er|es|et|fi|fj|fk|fm|fo|fr|ga|gd|ge|gf|gg|gh|gi|gl|gm|gn|gp|gq|gr|gs|gt|gu|gw|gy|hk|hm|hn|hr|ht|hu|id|ie|il|im|in|io|iq|ir|is|it|je|jm|jo|jp|ke|kg|kh|ki|km|kn|kp|kr|kw|ky|kz|la|lb|lc|li|lk|lr|ls|lt|lu|lv|ly|ma|mc|md|me|mg|mh|mk|ml|mm|mn|mo|mp|mq|mr|ms|mt|mu|mv|mw|mx|my|mz|na|nc|ne|nf|ng|ni|nl|no|np|nr|nu|nz|om|pa|pe|pf|pg|ph|pk|pl|pm|pn|pr|ps|pt|pw|py|qa|re|ro|rs|ru|rw|sa|sb|sc|sd|se|sg|sh|si|sk|sl|sm|sn|so|sr|ss|st|sv|sx|sy|sz|tc|td|tf|tg|th|tj|tk|tl|tm|tn|to|tr|tt|tv|tw|tz|ua|ug|us|uy|uz|va|vc|ve|vg|vi|vn|vu|wf|ws|ye|za|zm|zw';
const GENERIC_TLDS = 'com|org|net|info|biz|xyz|app|dev|ai|io|cc|gg|me|tv|ly|fm|sh|digital|store|online|site|tech|world|club|live|space|art|design|social|link|page|one|pro|media|studio|agency|blog|shop|network|land|zone|fund|games|gaming|vc|nft|crypto|dao|eth|web3|defi|music|video|news|chat|cloud|data|host|email|money|bank|pay|finance|trade|market|exchange|casino|bet|poker|win|lol|wtf|meme|cool|guru|ninja|expert|solutions|services|systems|technology|software|computer|science|education|academy|school|university|institute|training|health|medical|dental|fitness|yoga|beauty|fashion|style|clothing|shoes|jewelry|luxury|estate|property|house|apartments|construction|auto|car|bike|travel|flights|holiday|tours|hotel|restaurant|food|pizza|coffee|bar|pub|wine|beer|recipes|photography|photo|camera|gallery|graphics|ink|tattoo|wedding|events|party|flowers|gifts|toys|baby|kids|family|pets|dog|cat|vet|garden|green|eco|solar|energy|organic|farm|legal|law|attorney|consulting|accountant|tax|insurance|loans|credit|investments|capital|ventures|partners|associates|group|team|community|foundation|charity|church|bible|faith|domains|website|web|blog|forum|wiki|directory|guide|tips|how|reviews|best|top|cheap|discount|sale|deals|coupons|free|plus|vip|gold|black|blue|red|pink|green|orange|theater|movie|film|show|radio|audio|stream|tube|band|rocks|dance|dj|actor|place|city|town|country|earth|world|global|international|company|business|corp|inc|ltd|enterprises|holdings|industries|works|careers|jobs|hire|run|fit|life|love|date|singles|camp|center|care|support|help|repair|direct|express|delivery|supply|tools|parts|equipment|kitchen|house|furniture|lighting|glass|flooring|tiles|build|builders|contractors|plumbing|heating|cleaning|security|cctv|codes|dev|engineer|hacker|geek|tech|digital|cyber|net|systems|app|cloud|host|storage|server|mobile|phone|computer|monitor|watch|today|now|news|report|press|media|social|pics|photos|video|click|download|online|email|chat|games|play|game|poker|bet|casino|win|lol|fail|wtf|meme|cool|fun|sexy|xxx|adult|porn|sucks|gripe|icu|rest|cafe|pub|bar|bio|ceo|voting|democrat|republican|forex|trading|rip|memorial|giving|christmas|theater';
const COMMON_TLDS = `${CC_TLDS}|${GENERIC_TLDS}`;

// TLD-restricted regex for non-www links (avoids false positives like "file.mp4")
const TLD_URL_REGEX_SRC = `(?:https?:\\/\\/)?(?:www\\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\\.(?:${COMMON_TLDS})(?:\\.[a-zA-Z]{2,3})?\\b(?:[-a-zA-Z0-9()@:%_+.~#?&\\/=]*)`;

// www. prefix always means a link, regardless of TLD
const WWW_URL_REGEX_SRC = '(?:https?:\\/\\/)?www\\.[-a-zA-Z0-9@:%._+~#=]{1,256}\\.[a-zA-Z]{2,63}\\b(?:[-a-zA-Z0-9()@:%_+.~#?&\\/=]*)';

// Combined: match www. links (any TLD) OR TLD-restricted links
const URL_REGEX = new RegExp(`(?:${WWW_URL_REGEX_SRC})|(?:${TLD_URL_REGEX_SRC})`, 'gi');

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

// ============================================================================
// Shared Translation Context
// Allows multiple TranslatableText components to sync: when one triggers
// translation, all siblings within the same provider auto-translate too.
// ============================================================================

interface SharedTranslationContextValue {
  /** Increments each time translation is requested */
  translateSignal: number;
  /** Increments each time "show original" is requested */
  originalSignal: number;
  requestTranslate: () => void;
  requestOriginal: () => void;
}

const SharedTranslationContext = createContext<SharedTranslationContextValue | null>(null);

/**
 * Wrap multiple TranslatableText components to share a single translate trigger.
 * When any child with a visible button triggers translation, all siblings translate too.
 */
export function SharedTranslationProvider({ children }: { children: ReactNode }) {
  const [translateSignal, setTranslateSignal] = useState(0);
  const [originalSignal, setOriginalSignal] = useState(0);

  const requestTranslate = useCallback(() => setTranslateSignal(s => s + 1), []);
  const requestOriginal = useCallback(() => setOriginalSignal(s => s + 1), []);

  return (
    <SharedTranslationContext.Provider value={{ translateSignal, originalSignal, requestTranslate, requestOriginal }}>
      {children}
    </SharedTranslationContext.Provider>
  );
}

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
  const sharedCtx = useContext(SharedTranslationContext);
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

  // Listen to shared context signals — auto-translate/show-original when a sibling triggers
  const [lastTranslateSignal, setLastTranslateSignal] = useState(0);
  const [lastOriginalSignal, setLastOriginalSignal] = useState(0);

  useEffect(() => {
    if (!sharedCtx) return;
    if (sharedCtx.translateSignal > lastTranslateSignal && !isTranslated && shouldOfferTranslation) {
      setLastTranslateSignal(sharedCtx.translateSignal);
      handleTranslate();
    }
  }, [sharedCtx?.translateSignal]);

  useEffect(() => {
    if (!sharedCtx) return;
    if (sharedCtx.originalSignal > lastOriginalSignal && isTranslated) {
      setLastOriginalSignal(sharedCtx.originalSignal);
      handleShowOriginal();
    }
  }, [sharedCtx?.originalSignal]);

  // Wrapped handlers that also notify siblings via shared context
  const onTranslate = () => {
    handleTranslate();
    sharedCtx?.requestTranslate();
  };

  const onShowOriginal = () => {
    handleShowOriginal();
    sharedCtx?.requestOriginal();
  };

  // If no translation needed and not detecting, just render the text
  if (!shouldOfferTranslation && !isDetecting) {
    return <Component className={cn("whitespace-pre-wrap", className)}>{renderTextWithLinks(text)}</Component>;
  }

  const renderTranslateControl = () => {
    if (isTranslated) {
      return (
        <button
          onClick={onShowOriginal}
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
          onClick={onTranslate}
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
