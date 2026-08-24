/**
 * Translate Text Edge Function
 * ============================
 * Uses free translation APIs (MyMemory) for translations with AI fallback.
 *
 * Two caches then four providers, cheapest first. Every provider returns null
 * rather than throwing, so a dead tier falls through to the next:
 *   L1  in-isolate Map      — free, but dies with the isolate and is not shared
 *   L2  post_translations   — one round trip, shared by every isolate, permanent
 *   P1  MyMemory            — free, capped, skipped above 500 chars
 *   P2  Gemini direct       — GEMINI_API_KEY
 *   P3  fal / OpenRouter    — FAL_KEY, routed to a non-Google model on purpose
 *   P4  Lovable gateway     — legacy route, currently 402 out of credits
 *
 * L2 is what makes translating a whole feed affordable: without it the bill
 * scales with viewers rather than with distinct (text, language) pairs.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rateLimitByIp } from "../_shared/auth.ts";
import { languageNameFor } from "../_shared/language-names.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer',
};

// Server-side translation cache to avoid repeated API/AI calls for identical text
const translationCache = new Map<string, TranslateResponse>();
const MAX_CACHE_SIZE = 500;

// Key over the WHOLE text, never a prefix of it. Hashing only the first 200
// characters made any two bodies that open the same way — templated AI-image
// captions, reposted announcements, a shared boilerplate intro — collide in this
// map, and the map is shared by every caller, so translating one post could hand
// back somebody else's translation. Two independent hashes plus the length keep
// accidental collisions negligible. A blank body also used to hash to 0 and put
// every empty request in one bucket; those are rejected outright now.
function getCacheKey(text: string, targetLang: string): string {
  let h1 = 0;
  let h2 = 5381;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    h1 = (((h1 << 5) - h1) + char) | 0;
    h2 = (((h2 << 5) + h2) ^ char) | 0;
  }
  return `${(h1 >>> 0).toString(36)}_${(h2 >>> 0).toString(36)}_${text.length}_${targetLang}`;
}

function rememberInIsolate(cacheKey: string, result: TranslateResponse): void {
  if (translationCache.size >= MAX_CACHE_SIZE) {
    const firstKey = translationCache.keys().next().value;
    if (firstKey) translationCache.delete(firstKey);
  }
  translationCache.set(cacheKey, result);
}

// The shared table gets a real digest rather than the pair of 32-bit hashes
// above. Those are fine for a 500-entry map that empties on the next cold start;
// a collision in a permanent, shared table would serve one post's translation
// for another's until somebody deleted the row by hand.
async function getTextHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

/**
 * L2 read. Never throws — a cache that is down should cost money, not requests,
 * so every failure here falls through to the providers.
 */
async function readCachedTranslation(
  textHash: string,
  targetLang: string
): Promise<TranslateResponse | null> {
  try {
    const { data, error } = await db
      .from('post_translations')
      .select('translated_text, source_lang')
      .eq('text_hash', textHash)
      .eq('target_lang', targetLang)
      .maybeSingle();

    if (error || !data) return null;

    // Read counters are advisory (they drive eviction and cost reporting), so
    // they are not awaited — blocking a cache hit on a write would give away
    // most of what the cache is for.
    db.rpc('touch_post_translation', { p_text_hash: textHash, p_target_lang: targetLang })
      .then(() => {}, () => {});

    return {
      translatedText: data.translated_text,
      detectedLanguage: data.source_lang
        ? { language: data.source_lang, confidence: 1.0 }
        : undefined,
    };
  } catch (_e) {
    return null;
  }
}

/**
 * L2 write. Also never throws, and upserts rather than inserts so two isolates
 * racing on the same miss settle instead of one of them 409-ing.
 */
async function writeCachedTranslation(
  textHash: string,
  targetLang: string,
  result: TranslateResponse,
  provider: string
): Promise<void> {
  try {
    await db.from('post_translations').upsert({
      text_hash: textHash,
      target_lang: targetLang,
      translated_text: result.translatedText,
      source_lang: result.detectedLanguage?.language ?? null,
      provider,
    }, { onConflict: 'text_hash,target_lang' });
  } catch (_e) {
    // A cache that cannot be written is a slow cache, not a broken request.
  }
}

// 'en', 'en-US' and 'EN' are the same target as far as skipping work goes.
function baseLang(code: string | undefined): string {
  return (code ?? '').toLowerCase().split(/[-_]/)[0];
}

// Ceiling on paid calls per UTC day, across every caller.
//
// The wallet gate that used to sit in front of the paid tiers is gone, so this
// is the only thing standing between a script and the fal balance. It is not a
// per-user quota and is not trying to be fair — it is a blast radius. Whatever
// goes wrong, the day's loss is bounded and tomorrow starts clean.
//
// Sized well above real traffic on purpose. Only a (text, language) pair that
// misses both caches gets this far, so steady-state usage is roughly "new posts
// × languages actually being read", not "views". If this trips during normal
// use the cache is not working and that is the bug to chase, not this number.
const DAILY_PAID_TRANSLATION_CAP = Number(
  Deno.env.get('TRANSLATION_DAILY_CAP') ?? '20000',
);

/**
 * Reserves one paid call against today's budget. Returns false when the day is
 * spent.
 *
 * Fails OPEN: if the counter cannot be reached the translation proceeds. A
 * broken counter should not take the feature down, and the providers have their
 * own limits underneath. The reverse — failing closed — would mean one bad
 * migration silently stops every translation on the site.
 */
async function claimPaidTranslation(): Promise<boolean> {
  try {
    const { data, error } = await db.rpc('claim_paid_translation', {
      p_cap: DAILY_PAID_TRANSLATION_CAP,
    });
    if (error) {
      console.log('Spend counter unavailable, allowing:', error.message);
      return true;
    }
    return data !== false;
  } catch (_e) {
    return true;
  }
}

interface TranslateRequest {
  text: string;
  targetLang: string;
  sourceLang?: string;
}

interface TranslateResponse {
  translatedText: string;
  detectedLanguage?: {
    language: string;
    confidence: number;
  };
}

// Map common language codes to full names for MyMemory
const langCodeMap: Record<string, string> = {
  'en': 'en',
  'es': 'es',
  'fr': 'fr',
  'de': 'de',
  'it': 'it',
  'pt': 'pt',
  'ru': 'ru',
  'ja': 'ja',
  'ko': 'ko',
  'zh': 'zh-CN',
  'ar': 'ar',
  'hi': 'hi',
  'ms': 'ms',
  'tr': 'tr',
  'ro': 'ro',
  'bn': 'bn',
  'id': 'id',
  'vi': 'vi',
  'th': 'th',
  'nl': 'nl',
  'pl': 'pl',
  'uk': 'uk',
  'tl': 'tl',
  'fa': 'fa',
  'arz': 'ar',  // Egyptian Arabic → standard Arabic for MyMemory
  'ary': 'ar',  // Moroccan Arabic → standard Arabic for MyMemory
  'pcm': 'en',  // Nigerian Pidgin → English for MyMemory (AI fallback handles properly)
  'ha': 'ha',
  'yo': 'yo',
  'ig': 'ig',
  'af': 'af',
  'qu': 'qu',
  'am': 'am',
  'sw': 'sw',
  'zu': 'zu',
  'auto': 'autodetect',
};

// Names for the AI prompt now come from ../_shared/language-names.ts, which
// covers every code the pickers can produce. The 35-entry map that used to sit
// here is the reason the cache held Spanish filed under Mesopotamian Arabic:
// any code it lacked went into the prompt raw, and the model guessed.

// MyMemory signals "these are the same language" as a 403 rather than a field,
// and puts the message in both responseDetails and translatedText. Match on the
// message rather than the status alone, since 403 also covers unrelated refusals.
function isSameLanguageRefusal(data: {
  responseStatus?: number | string;
  responseDetails?: string;
  responseData?: { translatedText?: string };
}): boolean {
  const haystack = `${data.responseDetails ?? ''} ${data.responseData?.translatedText ?? ''}`;
  return haystack.toUpperCase().includes('TWO DISTINCT LANGUAGES');
}

// Provider junk that arrives dressed as a successful translation.
//
// MyMemory's free tier answers some queries — short ones above all — out of its
// shared translation memory, which holds API boilerplate other integrations once
// fed it. A post comes back "translated" into MYMEMORY WARNING prose or an
// INVALID LANGUAGE PAIR complaint, passes every status check because
// responseStatus is 200, and older versions of this function cached it as a
// settled answer: permanent in the shared table, and re-persisted by every
// client that saw it. Matched against provider output AND cache reads, so rows
// poisoned before this guard existed are discarded on sight and overwritten by
// the next honest generation instead of being served forever.
const TRANSLATION_JUNK_PATTERN =
  /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID LANGUAGE PAIR|UNSUPPORTED LANGUAGE|API KEY|PLEASE CONTACT|INTERNAL SERVER|SERVICE UNAVAILABLE/i;

function looksLikeTranslationJunk(input: string, output: string): boolean {
  if (TRANSLATION_JUNK_PATTERN.test(output)) return true;

  // The junk has more shapes than any list. A reply to a word or two that is
  // several times longer than its question and shouted in caps is an API
  // complaint, not a translation of it — no honest rendering of "nice" is a
  // paragraph of capital letters. Scoped tight so a legitimately shouty long
  // post is never touched; the cost of a miss here is one wasted paid call.
  const trimmedInput = input.trim();
  if (trimmedInput.length <= 30 && trimmedInput.split(/\s+/).length <= 3) {
    const trimmedOutput = output.trim();
    if (
      trimmedOutput.length > trimmedInput.length * 2 &&
      trimmedOutput === trimmedOutput.toUpperCase() &&
      /[A-Z]{4}/.test(trimmedOutput)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Cheap same-language probe for text MyMemory will not translate.
 *
 * Bodies over 500 characters skip MyMemory entirely, so the refusal above never
 * fires for them and a long post in the reader's own language would go to a paid
 * model to be returned unchanged. Sending only a prefix is enough: the answer is
 * about which language the text is in, not about translating it.
 *
 * Fails open — an unreachable probe returns false and the paid tiers run, which
 * is the behaviour without this function at all.
 */
async function isAlreadyInTargetLanguage(text: string, targetLang: string): Promise<boolean> {
  try {
    const probe = text.slice(0, 200);
    const target = langCodeMap[targetLang] || targetLang;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(probe)}&langpair=${encodeURIComponent(`autodetect|${target}`)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return false;
    return isSameLanguageRefusal(await response.json());
  } catch (_e) {
    return false;
  }
}

/**
 * MyMemory Translation API - Free, 1000 words/day
 * https://mymemory.translated.net/doc/spec.php
 */
async function translateWithMyMemory(
  text: string,
  targetLang: string,
  sourceLang: string = 'auto'
): Promise<TranslateResponse | null> {
  try {
    console.log('Attempting translation with MyMemory API');
    
    const source = sourceLang === 'auto' ? 'autodetect' : (langCodeMap[sourceLang] || sourceLang);
    const target = langCodeMap[targetLang] || targetLang;
    const langpair = `${source}|${target}`;
    
    // MyMemory struggles with texts over ~500 chars, skip to AI for long texts
    if (text.length > 500) {
      console.log('Text too long for MyMemory, skipping to AI');
      return null;
    }
    
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
    
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    
    if (!response.ok) {
      console.log(`MyMemory returned status: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // MyMemory refuses a same-language pair with 403 "PLEASE SELECT TWO
    // DISTINCT LANGUAGES". Asked to autodetect, that refusal is not a failure —
    // it is MyMemory telling us it detected the source AS the target, i.e. the
    // reader already speaks the language this text is written in.
    //
    // Treating it as a generic error is expensive now that the feed translates
    // itself: every English post read by an English speaker fell through to a
    // paid model to be "translated" into the language it was already in, which
    // on an English-majority feed is most of the traffic. Verified against the
    // live API — an English body with langpair `autodetect|en` returns exactly
    // this.
    if (isSameLanguageRefusal(data)) {
      console.log('MyMemory: text is already in the target language');
      return {
        translatedText: text,
        detectedLanguage: { language: targetLang, confidence: 1.0 },
      };
    }

    if (data.responseStatus !== 200) {
      console.log(`MyMemory response status: ${data.responseStatus}, message: ${data.responseDetails}`);
      return null;
    }
    
    const translatedText = data.responseData.translatedText;
    
    // Check for quota exceeded or error messages in the response
    if (!translatedText || translatedText.includes('MYMEMORY WARNING') || translatedText.includes('PLEASE CONTACT')) {
      console.log('MyMemory quota exceeded or error in response');
      return null;
    }

    // A 200 with error prose in translatedText is how the shared translation
    // memory answers short queries. Refuse it here and it can never reach
    // either cache.
    if (looksLikeTranslationJunk(text, translatedText)) {
      console.log('MyMemory returned API boilerplate as the translation, falling back');
      return null;
    }
    
    const detected = data.responseData.detectedLanguage;
    const unchanged = translatedText.trim().toLowerCase() === text.trim().toLowerCase();

    // Identical output has two very different causes, and telling them apart is
    // the single biggest cost lever now that the feed translates itself.
    //
    // If MyMemory detected the source as the language we asked for, the text was
    // ALREADY in that language and coming back unchanged is the correct answer.
    // Treating that as a miss is what used to happen, and it sent every English
    // post read by an English speaker to a paid model to be "translated" into
    // the language it was already in. On an English-majority feed that is most
    // of the traffic.
    //
    // Without a detection to lean on, unchanged output really is a failure and
    // still falls through.
    if (unchanged) {
      if (detected && baseLang(detected) === baseLang(targetLang)) {
        console.log('MyMemory: text is already in the target language');
        return {
          translatedText: text,
          detectedLanguage: { language: detected, confidence: 1.0 },
        };
      }
      console.log('MyMemory returned same text as input, falling back to AI');
      return null;
    }
    
    console.log('Translation successful from MyMemory');
    
    return {
      translatedText,
      detectedLanguage: data.responseData.detectedLanguage ? {
        language: data.responseData.detectedLanguage,
        confidence: 1.0,
      } : undefined,
    };
  } catch (error) {
    console.log('MyMemory failed:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

const TRANSLATOR_SYSTEM_PROMPT = (targetLanguageName: string) =>
  `You are a professional translator. Translate the following text to ${targetLanguageName}.
Rules:
- Output ONLY the translated text
- No explanations, quotes, labels, or extra text
- Preserve formatting, line breaks, emojis, and special characters
- Keep URLs, @mentions, #hashtags and $tags exactly as written
- If text contains slang or informal language, translate it naturally
- Translate ALL of the text, do not skip any part
- If there is nothing to translate (only links, tags, numbers, emoji, or a name), or the text is already in ${targetLanguageName}, return the input EXACTLY as given
- Never refuse and never ask for clarification: your entire output must work as a drop-in replacement for the input`;

// A model that decides it cannot translate says so INSTEAD of translating, and
// before this guard existed that prose was cached and rendered as the post's
// translation — "I don't see any text to translate in your message. You've
// only provided a URL link…" sat in the feed as if the author wrote it. These
// phrases are about the translation request itself, which is why none of them
// plausibly appear inside a real translation of somebody's post.
//
// A false positive here costs one untranslated post; a false negative is
// served from the cache indefinitely. Matched against every paid tier's
// output before it is accepted.
const REFUSAL_PATTERN =
  /no text (?:provided|to translate)|nothing to translate|text to translate in your|asked me to translate|provide the text|share the text|cannot translate|can't translate|not a recognized (?:language|code)|need clarification|don't see any text|only provided (?:a|an|the)/i;

function looksLikeRefusal(output: string): boolean {
  return REFUSAL_PATTERN.test(output);
}

// Ordered newest-first, and tried in order until one answers.
//
// A single hardcoded id is what broke this on the first deploy: the function
// inherited `gemini-2.5-flash-lite` from the gateway config it replaced, and
// Google had already stopped serving that id to new API consumers — every long
// translation 404'd with "no longer available to new users". 2.5 shuts down
// outright in October 2026, and the generation before it was retired the same
// way in June, so this will happen again.
//
// Walking a list costs one wasted 404 on one cold start when the head of the
// list is retired, instead of failing every request until somebody edits this
// file. The working index is remembered for the isolate's lifetime.
const GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
];
let geminiModelIndex = 0;

/**
 * Gemini, called directly.
 *
 * This used to go through ai.gateway.lovable.dev, which resells the same class
 * of model at a markup. Same prompt, so output is unchanged — only the billing
 * route moves, onto GEMINI_API_KEY.
 *
 * The gateway stays wired as a fallback below, so an unset or rejected
 * GEMINI_API_KEY degrades to the old path instead of failing the request.
 */
async function translateWithGemini(
  text: string,
  targetLanguageName: string
): Promise<TranslateResponse | null> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_API_KEY) return null;

  const body = JSON.stringify({
    systemInstruction: {
      parts: [{ text: TRANSLATOR_SYSTEM_PROMPT(targetLanguageName) }],
    },
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      temperature: 0.1,
      // 2000 silently truncated long posts, and a truncation that gets cached
      // is served truncated forever.
      maxOutputTokens: 4000,
    },
  });

  for (let i = geminiModelIndex; i < GEMINI_MODELS.length; i++) {
    const model = GEMINI_MODELS[i];

    try {
      console.log(`Attempting translation with Gemini (direct), model ${model}`);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY,
          },
          body,
        }
      );

      // Only a missing model is worth retrying down the list. A 401, 429 or 5xx
      // says nothing about the model id, and walking the whole list on those
      // would turn one rejected request into three.
      if (response.status === 404) {
        console.log(`Gemini model ${model} unavailable (404), trying next`);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`Gemini returned status: ${response.status}, error: ${errorText}`);
        return null;
      }

      const data = await response.json();
      const translatedText = data.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? '')
        .join('')
        .trim();

      if (!translatedText) {
        console.log(`Gemini returned empty response (model ${model})`);
        return null;
      }

      if (looksLikeRefusal(translatedText)) {
        console.log(`Gemini answered with a refusal, not a translation (model ${model})`);
        return null;
      }

      // Skip the dead ids on subsequent calls in this isolate.
      geminiModelIndex = i;
      console.log(`Translation successful from Gemini (direct), model ${model}`);

      return {
        translatedText,
        detectedLanguage: {
          language: 'auto',
          confidence: 0.9,
        },
      };
    } catch (error) {
      console.log('Gemini failed:', error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  console.log('Gemini: every model id in GEMINI_MODELS returned 404');
  return null;
}

/**
 * fal, via its OpenRouter router endpoint.
 *
 * Sits between Gemini and the Lovable gateway because FAL_KEY is already
 * provisioned for this project (generate-image, generate-video and generate-3d
 * all use it) and the gateway is currently returning 402.
 *
 * Deliberately routed to a non-Google model. This tier only runs when the Gemini
 * call has already failed, and a fallback that asks a different vendor for the
 * same family of model shares whatever just broke — a retired id, a bad key, a
 * Google outage. Claude Haiku is independent of all three and strong on the
 * long tail of languages this app configures.
 *
 * fal-ai/any-llm would be the more obvious endpoint and is documented as
 * deprecated; openrouter/router is the current one.
 */
async function translateWithFal(
  text: string,
  targetLanguageName: string
): Promise<TranslateResponse | null> {
  const FAL_KEY = Deno.env.get('FAL_KEY');
  if (!FAL_KEY) return null;

  try {
    console.log('Attempting translation with fal (openrouter/router)');

    const response = await fetch('https://fal.run/openrouter/router', {
      method: 'POST',
      headers: {
        Authorization: `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4.5',
        system_prompt: TRANSLATOR_SYSTEM_PROMPT(targetLanguageName),
        prompt: text,
        temperature: 0.1,
        // 2000 silently truncated long posts, and a truncation that gets
        // cached is served truncated forever.
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`fal returned status: ${response.status}, error: ${errorText}`);
      return null;
    }

    const data = await response.json();
    const translatedText = typeof data.output === 'string' ? data.output.trim() : '';

    if (!translatedText) {
      console.log('fal returned empty response');
      return null;
    }

    if (looksLikeRefusal(translatedText)) {
      console.log('fal answered with a refusal, not a translation');
      return null;
    }

    console.log('Translation successful from fal');

    return {
      translatedText,
      detectedLanguage: {
        language: 'auto',
        confidence: 0.9,
      },
    };
  } catch (error) {
    console.log('fal failed:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Lovable AI Translation - gateway fallback for when GEMINI_API_KEY is absent
 */
async function translateWithAI(
  text: string,
  targetLanguageName: string
): Promise<TranslateResponse | null> {
  try {
    console.log('Attempting translation with Lovable AI');

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.log('LOVABLE_API_KEY not configured');
      return null;
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: TRANSLATOR_SYSTEM_PROMPT(targetLanguageName) },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Lovable AI returned status: ${response.status}, error: ${errorText}`);
      return null;
    }

    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content?.trim();

    if (!translatedText) {
      console.log('Lovable AI returned empty response');
      return null;
    }

    if (looksLikeRefusal(translatedText)) {
      console.log('Lovable AI answered with a refusal, not a translation');
      return null;
    }

    console.log('Translation successful from Lovable AI');
    
    return {
      translatedText,
      detectedLanguage: {
        language: 'auto',
        confidence: 0.9,
      },
    };
  } catch (error) {
    console.log('Lovable AI failed:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 300/hour was sized for a button somebody pressed on one post at a time. The
  // feed now asks for every post it renders, so a normal scrolling session is
  // hundreds of requests — nearly all of them cache hits that cost nothing but
  // still count here. At the old limit ordinary reading tripped the limiter and
  // translation just stopped working part-way down the page.
  //
  // Raising this does not raise the spend: what costs money is a cache miss
  // reaching a paid tier, and that is bounded separately by the daily cap.
  const limited = await rateLimitByIp(req, 'translate-text', { limit: 3000, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;

  try {
    const { text, targetLang, sourceLang }: TranslateRequest = await req.json();

    if (!text || !text.trim() || !targetLang) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: text, targetLang' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Emoji, digits and punctuation have nothing to translate. Sent upstream
    // anyway, MyMemory answers a query like that out of its shared translation
    // memory — an unrelated segment somebody else once submitted — and that came
    // back looking like a translation of the caller's post.
    //
    // URLs, @mentions, #hashtags and $tags count as untranslatable too, even
    // though they contain letters: a post that is only "https://dehub.io/…" got
    // past the letter check, and the model's reply — "I don't see any text to
    // translate in your message. You've only provided a URL link…" — was cached
    // and rendered in the feed as the post's translation. Tags are judged, not
    // stripped from what gets sent: when real prose surrounds them, the FULL
    // text still goes to the provider, which is told to keep them as written.
    const prose = text
      .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
      .replace(/[@#$][\p{L}\p{N}_.-]+/gu, ' ');
    if (!/\p{L}/u.test(prose)) {
      return new Response(
        JSON.stringify({ translatedText: text }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Nothing to do when the caller already knows the text is in the target
    // language. Auto-translate asks for every post in the feed, and on a feed
    // whose majority language matches the viewer that is most of them — each one
    // otherwise costs a provider call to be told the text back.
    if (sourceLang && sourceLang !== 'auto' && baseLang(sourceLang) === baseLang(targetLang)) {
      return new Response(
        JSON.stringify({ translatedText: text, sameLanguage: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Translating to ${targetLang}: "${text.substring(0, 50)}..."`);

    // L1: in-isolate map
    const cacheKey = getCacheKey(text, targetLang);
    const cached = translationCache.get(cacheKey);
    if (cached) {
      console.log('Translation cache hit (L1)');
      return new Response(
        JSON.stringify({ ...cached, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // L2: shared table. A row written before the junk guard existed can hold
    // error prose; serving it would re-poison every client cache on each hit.
    // Discard and fall through — the provider result upserts over the bad row.
    const textHash = await getTextHash(text);
    const persisted = await readCachedTranslation(textHash, targetLang);
    if (persisted) {
      if (looksLikeTranslationJunk(text, persisted.translatedText ?? '')) {
        console.log('Translation cache hit (L2) was poisoned, regenerating');
      } else {
        console.log('Translation cache hit (L2)');
        rememberInIsolate(cacheKey, persisted);
        return new Response(
          JSON.stringify({ ...persisted, cached: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Try MyMemory first (most reliable free option)
    let result = await translateWithMyMemory(text, targetLang, sourceLang);
    if (result) {
      rememberInIsolate(cacheKey, result);
      await writeCachedTranslation(textHash, targetLang, result, 'mymemory');
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Long bodies never reached MyMemory, so the same-language refusal it
    // returns has not been seen for them. Ask before paying: a post already in
    // the reader's language is the single most common thing the feed will ask
    // to translate, and it is the one case where the correct answer is free.
    if (text.length > 500 && (await isAlreadyInTargetLanguage(text, targetLang))) {
      const sameLanguage: TranslateResponse = {
        translatedText: text,
        detectedLanguage: { language: targetLang, confidence: 1.0 },
      };
      rememberInIsolate(cacheKey, sameLanguage);
      await writeCachedTranslation(textHash, targetLang, sameLanguage, 'same-language');
      return new Response(
        JSON.stringify(sameLanguage),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Everything below here costs money.
    //
    // This used to require a wallet. That gate is gone: translating the feed is
    // a public reading feature, and gating it made signed-out readers — the
    // people most likely to need a translation — the only ones who could not
    // have one. It also protected nothing. requireDeHubAuth resolves its token
    // by calling an unguarded public endpoint, so any caller can present any
    // wallet; it cost real users a feature and cost an attacker one extra HTTP
    // request.
    //
    // What actually bounds the damage is a ceiling on spend, so that is what
    // guards it now. Abuse can waste the day's budget; it cannot empty an
    // account. Legitimate traffic never approaches the cap because the two
    // cache layers above absorb it — only a distinct (text, language) pair that
    // has never been seen reaches this line.

    // A code the name map does not know cannot be prompted for. It used to be
    // passed through raw — "Translate to acm" — and the model's guess went into
    // the permanent cache: Spanish filed as Mesopotamian Arabic, Kabyle as
    // Sanaani Arabic. Refusing is strictly better: an untranslated post
    // recovers by itself the day the map gains the code; a wrong-language cache
    // row is served until somebody deletes it by hand. Checked before claiming
    // budget so a hopeless request does not spend a paid slot.
    const targetLanguageName = languageNameFor(targetLang);
    if (!targetLanguageName) {
      console.warn(`No prompt name for target language '${targetLang}', refusing paid tiers`);
      return new Response(
        JSON.stringify({
          error: 'Translation is not available for this language yet.',
          code: 'UNSUPPORTED_TARGET_LANGUAGE',
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!(await claimPaidTranslation())) {
      console.warn('Daily paid translation cap reached, refusing paid tiers');
      return new Response(
        JSON.stringify({
          error: 'Translation is busy right now, try again later.',
          code: 'TRANSLATION_BUDGET_EXHAUSTED',
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Paid fallbacks. fal leads because it is the tier with credit on it — the
    // Gemini key is currently 429 RESOURCE_EXHAUSTED and the gateway is a
    // metered reseller. Reorder by moving these blocks; each returns null
    // rather than throwing, so a dead tier falls through to the next.
    result = await translateWithFal(text, targetLanguageName);
    if (result) {
      rememberInIsolate(cacheKey, result);
      await writeCachedTranslation(textHash, targetLang, result, 'fal');
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    result = await translateWithGemini(text, targetLanguageName);
    if (result) {
      rememberInIsolate(cacheKey, result);
      await writeCachedTranslation(textHash, targetLang, result, 'gemini');
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    result = await translateWithAI(text, targetLanguageName);
    if (result) {
      rememberInIsolate(cacheKey, result);
      await writeCachedTranslation(textHash, targetLang, result, 'lovable-gateway');
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // All endpoints failed
    console.error('All translation endpoints failed');
    return new Response(
      JSON.stringify({ error: 'Translation service temporarily unavailable' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Translation error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
