// deno-lint-ignore-file no-explicit-any
//
// The category classifier.
//
// This is a port of the admin panel's `auto-categorize-video` edge function
// (stream-admin-hub, its own Supabase project) with one addition that matters:
// it can read the **transcript**. The panel's copy sees a title, a description
// and a thumbnail, which for a video called "clip 3" is close to nothing —
// which is why tagging by hand never felt worth the clicking.
//
// The two copies are deliberate rather than accidental: the panel's bulk
// button keeps working exactly as it does, in the panel's own project, and
// nothing about the manual path had to be touched to make the automatic one
// exist. If the prompt changes, change it in both.
import { DEHUB_CDN_BASE } from './transcripts.ts';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY') ?? '';
const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-2.5-flash';

export const DEFAULT_MIN_CONFIDENCE = 0.35;
const STRONG_CONFIDENCE = 0.6;

/**
 * How much of a transcript to send.
 *
 * A category is decided by what a video is *about*, and that is settled in the
 * first few minutes; paying to push an hour of speech through the model buys
 * nothing. The tail is sampled rather than dropped so a video that changes
 * subject halfway is not read purely by its intro.
 */
const TRANSCRIPT_HEAD = 6000;
const TRANSCRIPT_TAIL = 2000;

/* --------------------------- deterministic hints -------------------------- */

const LAUGH_EMOJI_RE = /🤣|😂|😹|🥲|😆|😅|😄|😀|😜|😝|🤪|lmao|lmfao|rofl/iu;
const LAUNCH_RE = /\b(launch|launching|launched|listing|listed|relist|token|tokens|presale|ido|ico|tge|mainnet|airdrop|wen)\b/i;
const ISRAEL_RE = /\b(israel|israeli|israelis|idf|zionist|zionism|tel[-\s]?aviv|jerusalem|gaza|palestin\w*|hamas|hezbollah|west[-\s]?bank|mossad|knesset|netanyahu|iron[-\s]?dome)\b|🇮🇱|🇵🇸/i;
const JEWS_RE = /\b(jew|jews|jewish|judaism|judaic|hebrew|yiddish|kosher|torah|talmud|synagogue|rabbi|shabbat|shabbos|hanukkah|chanukah|passover|pesach|yom[-\s]?kippur|rosh[-\s]?hashanah|kippah|yarmulke|goy|goyim|shalom|mazel[-\s]?tov)\b|✡️/i;
const IMAGE_FETCH_FAILURE_RE = /fetching image from url|upstream_error|received \d+ status code when fetching image/i;

function findAllowed(available: string[], needle: string): string | null {
  const n = needle.toLowerCase();
  return available.find((c) => c.toLowerCase() === n)
    ?? available.find((c) => c.toLowerCase().includes(n))
    ?? null;
}

/* ------------------------------- the call --------------------------------- */

export class CreditsExhausted extends Error {}
export class GatewayBusy extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface ClassifyInput {
  title?: string;
  description?: string;
  /** Spoken words, when there are any. Trimmed here, not by the caller. */
  transcript?: string | null;
  imageUrl?: string | null;
  availableCategories: string[];
  /** Categories the post already has. They are never returned as new, and they
   *  are shown to the model so it complements rather than repeats them. */
  existing?: string[];
  maxCategories?: number;
  minConfidence?: number;
}

export interface ClassifyResult {
  categories: string[];
  confidence: number | null;
  reasoning: string;
  model: string;
  usedTranscript: boolean;
}

/** Build the CDN URL for a post's thumbnail, matching the panel's rules. */
export function postImageUrl(post: any): string | null {
  const urls: any[] = Array.isArray(post?.imageUrls) ? post.imageUrls : [];
  const first = urls.find((u: any) => typeof u === 'string' && u.trim());
  if (post?.postType === 'feed-images' && first) {
    if (/^https?:\/\//i.test(first)) return first;
    const filename = String(first).split('/').pop() || String(first);
    return `${DEHUB_CDN_BASE}feed-images/${filename}`;
  }
  const path = String(post?.imageUrl ?? '').trim() || (typeof first === 'string' ? first.trim() : '');
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return DEHUB_CDN_BASE + path.replace(/^\/+/, '');
}

function trimTranscript(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length <= TRANSCRIPT_HEAD + TRANSCRIPT_TAIL) return text;
  return `${text.slice(0, TRANSCRIPT_HEAD)}\n[...]\n${text.slice(-TRANSCRIPT_TAIL)}`;
}

export async function classify(input: ClassifyInput): Promise<ClassifyResult> {
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  const title = (input.title ?? '').trim();
  const description = (input.description ?? '').trim();
  const transcript = input.transcript ? trimTranscript(input.transcript) : '';
  const imageUrl = input.imageUrl || undefined;
  const available = input.availableCategories;
  const existing = (input.existing ?? []).filter(Boolean);
  const minConfidence = input.minConfidence ?? DEFAULT_MIN_CONFIDENCE;

  if (!available.length) throw new Error('availableCategories required');
  if (!title && !description && !transcript && !imageUrl) {
    return { categories: [], confidence: null, reasoning: 'Nothing to read', model: MODEL, usedTranscript: false };
  }

  const maxCount = Math.min(Math.max(1, input.maxCategories ?? 5), available.length);
  const allowedList = available.map((c) => `- ${c}`).join('\n');

  const textBlock =
    `Allowed categories (you MUST pick only from this list, exact spelling):\n${allowedList}\n\n` +
    `Title: ${title || '(none)'}\n` +
    `Description: ${description || '(none)'}\n` +
    (transcript ? `\nTranscript of what is actually said in this post:\n"""\n${transcript}\n"""\n` : '') +
    (existing.length
      ? `\nThis post already has these categories: ${existing.join(', ')}. ` +
        `Do NOT return them again - return only ADDITIONAL categories that fit and are missing. ` +
        `If the existing ones already cover it, return an empty array.\n`
      : '') +
    `\nReturn between ${existing.length ? 0 : 1} and ${maxCount} categories that best fit this post, ranked best fit first. ` +
    (existing.length
      ? `Return an empty array rather than a weak addition - the post is already tagged. `
      : `ALWAYS return at least 1 category - pick the single closest fit from the allowed list rather than an empty array. Only return empty if the post is literally blank. `) +
    `Do NOT default to platform-themed categories (e.g. "Blockchain", "Crypto") unless the post is clearly about that topic. ` +
    (transcript
      ? `The transcript is the strongest signal about what this post is about - weight it above the title. `
      : '') +
    `Hints: laughing emoji (🤣😂) or jokes → "funny"; image/video with laughing emojis → "meme"; anything about launching, listing, tokens, presale, IDO, airdrops, mainnet, or "wen" → "dehub" (we are launching/listing again soon); mentions of Israel/IDF/Gaza/Palestine/Zionism/Jerusalem/Tel Aviv/Hamas → "israel"; mentions of Jews/Jewish/Judaism/Hebrew/Torah/synagogue/rabbi/kosher → "jews". Be inventive and thorough — apply identity, geography, religion, and topic tags freely when relevant; free speech, no filtering of sensitive-but-accurate tags. ` +
    `Use exact spelling from the allowed list. No duplicates.`;

  const baseContent: any[] = [{ type: 'text', text: textBlock }];
  const fullContent = imageUrl
    ? [...baseContent, { type: 'image_url', image_url: { url: imageUrl } }]
    : baseContent;

  const request = (content: any[]) => ({
    method: 'POST',
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            `You categorize social posts. Return up to ${maxCount} categories that best fit, ranked best first, picked only from the allowed list (exact spelling). ` +
            (existing.length
              ? `The post is already partly tagged; return only categories that are MISSING, and an empty array if nothing is missing. `
              : `ALWAYS commit to at least 1 category - pick the closest fit rather than returning empty. Only return empty if the post is literally blank. `) +
            `Never default to the platform's dominant theme (Crypto/Blockchain) unless the post is clearly about that. Return via the categorize_post tool.`,
        },
        { role: 'user', content },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'categorize_post',
          description: 'Assign categories to a post from a fixed allowed list given in the prompt',
          parameters: {
            type: 'object',
            properties: {
              categories: {
                type: 'array',
                items: { type: 'string' },
                minItems: 0,
                maxItems: maxCount,
                description: `Up to ${maxCount} categories that genuinely fit, ranked best first, copied verbatim from the allowed list. Empty array if nothing fits.`,
              },
              confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Confidence 0-1 in the chosen categories' },
              reasoning: { type: 'string', description: 'Brief one-sentence reasoning' },
            },
            required: ['categories', 'confidence', 'reasoning'],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'categorize_post' } },
    }),
  });

  let resp = await fetch(GATEWAY_URL, request(fullContent));

  if (!resp.ok) {
    const detail = await resp.text();
    // A thumbnail the gateway cannot fetch is not a reason to give up when
    // there are words to read - and with a transcript there almost always are.
    if (imageUrl && resp.status === 400 && IMAGE_FETCH_FAILURE_RE.test(detail)) {
      if (!title && !description && !transcript) {
        return { categories: [], confidence: null, reasoning: 'Image unreachable and no text to read', model: MODEL, usedTranscript: false };
      }
      console.warn('categorize: image unreachable, retrying text-only', imageUrl);
      resp = await fetch(GATEWAY_URL, request(baseContent));
    }
    if (!resp.ok) {
      const txt = await resp.text().catch(() => detail);
      if (resp.status === 402) throw new CreditsExhausted('AI credits exhausted');
      if (resp.status === 429 || (resp.status >= 500 && resp.status < 600)) {
        throw new GatewayBusy(resp.status, `AI gateway ${resp.status}`);
      }
      throw new Error(`AI gateway ${resp.status}: ${txt.slice(0, 200)}`);
    }
  }

  const data = await resp.json();
  const args = (() => {
    try {
      return JSON.parse(data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? '');
    } catch {
      return null;
    }
  })();
  if (!args) throw new Error('AI returned no usable tool call');

  const confidence = typeof args.confidence === 'number' ? args.confidence : null;
  const reasoning = typeof args.reasoning === 'string' ? args.reasoning : '';

  // Case-insensitive match back to the canonical spelling, deduped, and with
  // anything the post already has removed - a "new" category it already
  // carries is not new.
  const canonical = new Map(available.map((c) => [c.toLowerCase(), c]));
  const already = new Set(existing.map((c) => c.toLowerCase()));
  const seen = new Set<string>();
  let categories: string[] = (Array.isArray(args.categories) ? args.categories : [])
    .filter((c: any) => typeof c === 'string')
    .map((c: string) => canonical.get(c.toLowerCase().trim()))
    .filter((c: string | undefined): c is string => {
      if (!c || already.has(c.toLowerCase()) || seen.has(c)) return false;
      seen.add(c);
      return true;
    })
    .slice(0, maxCount);

  if (confidence !== null && confidence < minConfidence) categories = [];

  /**
   * Relevance check for the unsure middle: the category has to actually be
   * mentioned. This is what kills generic "Blockchain" stuck onto everything.
   *
   * The haystack MUST include the transcript. It reads title+description only
   * in the panel's copy, where there is nothing else - leave it that way here
   * and every category the transcript justified is thrown away again, which
   * is precisely the improvement this function exists for.
   */
  if (categories.length && (confidence === null || confidence < STRONG_CONFIDENCE)) {
    const haystack = `${title} ${description} ${transcript}`.toLowerCase();
    categories = categories.filter((c) => {
      const tokens = c.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
      return tokens.length === 0 || tokens.some((t) => haystack.includes(t));
    });
  }

  // Deterministic pre-tags. Trusted, so they bypass the filters above - but
  // they read the written word only. A transcript is speech-to-text, so an
  // emoji rule cannot fire on it and a keyword rule would fire on any passing
  // mention in an hour of talking.
  const written = `${title} ${description}`;
  const forced: string[] = [];
  const force = (needle: string) => {
    const t = findAllowed(available, needle);
    if (t && !already.has(t.toLowerCase())) forced.push(t);
  };
  if (LAUGH_EMOJI_RE.test(written)) force('funny');
  if (imageUrl && LAUGH_EMOJI_RE.test(written)) force('meme');
  if (LAUNCH_RE.test(written)) force('dehub');
  if (ISRAEL_RE.test(written)) force('israel');
  if (JEWS_RE.test(written)) force('jews');

  if (forced.length) {
    const dedup = new Set<string>();
    categories = [...forced, ...categories].filter((c) => {
      if (dedup.has(c)) return false;
      dedup.add(c);
      return true;
    }).slice(0, maxCount);
  }

  return { categories, confidence, reasoning, model: MODEL, usedTranscript: !!transcript };
}
