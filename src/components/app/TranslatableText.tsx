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

import { useState, useMemo, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from 'react';
import { Mail, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Languages, RotateCcw, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useUserLanguage, LANGUAGE_NAMES } from '@/hooks/use-user-language';
import { recordTickerSearch } from '@/lib/ticker-search-tracker';
import { clientNavigate } from '@/lib/client-navigate';

export { LANGUAGE_NAMES };
import { cn } from '@/lib/utils';


// URL regex pattern for detecting links (with or without protocol)
// Only matches common TLDs to avoid false positives like "higher.mp4"
// All 2-letter country-code TLDs + popular generic TLDs (~300+)
// Brand TLDs (.xbox, .toyota, .amazon etc.) excluded to prevent false positives
const CC_TLDS = 'ac|ad|ae|af|ag|al|am|ao|aq|ar|as|at|au|aw|ax|az|ba|bb|bd|be|bf|bg|bh|bi|bj|bm|bn|bo|br|bs|bt|bw|by|bz|ca|cd|cf|cg|ch|ci|ck|cl|cm|cn|co|cr|cu|cv|cw|cx|cy|cz|de|dj|dk|dm|do|dz|ec|ee|eg|er|es|et|fi|fj|fk|fm|fo|fr|ga|gd|ge|gf|gg|gh|gi|gl|gm|gn|gp|gq|gr|gs|gt|gu|gw|gy|hk|hm|hn|hr|ht|hu|id|ie|il|im|in|io|iq|ir|is|it|je|jm|jo|jp|ke|kg|kh|ki|km|kn|kp|kr|kw|ky|kz|la|lb|lc|li|lk|lr|ls|lt|lu|lv|ly|ma|mc|md|me|mg|mh|mk|ml|mm|mn|mo|mp|mq|mr|ms|mt|mu|mv|mw|mx|my|mz|na|nc|ne|nf|ng|ni|nl|no|np|nr|nu|nz|om|pa|pe|pf|pg|ph|pk|pl|pm|pn|pr|ps|pt|pw|py|qa|re|ro|rs|ru|rw|sa|sb|sc|sd|se|sg|sh|si|sk|sl|sm|sn|so|sr|ss|st|sv|sx|sy|sz|tc|td|tf|tg|th|tj|tk|tl|tm|tn|to|tr|tt|tv|tw|tz|ua|ug|us|uy|uz|va|vc|ve|vg|vi|vn|vu|wf|ws|ye|za|zm|zw';
const GENERIC_TLDS = 'com|org|net|info|biz|xyz|app|dev|ai|io|cc|gg|me|tv|ly|fm|sh|digital|store|online|site|tech|world|club|live|space|art|design|social|link|page|one|pro|media|studio|agency|blog|shop|network|land|zone|fund|games|gaming|vc|nft|crypto|dao|eth|web3|defi|music|video|news|chat|cloud|data|host|email|money|bank|pay|finance|trade|market|exchange|casino|bet|poker|win|lol|wtf|meme|cool|guru|ninja|expert|solutions|services|systems|technology|software|computer|science|education|academy|school|university|institute|training|health|medical|dental|fitness|yoga|beauty|fashion|style|clothing|shoes|jewelry|luxury|estate|property|house|apartments|construction|auto|car|bike|travel|flights|holiday|tours|hotel|restaurant|food|pizza|coffee|bar|pub|wine|beer|recipes|photography|photo|camera|gallery|graphics|ink|tattoo|wedding|events|party|flowers|gifts|toys|baby|kids|family|pets|dog|cat|vet|garden|green|eco|solar|energy|organic|farm|legal|law|attorney|consulting|accountant|tax|insurance|loans|credit|investments|capital|ventures|partners|associates|group|team|community|foundation|charity|church|bible|faith|domains|website|web|blog|forum|wiki|directory|guide|tips|how|reviews|best|top|cheap|discount|sale|deals|coupons|free|plus|vip|gold|black|blue|red|pink|green|orange|theater|movie|film|show|radio|audio|stream|tube|band|rocks|dance|dj|actor|place|city|town|country|earth|world|global|international|company|business|corp|inc|ltd|enterprises|holdings|industries|works|careers|jobs|hire|run|fit|life|love|date|singles|camp|center|care|support|help|repair|direct|express|delivery|supply|tools|parts|equipment|kitchen|house|furniture|lighting|glass|flooring|tiles|build|builders|contractors|plumbing|heating|cleaning|security|cctv|codes|dev|engineer|hacker|geek|tech|digital|cyber|net|systems|app|cloud|host|storage|server|mobile|phone|computer|monitor|watch|today|now|news|report|press|media|social|pics|photos|video|click|download|online|email|chat|games|play|game|poker|bet|casino|win|lol|fail|wtf|meme|cool|fun|sexy|xxx|adult|porn|sucks|gripe|icu|rest|cafe|pub|bar|bio|ceo|voting|democrat|republican|forex|trading|rip|memorial|giving|christmas|theater';
const COMMON_TLDS = `${CC_TLDS}|${GENERIC_TLDS}`;

const URL_BOUNDARY_REGEX_SRC = `(?:^|\\s|[\\(\\[<"'])`;

// TLD-restricted regex for non-www links (avoids false positives like "file.mp4")
// Allow dots in hostname to support subdomains like "Kokoroko.lnk.to"
const TLD_URL_CORE_REGEX_SRC = `(?:https?:\\/\\/)?(?:www\\.)?[-a-zA-Z0-9@:%_+~#=]+(?:\\.[-a-zA-Z0-9@:%_+~#=]+)*\\.(?:${COMMON_TLDS})(?:\\.[a-zA-Z]{2,3})?\\b(?:[-a-zA-Z0-9()@:%_+.~#?&\\/=]*)`;

// www. prefix always means a link, regardless of TLD
const WWW_URL_CORE_REGEX_SRC = `(?:https?:\\/\\/)?www\\.[-a-zA-Z0-9@:%_+~#=]+(?:\\.[-a-zA-Z0-9@:%_+~#=]+)*\\.[a-zA-Z]{2,63}\\b(?:[-a-zA-Z0-9()@:%_+.~#?&\\/=]*)`;

// Core URL matcher for tooltips/hrefs, plus boundary-aware version for inline text scanning
const URL_REGEX = new RegExp(`(?:${WWW_URL_CORE_REGEX_SRC})|(?:${TLD_URL_CORE_REGEX_SRC})`, 'gi');
const URL_WITH_BOUNDARY_REGEX = new RegExp(`(?:${URL_BOUNDARY_REGEX_SRC})(?:${URL_REGEX.source})`, 'gi');
const URL_LEADING_BOUNDARY_REGEX = /^[\s(\[<"']+/;

function splitLeadingUrlBoundary(match: string) {
  const leadingBoundary = match.match(URL_LEADING_BOUNDARY_REGEX)?.[0] ?? '';
  return {
    leadingBoundary,
    url: match.slice(leadingBoundary.length),
  };
}

/**
 * Replace URLs in plain text with 🔗 emoji (for use in textarea inputs).
 * Returns the transformed text.
 */
export function replaceLinksWithEmoji(text: string): string {
  return text.replace(URL_WITH_BOUNDARY_REGEX, (match) => {
    const { leadingBoundary } = splitLeadingUrlBoundary(match);
    return `${leadingBoundary}🔗`;
  });
}

interface TranslatableTextProps {
  text: string;
  className?: string;
  as?: 'p' | 'span' | 'div' | 'h1' | 'h2' | 'h3';
  /** When true, hides the translate/show-original controls (text still gets translated if auto-translated via parent) */
  hideControls?: boolean;
}

/**
 * Inline email copy button - shows mail icon with tooltip, copies on click
 */
function EmailCopyInline({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(email).then(() => {
      setCopied(true);
      toast.success('Email copied');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleClick}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors text-xs text-white/70 hover:text-white align-middle"
        >
          {copied ? <Check className="w-3 h-3 text-white" /> : <Mail className="w-3 h-3" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{copied ? 'Copied!' : email}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Renders text with URLs replaced by clickable link emojis and @mentions as profile links
 */
export function renderTextWithLinks(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  
  // Combined regex: match emails, URLs, @mentions, $cashtags, or #hashtags
  const combinedRegex = new RegExp(
      `([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})|(${URL_WITH_BOUNDARY_REGEX.source})|(@[a-zA-Z0-9_][a-zA-Z0-9_.-]*)|(\\$[a-zA-Z]{1,20})|(#[a-zA-Z][a-zA-Z0-9_]*)`,
    'gi'
  );
  
  let match: RegExpExecArray | null;
  
  while ((match = combinedRegex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    
    const fullMatch = match[0];

    // Check if this is an email address
    const isEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(fullMatch);
    
    if (isEmail) {
      parts.push(
        <EmailCopyInline key={`email-${match.index}`} email={fullMatch} />
      );
    } else if (fullMatch.startsWith('@')) {
      // @mention — render as a clickable profile link
      const username = fullMatch.slice(1); // Remove @
      parts.push(
        <a
          key={`mention-${username}-${match.index}`}
          href={`/${username}`}
          className="text-white font-bold hover:underline transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            clientNavigate(`/${username}`);
          }}
          data-no-navigate="true"
        >
          @{username}
        </a>
      );
    } else if (fullMatch.startsWith('$')) {
      // $cashtag — render as clickable bold white, searches on click
      const tag = fullMatch; // e.g. $DHB
      parts.push(
        <a
          key={`cashtag-${tag}-${match.index}`}
          href={`/app/explore?q=${encodeURIComponent(tag)}`}
          className="text-white font-bold hover:underline transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            recordTickerSearch(tag);
            clientNavigate(`/app/explore?q=${encodeURIComponent(tag)}`);
          }}
          data-no-navigate="true"
        >
          {tag}
        </a>
      );
    } else if (fullMatch.startsWith('#')) {
      // #hashtag — render as clickable bold white, navigates to feed filtered by category
      const tag = fullMatch.slice(1).toLowerCase(); // Remove # and lowercase
      parts.push(
        <a
          key={`hashtag-${tag}-${match.index}`}
          href={`/app?category=${encodeURIComponent(tag)}`}
          className="text-white font-bold hover:underline transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            // Dispatch category filter event that HomeFeed listens for
            window.dispatchEvent(new CustomEvent('category-filter-changed', { detail: tag }));
            clientNavigate('/app');
          }}
          data-no-navigate="true"
        >
          {fullMatch}
        </a>
      );
    } else {
      // URL — render as link emoji (skip community links since they get a card embed)
      const { leadingBoundary, url } = splitLeadingUrlBoundary(fullMatch);
      if (leadingBoundary) {
        parts.push(leadingBoundary);
      }
      if (/\/app\/communities\/[a-zA-Z0-9_-]+/.test(url)) {
        // Community link — don't show 🔗, the CommunityLinkEmbed handles it
        lastIndex = combinedRegex.lastIndex;
        continue;
      }
      if (/\/app\/stores\/[a-fA-F0-9-]{8,}/.test(url)) {
        // Store / listing link — handled by StoreLinkEmbed
        lastIndex = combinedRegex.lastIndex;
        continue;
      }
      const href = url.match(/^https?:\/\//i) ? url : `https://${url}`;
      parts.push(
        <a
          key={`${url}-${match.index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center hover:scale-110 transition-transform cursor-pointer relative z-10"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            window.open(href, '_blank', 'noopener,noreferrer');
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          title={url}
          data-no-navigate="true"
        >
          🔗
        </a>
      );
    }
    
    lastIndex = combinedRegex.lastIndex;
  }
  
  // Add remaining text after last match
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  
  return parts.length > 0 ? parts : [text];
}

// Translation cache to avoid repeat API calls. Capped: entries hold full
// translated post bodies and the map lives for the session — unbounded it
// grows with every translated post scrolled past (same idiom as
// lib/language-detection-cache.ts).
const MAX_TRANSLATION_CACHE = 500;
const translationCache = new Map<string, { translated: string; sourceLang: string }>();

// ...and mirrored into localStorage, so it also survives a reload.
//
// Session-only caching was survivable when a translation cost one deliberate
// button press. Now that the feed translates itself, a reload used to mean
// re-requesting every post on screen — which is free for the user but is a
// paid call for us on any post the shared server cache has since evicted, and
// a visible re-flicker either way. Persisting it makes a refresh cost nothing.
const TRANSLATION_STORE_KEY = 'dehub-translation-cache-v1';
// Well under the ~5MB localStorage budget: post bodies are large, and this
// shares that budget with everything else the app keeps there.
const MAX_PERSISTED_TRANSLATIONS = 300;

type CachedTranslation = { translated: string; sourceLang: string };

function loadPersistedTranslations(): void {
  try {
    const raw = localStorage.getItem(TRANSLATION_STORE_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw) as [string, CachedTranslation][];
    if (!Array.isArray(entries)) return;
    // Oldest first, so the in-memory eviction order matches what was stored.
    for (const [key, value] of entries.slice(-MAX_TRANSLATION_CACHE)) {
      if (typeof value?.translated === 'string') translationCache.set(key, value);
    }
  } catch {
    // A corrupt or oversized blob is not worth failing a render over; the cache
    // simply starts empty and refills.
  }
}
loadPersistedTranslations();

// Writing on every hit would serialise the whole map per translated post during
// a scroll. Coalesce into one write per tick instead.
let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const entries = Array.from(translationCache.entries()).slice(-MAX_PERSISTED_TRANSLATIONS);
      localStorage.setItem(TRANSLATION_STORE_KEY, JSON.stringify(entries));
    } catch {
      // Quota exceeded or storage disabled (private mode, embedded webview).
      // The in-memory cache still works for this session.
    }
  }, 1000);
}

function cacheTranslation(key: string, value: CachedTranslation) {
  if (translationCache.size >= MAX_TRANSLATION_CACHE) {
    const oldest = translationCache.keys().next().value;
    if (oldest !== undefined) translationCache.delete(oldest);
  }
  translationCache.set(key, value);
  schedulePersist();
}

// Auto-translate is on unless the reader has turned it off. Stored rather than
// defaulted per session so the choice survives a reload, and read at call time
// rather than cached in a module constant so a change applies without a refresh.
const AUTO_TRANSLATE_KEY = 'dehub-auto-translate';
export function autoTranslateEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_TRANSLATE_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setAutoTranslateEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_TRANSLATE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Storage disabled; the setting just will not persist.
  }
}

// A translation that came back as the text it was given did not translate
// anything — the body was already in the reader's language. Compared loosely
// because providers normalise trailing whitespace.
function isNoOpTranslation(translated: string, original: string): boolean {
  return translated.trim() === original.trim();
}

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

export const SharedTranslationContext = createContext<SharedTranslationContextValue | null>(null);

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

/**
 * Hook to control translation from outside TranslatableText (e.g. a translate button in PostMetadata).
 * Must be used inside a SharedTranslationProvider.
 */
export function useSharedTranslationControl() {
  const ctx = useContext(SharedTranslationContext);
  const [isTranslated, setIsTranslated] = useState(false);

  return {
    isTranslated,
    isLoading: false,
    error: null as string | null,
    handleTranslate: useCallback(() => {
      ctx?.requestTranslate();
      setIsTranslated(true);
    }, [ctx]),
    handleShowOriginal: useCallback(() => {
      ctx?.requestOriginal();
      setIsTranslated(false);
    }, [ctx]),
  };
}

// There is nothing to translate unless the text carries at least one letter in
// some script. A blank, emoji-only or punctuation-only body used to still reach
// translate-text, and MyMemory answers a query like that with an unrelated
// segment out of its shared translation memory — which showed up in the feed as
// a stranger's caption appearing under a post that has no text at all.
const TRANSLATABLE_TEXT_REGEX = /\p{L}/u;

export function hasTranslatableText(text: string | null | undefined): boolean {
  return !!text && TRANSLATABLE_TEXT_REGEX.test(text);
}

// Custom hook for translation logic (shared between components)
// On-demand only: no auto-detection, translate-text is called when user clicks
/**
 * @param auto  Translate without being asked. Public content should; private
 *              content must not — see the auto-translate effect below.
 */
export function useTranslation(text: string, auto: boolean = true) {
  const { language: userLang } = useUserLanguage();
  const [isTranslated, setIsTranslated] = useState(false);
  const [translatedText, setTranslatedText] = useState('');
  const [sourceLang, setSourceLang] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use ref to always get latest userLang in async handlers (avoids stale closures in memo'd components)
  const userLangRef = useRef(userLang);
  useEffect(() => { userLangRef.current = userLang; }, [userLang]);

  // Nothing worth sending to the translator
  const isTooShort = !hasTranslatableText(text);

  const handleTranslate = useCallback(async () => {
    if (!hasTranslatableText(text) || isLoading) return;

    const targetLang = userLangRef.current;
    const cacheKey = `${text}-${targetLang}`;
    
    if (translationCache.has(cacheKey)) {
      const cached = translationCache.get(cacheKey)!;
      if (isNoOpTranslation(cached.translated, text)) {
        setSourceLang(cached.sourceLang);
        return;
      }
      setTranslatedText(cached.translated);
      setSourceLang(cached.sourceLang);
      setIsTranslated(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('[Translate] Invoking translate-text, targetLang:', targetLang, 'text:', text.substring(0, 40));
      const { data, error: fnError } = await supabase.functions.invoke('translate-text', {
        body: { text, targetLang },
      });

      console.log('[Translate] Response:', { data, fnError });

      if (fnError) throw fnError;

      if (!data || !data.translatedText) {
        console.error('[Translate] No translatedText in response:', data);
        setError('Translation unavailable');
        setTimeout(() => setError(null), 3000);
        return;
      }

      const translated = data.translatedText;
      const detected = data.detectedLanguage?.language || 'unknown';

      // Cache either way — a post already in the reader's language is a settled
      // answer, and not storing it means auto-translate asks again on every
      // mount for the rest of the session.
      cacheTranslation(cacheKey, { translated, sourceLang: detected });

      // Nothing changed, so do not claim anything did. The server returns the
      // body untouched when the text is already in the target language, and
      // flipping to the translated state on that put a "Show original" control
      // on a change that never happened — on a feed whose posts match the
      // reader's language, which is most of them, every post looked translated
      // and none of them were.
      if (data.sameLanguage === true || isNoOpTranslation(translated, text)) {
        setSourceLang(detected);
        return;
      }

      setTranslatedText(translated);
      setSourceLang(detected);
      setIsTranslated(true);
    } catch (err) {
      console.error('[Translate] Translation failed:', err);
      setError('Translation unavailable');
      setTimeout(() => setError(null), 3000);
    } finally {
      setIsLoading(false);
    }
  }, [text, isLoading]);

  const handleShowOriginal = useCallback(() => {
    setIsTranslated(false);
  }, []);

  // Auto-translate.
  //
  // Fires once per (text, language) rather than per render: handleTranslate's
  // identity changes when isLoading flips, so keying the effect on it directly
  // would re-enter the moment the request settles.
  //
  // Reading a post the reader cannot read is the failure this removes, so it is
  // on by default and opting out is remembered. A reader who has pressed "show
  // original" on this text is not overridden — autoDone is set either way, and
  // the manual controls stay exactly as they were.
  //
  // Call sites opt out with auto=false, and private content must. Translating
  // sends the body to a third party, and the free tier is MyMemory — a SHARED
  // translation memory, which is why an unrelated segment somebody else once
  // submitted can come back out of it. A reader choosing to translate one
  // message accepts that; doing it silently to every message they receive does
  // not, and a direct message is not ours to upload on their behalf.
  const autoDoneRef = useRef<string | null>(null);
  useEffect(() => {
    if (!auto) return;
    if (!autoTranslateEnabled()) return;
    if (isTooShort) return;

    const key = `${text}-${userLang}`;
    if (autoDoneRef.current === key) return;
    autoDoneRef.current = key;

    void handleTranslate();
    // handleTranslate is intentionally absent: see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, userLang, isTooShort, auto]);

  return {
    userLang,
    isTranslated,
    translatedText,
    sourceLang,
    isLoading,
    error,
    isTooShort,
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
    isTooShort,
    handleTranslate,
    handleShowOriginal,
  } = useTranslation(text);

  // Listen to shared context signals — auto-translate/show-original when a sibling triggers
  const [lastTranslateSignal, setLastTranslateSignal] = useState(0);
  const [lastOriginalSignal, setLastOriginalSignal] = useState(0);

  useEffect(() => {
    if (!sharedCtx) return;
    if (sharedCtx.translateSignal > lastTranslateSignal && !isTranslated && !isTooShort) {
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
  // TranslatableGroup now just renders children — translation controls are in PostMetadata
  return <>{children}</>;
}
