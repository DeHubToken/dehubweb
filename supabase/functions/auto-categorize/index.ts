// deno-lint-ignore-file no-explicit-any
//
// Categories, without anybody clicking anything.
//
// Until now the only thing that ever assigned a category after the composer
// was an admin sitting on the Uploads page with the tab open, driving the
// panel's bulk button one post at a time. It worked, and it was never going
// to keep up with uploads.
//
// This runs in two ways:
//
//   1. `{ kind, ref }` — one post. `transcribe` fires this the moment a
//      transcript lands, alongside the summary kick, so a video is categorized
//      from what is actually *said* in it rather than from a thumbnail and a
//      one-word title.
//   2. `{ backfill: true }` — the catch-up pass over everything already
//      posted. The backend picks the candidates (it owns the categories, so it
//      can ask "which posts are short of tags and have never been looked at"
//      in one query) rather than this walking the public feed.
//
// It only ever ADDS. A category the creator chose is never removed or
// reordered — the model is told what is already there and asked what is
// missing.
import { admin, corsHeaders, DEHUB_API_BASE, json } from '../_shared/transcripts.ts';
import { classify, CreditsExhausted, postImageUrl } from '../_shared/categorize.ts';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
/** The same service-to-service secret the assistant tools use. One secret,
 *  already set on the droplet and on this project — see AssistantSecretGuard. */
const SERVICE_SECRET = Deno.env.get('ASSISTANT_SERVICE_SECRET') ?? '';

/** How many categories a post should end up with before it is left alone. */
const TARGET_CATEGORIES = 5;
/** Per backfill run. Each candidate is one model call. */
const BACKFILL_BUDGET = 25;
const WAVE = 3;

interface Outcome {
  tokenId: string;
  added: string[];
  skipped?: string;
  error?: string;
}

function apiHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-assistant-secret': SERVICE_SECRET,
  };
}

async function allowedCategories(): Promise<string[]> {
  const res = await fetch(`${DEHUB_API_BASE}/api/internal/categories`, { headers: apiHeaders() });
  if (!res.ok) throw new Error(`categories ${res.status}`);
  const body = await res.json();
  return Array.isArray(body?.categories) ? body.categories.filter((c: any) => typeof c === 'string') : [];
}

async function candidates(limit: number): Promise<string[]> {
  const url = `${DEHUB_API_BASE}/api/internal/categorize/candidates?limit=${limit}&target=${TARGET_CATEGORIES}`;
  const res = await fetch(url, { headers: apiHeaders() });
  if (!res.ok) throw new Error(`candidates ${res.status}`);
  const body = await res.json();
  return Array.isArray(body?.tokenIds) ? body.tokenIds.map((t: any) => String(t)) : [];
}

async function fetchPost(tokenId: string): Promise<any | null> {
  const res = await fetch(`${DEHUB_API_BASE}/api/nft_info/${tokenId}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const body = await res.json();
  const post = body?.result ?? body;
  return post?.tokenId ? post : null;
}

/**
 * Hand the verdict to the API, which owns the merge.
 *
 * Sent even when the model found nothing to add: the write stamps
 * `categorizedAt`, and without that stamp the backfill pass asks the model
 * about the same untaggable post on every run, for ever.
 */
async function saveCategories(
  tokenId: string,
  categories: string[],
  extra: { confidence: number | null; model: string; reasoning: string; usedTranscript: boolean },
): Promise<string[]> {
  const res = await fetch(`${DEHUB_API_BASE}/api/internal/categorize`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ tokenId, categories, ...extra }),
  });
  if (!res.ok) throw new Error(`categorize ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const body = await res.json();
  return Array.isArray(body?.added) ? body.added : [];
}

/** Whatever was transcribed for this post, and how far along it is. */
async function transcriptFor(tokenId: string): Promise<{ text: string | null; status: string | null }> {
  const db = admin();
  const { data } = await db
    .from('transcripts')
    .select('full_text, status')
    .in('source_kind', ['video', 'audio', 'live'])
    .eq('source_ref', tokenId)
    // limit(1) rather than maybeSingle(): dropping the status filter widened
    // this to every row for the post, and maybeSingle treats a second one as
    // an error rather than a choice.
    .order('updated_at', { ascending: false })
    .limit(1);
  const row = Array.isArray(data) ? data[0] : null;
  const status = row?.status ? String(row.status) : null;
  const text = status === 'ready' ? String(row?.full_text ?? '').trim() : '';
  return { text: text || null, status };
}

/**
 * How long a post with speech in it is given to produce a transcript before it
 * is categorized without one.
 *
 * The sweep and the transcript race each other, and the sweep usually wins: a
 * video is a candidate the moment it is posted, while its transcript is
 * minutes away behind transcoding. Whoever gets there first fills the five
 * slots, so without this the classifier reads a thumbnail on exactly the posts
 * it was built to read the words of, and the transcript hook arrives to find
 * no room left.
 *
 * So a young video waits. If the transcript never comes — transcoding failed,
 * nothing was said, the sweeper gave up — the post ages past this and gets
 * categorized from what there is, which is what would have happened anyway.
 */
const TRANSCRIPT_GRACE_MS = 6 * 60 * 60 * 1000;

/** Statuses that mean no transcript is coming, so there is nothing to wait for. */
const TRANSCRIPT_SETTLED = new Set(['ready', 'empty', 'failed']);

function stillWaitingOnWords(post: any, status: string | null): boolean {
  const transcribable = !!(post?.videoUrl || post?.audioUrl);
  if (!transcribable) return false;
  if (status && TRANSCRIPT_SETTLED.has(status)) return false;
  const born = Date.parse(String(post?.createdAt ?? '')) || 0;
  return born > 0 && Date.now() - born < TRANSCRIPT_GRACE_MS;
}

async function categorizeOne(
  tokenId: string,
  available: string[],
  /** True when the transcript is the reason we are here, so there is nothing
   *  to wait for — the words already exist. */
  fromTranscript = false,
): Promise<Outcome> {
  const post = await fetchPost(tokenId);
  if (!post) return { tokenId, added: [], skipped: 'post not found' };
  if (String(post.status ?? '').toLowerCase() === 'deleted') return { tokenId, added: [], skipped: 'deleted' };

  const existing: string[] = Array.isArray(post.category) ? post.category.filter(Boolean) : [];
  const room = TARGET_CATEGORIES - existing.length;
  if (room <= 0) return { tokenId, added: [], skipped: 'already full' };

  const transcript = await transcriptFor(tokenId);

  // Deliberately returns WITHOUT stamping categorizedAt: the post stays a
  // candidate so the sweep comes back to it once the words are in, or once
  // the grace period says they never will be.
  if (!fromTranscript && stillWaitingOnWords(post, transcript.status)) {
    return { tokenId, added: [], skipped: 'waiting for the transcript' };
  }

  const result = await classify({
    title: post.name,
    description: post.description,
    transcript: transcript.text,
    imageUrl: postImageUrl(post),
    availableCategories: available,
    existing,
    maxCategories: room,
  });

  const added = await saveCategories(tokenId, result.categories, {
    confidence: result.confidence,
    model: result.model,
    reasoning: result.reasoning,
    usedTranscript: result.usedTranscript,
  });
  return { tokenId, added };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!SERVICE_SECRET) return json({ error: 'ASSISTANT_SERVICE_SECRET is not configured' }, 500);

    const body = await req.json().catch(() => ({}));
    const backfill = body?.backfill === true;

    if (backfill) {
      // The only mode that can spend money in bulk, so it needs the key that
      // nothing in a browser has.
      const auth = req.headers.get('Authorization') ?? '';
      if (!auth.includes(SERVICE_KEY)) return json({ error: 'backfill requires the service key' }, 401);
    }

    const available = await allowedCategories();
    if (!available.length) return json({ error: 'no categories are defined' }, 409);

    /* ---- one post ---- */
    if (!backfill) {
      const kind = String(body?.kind ?? 'video').toLowerCase();
      // A stage is a room, not a post — there is nothing with a category on it.
      if (kind === 'stage') return json({ ok: true, skipped: 'stages have no categories' });
      const ref = String(body?.ref ?? body?.tokenId ?? '').trim();
      if (!/^\d+$/.test(ref)) return json({ error: 'a numeric { ref } is required' }, 400);

      // The single-post path is `transcribe` telling us the words are ready,
      // so it never waits for them.
      const outcome = await categorizeOne(ref, available, true);
      return json({ ok: true, ...outcome });
    }

    /* ---- the catch-up pass ---- */
    const limit = Math.max(1, Math.min(Number(body?.limit ?? BACKFILL_BUDGET), BACKFILL_BUDGET));
    /**
     * Ask for more than the budget.
     *
     * Candidates come newest first, and a young video now declines to be
     * categorized until its transcript exists. Fetching exactly the budget
     * would let a dozen fresh uploads fill the whole run with "come back
     * later" and the back catalogue would never move while the platform was
     * busy — the queue would look like it was being worked and drain nothing.
     * A post that waits does not spend its slot.
     */
    const ids = await candidates(Math.min(limit * 4, 100));
    const results: Outcome[] = [];
    let creditsOut = false;
    let spent = 0;

    for (let i = 0; i < ids.length && !creditsOut && spent < limit; i += WAVE) {
      const wave = ids.slice(i, i + WAVE);
      const settled = await Promise.all(wave.map(async (id): Promise<Outcome> => {
        try {
          return await categorizeOne(id, available);
        } catch (e: any) {
          // Running out of credits is the one failure worth stopping the whole
          // run for — every remaining call would fail the same way.
          if (e instanceof CreditsExhausted) creditsOut = true;
          return { tokenId: id, added: [], error: String(e?.message ?? e).slice(0, 200) };
        }
      }));
      spent += settled.filter((r) => r.skipped !== 'waiting for the transcript').length;
      results.push(...settled);
    }

    return json({
      ok: true,
      mode: 'backfill',
      considered: results.length,
      tagged: results.filter((r) => r.added.length > 0).length,
      waitingOnTranscript: results.filter((r) => r.skipped === 'waiting for the transcript').length,
      creditsExhausted: creditsOut,
      results,
    });
  } catch (e: any) {
    console.error('auto-categorize error', e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
