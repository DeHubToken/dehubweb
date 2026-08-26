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
import { supabase } from '@/integrations/supabase/client';
import { autoTranslateEnabled, setAutoTranslateEnabled } from '@/lib/auto-translate-setting';
import { useUserLanguage, LANGUAGE_NAMES } from '@/hooks/use-user-language';
import { recordTickerSearch } from '@/lib/ticker-search-tracker';
import { clientNavigate } from '@/lib/client-navigate';
import { parseDehubLink } from '@/lib/dehub-links';

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
  /**
   * Translate without being asked. Defaults to true, which is right for public
   * content and wrong for anything private.
   *
   * This component is the way auto-translate leaks: a call site that opts its
   * own useTranslation call out of auto still gets auto-translation if it
   * renders text through here, because this calls the hook itself. That is
   * exactly what happened to direct-message image captions. Pass auto={false}
   * for private content — and note this component renders no controls of its
   * own, so the call site must provide the manual trigger.
   */
  auto?: boolean;
  /** Post's link was flagged by the Community Alert threshold — border it like a highlighter instead of the plain 🔗 chip. */
  flagged?: boolean;
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
export function renderTextWithLinks(text: string, opts?: { flagged?: boolean }): ReactNode[] {
  const flaggedLinkProps = opts?.flagged
    ? {
        className:
          'inline-flex items-center hover:scale-110 transition-transform cursor-pointer relative z-10 border-2 border-red-500/80 rounded-md px-1 bg-red-500/10',
        titleSuffix: ' — flagged by the community as a possible scam, pending review',
      }
    : null;
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
      // URL — render as link emoji
      const { leadingBoundary, url } = splitLeadingUrlBoundary(fullMatch);
      if (leadingBoundary) {
        parts.push(leadingBoundary);
      }

      // A link to something inside DeHub stays inside DeHub: same 🔗 affordance,
      // but a client navigation instead of a new tab.
      //
      // This used to `continue` for community and store links — dropping them
      // from the rendered text entirely, on the assumption that a card was
      // being rendered alongside. That assumption held on the two surfaces that
      // had the cards and nowhere else, so the same link that carded up in the
      // feed simply vanished from a post title or a comment. Surfaces now strip
      // exactly the links they card (see `useDehubLinks`), which leaves this
      // free to render whatever is left rather than guess.
      const dehubLink = parseDehubLink(url);
      if (dehubLink) {
        parts.push(
          <a
            key={`dehub-${dehubLink.path}-${match.index}`}
            href={dehubLink.path}
            className={flaggedLinkProps?.className ?? "inline-flex items-center hover:scale-110 transition-transform cursor-pointer relative z-10"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              clientNavigate(dehubLink.path);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            title={flaggedLinkProps ? `${url}${flaggedLinkProps.titleSuffix}` : url}
            data-no-navigate="true"
          >
            🔗
          </a>
        );
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
          className={flaggedLinkProps?.className ?? "inline-flex items-center hover:scale-110 transition-transform cursor-pointer relative z-10"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            window.open(href, '_blank', 'noopener,noreferrer');
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          title={flaggedLinkProps ? `${url}${flaggedLinkProps.titleSuffix}` : url}
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

/**
 * Chat variant of {@link renderTextWithLinks}: makes URLs clickable while
 * leaving the link text itself on screen.
 *
 * The feed collapses a URL to a 🔗 affordance, which works there because the
 * link arrives beside a card that already says where it goes. A message has no
 * card. The URL *is* what the sender typed, so swallowing it leaves the
 * recipient a bubble reading "have a look at 🔗" — nothing to read, nothing to
 * copy, and no way to judge a link before opening it. `title` is not the answer
 * either: these bubbles are mostly read on a touchscreen, where nothing hovers.
 *
 * DeHub's own links are usually carded up by the caller before they reach here
 * (see `findDehubLinks` in the DM bubble); any that survive stripping still
 * navigate in-app rather than through a new tab.
 */
export function renderChatTextWithLinks(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  // The matcher the feed already uses, so both surfaces agree on what counts as
  // a link. It carries its own leading boundary (space/bracket/quote), which
  // has to be handed back or the punctuation before a link is eaten with it.
  const urlRegex = new RegExp(URL_WITH_BOUNDARY_REGEX.source, 'gi');

  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const { leadingBoundary, url } = splitLeadingUrlBoundary(match[0]);
    if (leadingBoundary) {
      parts.push(leadingBoundary);
    }

    const dehubLink = parseDehubLink(url);
    const href = dehubLink
      ? dehubLink.path
      : url.match(/^https?:\/\//i)
        ? url
        : `https://${url}`;

    parts.push(
      <a
        key={`chat-link-${match.index}`}
        href={href}
        target={dehubLink ? undefined : '_blank'}
        rel={dehubLink ? undefined : 'noopener noreferrer'}
        className="underline underline-offset-2 decoration-white/40 hover:decoration-white break-all transition-colors"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (dehubLink) {
            clientNavigate(dehubLink.path);
          } else {
            window.open(href, '_blank', 'noopener,noreferrer');
          }
        }}
        // A bubble sits inside a long-press/context-menu surface and the thread
        // itself is drag-scrolled. Without these the gesture layer claims the
        // pointer and the tap never reaches the anchor.
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        title={url}
        data-no-navigate="true"
      >
        {url}
      </a>,
    );

    lastIndex = urlRegex.lastIndex;
  }

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
// v2: v1 was populated while the server could cache a model's refusal prose or
// a wrong-language guess as the "translation", and this cache is checked before
// the server is ever re-asked — so on affected devices the bad text would
// outlive every server-side fix. Bumping the key is the only way to reach it.
const TRANSLATION_STORE_KEY = 'dehub-translation-cache-v2';
const LEGACY_TRANSLATION_STORE_KEYS = ['dehub-translation-cache-v1'];
// Well under the ~5MB localStorage budget: post bodies are large, and this
// shares that budget with everything else the app keeps there.
const MAX_PERSISTED_TRANSLATIONS = 300;

type CachedTranslation = { translated: string; sourceLang: string };

function loadPersistedTranslations(): void {
  try {
    // Poisoned generations don't deserve the storage they sit in.
    for (const key of LEGACY_TRANSLATION_STORE_KEYS) localStorage.removeItem(key);
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

// The auto-translate setting now lives in lib/auto-translate-setting, so the
// new-version toast can read it without dragging this module onto the entry
// chunk. Re-exported here because this was its import path.
export { autoTranslateEnabled, setAutoTranslateEnabled };

// A translation that came back as the text it was given did not translate
// anything — the body was already in the reader's language. Compared loosely
// because providers normalise trailing whitespace.
function isNoOpTranslation(translated: string, original: string): boolean {
  return translated.trim() === original.trim();
}

// Provider junk that arrives dressed as a successful translation: MyMemory
// answers some short queries out of its shared translation memory with API
// boilerplate somebody else once fed it, and older server versions cached that
// prose as the post's "translation" — permanently, on both sides. Anything
// matching this is refused wherever it surfaces: fresh from the network, out of
// this device's persisted cache, and (server-side) out of the shared table.
const TRANSLATION_GARBAGE_REGEX =
  /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID LANGUAGE PAIR|UNSUPPORTED LANGUAGE|API KEY|PLEASE CONTACT|INTERNAL SERVER|SERVICE UNAVAILABLE/i;

function looksLikeTranslationGarbage(translated: string): boolean {
  return TRANSLATION_GARBAGE_REGEX.test(translated);
}

// ============================================================================
// Auto-translate scheduling
//
// Auto-translation decorates the page; it must never compete with loading it.
// Left unscheduled, every card that mounts fires its own request during the
// initial render pass, so opening the feed meant a dozen-plus translate calls
// racing the feed query, the avatars and the media for the same connections —
// on a phone that is most of the reason the page felt slow to appear.
//
// So nothing queued here starts until the page has actually finished loading,
// and after that only a few run at a time, during idle. Anything the reader
// asks for by pressing the button skips this entirely and goes out immediately.
// ============================================================================

const AUTO_TRANSLATE_CONCURRENCY = 3;

type QueuedJob = { run: () => Promise<unknown>; cancelled: boolean };

const autoQueue: QueuedJob[] = [];
let inFlightAuto = 0;
let drainScheduled = false;

let pageLoaded = typeof document === 'undefined' || document.readyState === 'complete';
if (!pageLoaded) {
  window.addEventListener('load', () => {
    pageLoaded = true;
    drainAutoQueue();
  }, { once: true });
}

function whenIdle(cb: () => void): void {
  const ric = (window as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void })
    .requestIdleCallback;
  // The timeout matters: on a page that never goes idle, translations should
  // still land rather than wait forever.
  if (typeof ric === 'function') ric(cb, { timeout: 2000 });
  else setTimeout(cb, 200);
}

function drainAutoQueue(): void {
  if (!pageLoaded || drainScheduled) return;
  if (inFlightAuto >= AUTO_TRANSLATE_CONCURRENCY || autoQueue.length === 0) return;

  drainScheduled = true;
  whenIdle(() => {
    drainScheduled = false;
    while (inFlightAuto < AUTO_TRANSLATE_CONCURRENCY) {
      const job = autoQueue.shift();
      if (!job) break;
      // Cards scroll out of an infinite feed faster than a queue drains; a job
      // whose component is gone should cost nothing.
      if (job.cancelled) continue;
      inFlightAuto++;
      job.run()
        .catch(() => {})
        .then(() => {
          inFlightAuto--;
          drainAutoQueue();
        });
    }
    if (autoQueue.length > 0) drainAutoQueue();
  });
}

/** Queue an auto-translation. Returns a cancel function for unmount. */
function queueAutoTranslate(run: () => Promise<unknown>): () => void {
  const job: QueuedJob = { run, cancelled: false };
  autoQueue.push(job);
  drainAutoQueue();
  return () => { job.cancelled = true; };
}

// The same (text, language) pair is routinely asked for by more than one
// component at once — a card owns the translate control while the component
// rendering its body asks for the same text, and a repost shows the same body
// twice on one screen. Sharing the promise makes those one request instead of
// several identical ones landing on the edge function within a frame.
type TranslateResult = {
  translatedText?: string;
  detectedLanguage?: { language: string };
  sameLanguage?: boolean;
};

const inFlightRequests = new Map<string, Promise<TranslateResult>>();

function requestTranslation(text: string, targetLang: string): Promise<TranslateResult> {
  const key = `${text}-${targetLang}`;
  const existing = inFlightRequests.get(key);
  if (existing) return existing;

  const request = (async () => {
    const { data, error } = await supabase.functions.invoke('translate-text', {
      body: { text, targetLang },
    });
    if (error) throw error;
    return (data ?? {}) as TranslateResult;
  })();

  inFlightRequests.set(key, request);
  // Settled either way — a failure must not pin the key and make every later
  // attempt at this text replay the same rejection.
  request.catch(() => {}).then(() => { inFlightRequests.delete(key); });
  return request;
}

// Auto-translate skips Latin-script bodies shorter than this. Language cannot
// be guessed from a word or two of Latin script — "no" is Portuguese, Italian
// and English, "nice" could be anything — so a short post translated at all is
// as likely to be "translated" out of its own language into it, and the only
// honest answer is to leave it alone until asked. Non-Latin scripts are exempt:
// kana, hangul, Arabic and friends identify themselves on sight.
const MIN_TEXT_LENGTH_FOR_DETECTION = 15;

function skipsAutoTranslate(text: string): boolean {
  return text.trim().length < MIN_TEXT_LENGTH_FOR_DETECTION && !detectNonLatinScript(text);
}

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

  // Whether a request is out, tracked in a ref rather than read off `isLoading`.
  //
  // The state value is a snapshot of the render the callback was created in, so
  // guarding on it rejected any second call made before React re-rendered —
  // including the one auto-translate makes when the reader's language resolves
  // a beat after mount. That request never went out and nothing ever retried
  // it, which is why auto-translate did nothing at all for anyone not reading
  // in the language the hook happened to start with.
  const inFlightRef = useRef(false);

  // Guards a late response against a reader who has since pressed "show
  // original" or scrolled the component away.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Nothing worth sending to the translator
  const isTooShort = !hasTranslatableText(text);

  const handleTranslate = useCallback(async () => {
    if (!hasTranslatableText(text) || inFlightRef.current) return;

    const targetLang = userLangRef.current;
    const cacheKey = `${text}-${targetLang}`;

    if (translationCache.has(cacheKey)) {
      const cached = translationCache.get(cacheKey)!;
      // Poison from before the garbage guard existed must not outlive this
      // session: drop it here and the next persist writes it out of
      // localStorage too, then fall through to ask the server afresh.
      if (looksLikeTranslationGarbage(cached.translated)) {
        translationCache.delete(cacheKey);
        schedulePersist();
      } else if (isNoOpTranslation(cached.translated, text)) {
        setSourceLang(cached.sourceLang);
        return;
      } else {
        setTranslatedText(cached.translated);
        setSourceLang(cached.sourceLang);
        setIsTranslated(true);
        return;
      }
    }

    inFlightRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const data = await requestTranslation(text, targetLang);

      if (!data.translatedText) {
        if (!mountedRef.current) return;
        setError('Translation unavailable');
        setTimeout(() => setError(null), 3000);
        return;
      }

      const translated = data.translatedText;
      const detected = data.detectedLanguage?.language || 'unknown';

      // An error message is not a translation of anything. Refuse it without
      // caching — the next attempt may reach a provider that answers honestly.
      if (looksLikeTranslationGarbage(translated)) {
        console.error('[Translate] Provider returned an error message, discarding');
        if (!mountedRef.current) return;
        setError('Translation unavailable');
        setTimeout(() => setError(null), 3000);
        return;
      }

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
        if (mountedRef.current) setSourceLang(detected);
        return;
      }

      if (!mountedRef.current) return;
      setTranslatedText(translated);
      setSourceLang(detected);
      setIsTranslated(true);
    } catch (err) {
      console.error('[Translate] Translation failed:', err);
      if (!mountedRef.current) return;
      setError('Translation unavailable');
      setTimeout(() => setError(null), 3000);
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setIsLoading(false);
    }
  }, [text]);

  const handleShowOriginal = useCallback(() => {
    setIsTranslated(false);
  }, []);

  // Auto-translate.
  //
  // Deferred, never immediate: the work is queued behind the page load and run
  // a few at a time while the browser is idle (see queueAutoTranslate). The
  // reader gets the page first and the translation a moment later, instead of
  // the page waiting behind a burst of translate calls it did not ask for.
  //
  // Fires once per (text, language) rather than per render: handleTranslate's
  // identity changes with `text`, so keying the effect on it directly would
  // re-enter whenever a translation swapped the text out from under it.
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
  const translateRef = useRef(handleTranslate);
  useEffect(() => { translateRef.current = handleTranslate; }, [handleTranslate]);

  useEffect(() => {
    if (!auto) return;
    if (!autoTranslateEnabled()) return;
    if (isTooShort) return;
    // A word or two of Latin script cannot be told apart from the reader's own
    // language, so auto-translating it is as likely wrong as right — and it is
    // the exact shape of query that pulls junk out of a shared translation
    // memory. The translate control stays; only the unasked-for pass skips.
    if (skipsAutoTranslate(text)) return;

    const key = `${text}-${userLang}`;
    if (autoDoneRef.current === key) return;
    autoDoneRef.current = key;

    // Already known — the cache survives a reload, so this is the common case on
    // a refresh. No request to schedule, and waiting for idle would only show
    // the reader a paragraph they cannot read before swapping it out.
    if (translationCache.has(key)) {
      void translateRef.current();
      return;
    }

    return queueAutoTranslate(() => translateRef.current());
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
  auto = true,
  flagged = false,
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
  } = useTranslation(text, auto);

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

  // Rendered as the requested element and nothing else.
  //
  // This used to sit inside an AnimatePresence/motion.div pair for a 150ms
  // cross-fade, which cost two things. Every post body, comment and chat line
  // in an infinite feed carried its own framer-motion instance — the animation
  // library is not free per node, and this is the most-repeated node in the
  // app. And the wrapper div broke `line-clamp` on the containers that clamp
  // this text, because the clamp applies to the element's own line boxes and a
  // block child is not one. The key still restarts the fade on a translate
  // toggle; the fade is now a CSS animation on the element itself.
  return (
    <Component
      key={isTranslated ? 'translated' : 'original'}
      className={cn("whitespace-pre-wrap animate-in fade-in duration-150", className)}
    >
      {renderTextWithLinks(isTranslated ? translatedText : text, { flagged })}
    </Component>
  );
}

/**
 * Split a translation that was requested as `title\n\n body` back into the two
 * halves it was joined from.
 *
 * Cards translate their title and body in one call to halve the request count,
 * which means guessing where the join was on the way back — and a translator is
 * under no obligation to keep a blank line. When the separator does not survive,
 * a naive `split('\n\n')[0]` hands the WHOLE body back as the title, and the
 * title renders unclamped while the body is capped at a couple of hundred
 * characters. That is how pressing translate on a long post silently expanded
 * it to full length instead of translating it: the button behaved like "show
 * more".
 *
 * With the separator gone there is no way to know where the title ended, so the
 * whole translation goes to the body — the half that is clamped and has an
 * expand control. Nothing is lost: the body text already opens with the title.
 */
export function splitTranslatedTitleAndBody(
  translated: string,
  title?: string,
  body?: string,
): [string | undefined, string | undefined] {
  if (!title) return [undefined, translated];
  if (!body) return [translated, undefined];

  const separator = translated.indexOf('\n\n');
  if (separator === -1) return [undefined, translated];

  const translatedTitle = translated.slice(0, separator).trim();
  const translatedBody = translated.slice(separator + 2).trim();
  if (!translatedTitle || !translatedBody) return [undefined, translated];

  return [translatedTitle, translatedBody];
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
