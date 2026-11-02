// deno-lint-ignore-file no-explicit-any
//
// Which parts of a finished Stage make a short, and what the captions say when.
//
// Nothing here touches the network or Deno, so the rules (clip length, where a
// clip may start and stop, caption timing, the ASS file the worker burns in)
// are tested under plain Node in highlights.test.ts.
//
// The transcript keeps segments, not words: `transcribe` folds Scribe's words
// into lines of up to ~6 s per speaker. So clip edges snap to segment edges
// (never mid-sentence), and word timings inside a line are spread by length,
// which is close enough for a word-by-word highlight at caption size.

export interface Segment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface Suggestion {
  start: number;
  end: number;
  hook?: string;
  title?: string;
}

export interface Highlight {
  start: number;
  end: number;
  /** The opening line, used as the post's quote. */
  hook: string;
  title: string;
  score: number;
}

export const MIN_CLIP_S = 30;
export const MAX_CLIP_S = 60;
export const MAX_CLIPS = 3;
/** Seconds of end card after the clip's own audio. */
export const END_CARD_S = 3;
/** Two clips from one stage must not share this much of each other. */
const MAX_OVERLAP_S = 5;
/** Inside a clip, a silence longer than this reads as dead air on a phone. */
const DEAD_AIR_S = 4;

const clean = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();
const words = (s: string) => clean(s).split(' ').filter(Boolean);

/** Segments with sane numbers and text, in time order. */
export function normalizeSegments(raw: unknown): Segment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s: any) => ({
      start: Number(s?.start),
      end: Number(s?.end),
      text: clean(s?.text),
      ...(s?.speaker ? { speaker: String(s.speaker) } : {}),
    }))
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start && s.text)
    .sort((a, b) => a.start - b.start);
}

// ── Scoring ─────────────────────────────────────────────────────────────────

/** Openers that lean on something said before them. */
const WEAK_OPENER = /^(and|but|so|or|because|cause|which|that|then|also|um+|uh+|erm|like|yeah|yes|no|okay|ok|right|anyway|well|i mean|you know)\b/i;
/** Openers that set up a whole thought. */
const STRONG_OPENER = /^(here'?s|the (?:thing|reason|truth|problem|secret)|what if|why|how|imagine|if you|most people|nobody|everyone|i think|i believe|the biggest|one thing|let me tell you)\b/i;
const ENDS_THOUGHT = /[.!?…]["')\]]?$/;

/** Higher is a better stand-alone clip. Exported for tests. */
export function scoreWindow(segments: Segment[], from: number, to: number): number {
  const first = segments[from];
  const last = segments[to];
  const span = segments.slice(from, to + 1);
  const duration = last.end - first.start;
  let score = 0;

  const opener = first.text;
  if (WEAK_OPENER.test(opener)) score -= 3;
  if (STRONG_OPENER.test(opener)) score += 2;
  if (/\?$/.test(span[0].text) || /\?/.test(opener.slice(0, 120))) score += 1;
  if (/^[a-z]/.test(opener)) score -= 1;

  // A new thought starts after a pause or with a new voice.
  const before = segments[from - 1];
  if (!before || first.start - before.end >= 0.6 || before.speaker !== first.speaker) score += 1;
  // And finishes on a full stop, before a pause or a hand-over.
  if (ENDS_THOUGHT.test(last.text)) score += 2; else score -= 2;
  const after = segments[to + 1];
  if (!after || after.start - last.end >= 0.6 || after.speaker !== last.speaker) score += 1;

  // One voice carries a short better than a cross-talk fragment.
  const bySpeaker = new Map<string, number>();
  for (const s of span) bySpeaker.set(s.speaker ?? '', (bySpeaker.get(s.speaker ?? '') ?? 0) + (s.end - s.start));
  const main = Math.max(...bySpeaker.values());
  const spoken = [...bySpeaker.values()].reduce((a, b) => a + b, 0);
  if (main / Math.max(spoken, 0.001) >= 0.8) score += 1;

  // Talking, not waiting.
  const wordCount = span.reduce((n, s) => n + words(s.text).length, 0);
  const rate = wordCount / duration;
  if (rate >= 1.8 && rate <= 3.8) score += 1;
  if (rate < 1.2) score -= 3;
  for (let i = 1; i < span.length; i++) {
    if (span[i].start - span[i - 1].end > DEAD_AIR_S) score -= 3;
  }

  // Mid-length shorts hold attention best; both ends of the range still qualify.
  score -= Math.abs(duration - 45) / 15;
  return score;
}

/** Every segment-aligned window between MIN_CLIP_S and MAX_CLIP_S long, scored. */
export function candidateWindows(segments: Segment[]): Highlight[] {
  const out: Highlight[] = [];
  for (let i = 0; i < segments.length; i++) {
    for (let j = i; j < segments.length; j++) {
      const duration = segments[j].end - segments[i].start;
      if (duration > MAX_CLIP_S) break;
      if (duration < MIN_CLIP_S) continue;
      out.push(windowOf(segments, i, j, scoreWindow(segments, i, j)));
    }
  }
  return out;
}

function windowOf(segments: Segment[], i: number, j: number, score: number, hook?: string, title?: string): Highlight {
  const opener = clean(hook || segments[i].text);
  return {
    start: segments[i].start,
    end: segments[j].end,
    hook: opener.length > 160 ? `${opener.slice(0, 159).trimEnd()}…` : opener,
    title: clean(title).slice(0, 80),
    score,
  };
}

/**
 * Fit a suggested window to the transcript: start on the segment the suggestion
 * starts in (or the next one), end on a segment end, and keep it 30–60 s.
 * Null when the suggestion points nowhere useful.
 */
export function snapSuggestion(segments: Segment[], s: Suggestion): Highlight | null {
  if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.end <= s.start) return null;
  let i = segments.findIndex((seg) => seg.end > s.start + 0.25);
  if (i < 0) return null;
  // Starting halfway through a line cuts a word: take the whole line when most
  // of it is inside the suggestion, otherwise the next one.
  if (segments[i].start < s.start && (s.start - segments[i].start) > (segments[i].end - segments[i].start) / 2 && segments[i + 1]) i++;

  let j = i;
  while (segments[j + 1] && segments[j + 1].end - segments[i].start <= MAX_CLIP_S && (segments[j].end < s.end - 0.25 || segments[j].end - segments[i].start < MIN_CLIP_S)) j++;
  const duration = segments[j].end - segments[i].start;
  if (duration < MIN_CLIP_S || duration > MAX_CLIP_S) return null;
  return windowOf(segments, i, j, scoreWindow(segments, i, j), undefined, s.title);
}

/**
 * Up to `max` clips that do not overlap. Suggestions (from the text helper) are
 * snapped and ranked with a bonus; the scored windows fill any room left, so a
 * stage still gets clips when the helper is down or answers nonsense.
 */
export function pickHighlights(segments: Segment[], suggestions: Suggestion[] = [], max = MAX_CLIPS): Highlight[] {
  const ranked: Highlight[] = [];
  for (const s of suggestions.slice(0, 8)) {
    const h = snapSuggestion(segments, s);
    if (h) ranked.push({ ...h, hook: clean(s.hook) || h.hook, score: h.score + 4 });
  }
  ranked.push(...candidateWindows(segments).sort((a, b) => b.score - a.score));

  const picked: Highlight[] = [];
  for (const h of ranked) {
    if (picked.length >= max) break;
    // A window the heuristics hate is not worth posting even as a filler.
    if (h.score < -2) continue;
    const clash = picked.some((p) => Math.min(p.end, h.end) - Math.max(p.start, h.start) > MAX_OVERLAP_S);
    if (!clash) picked.push(h);
  }
  return picked;
}

// ── Suggested picks ───────────────────────────────────────────────────────────

export const HIGHLIGHT_PROMPT =
  'You pick short-form video clips from a timestamped transcript of a live audio room. ' +
  `Return ONLY a JSON array of up to ${MAX_CLIPS} objects {"start": number, "end": number, "hook": string, "title": string}. ` +
  `Each clip is ${MIN_CLIP_S}-${MAX_CLIP_S} seconds, uses start and end times from the transcript, ` +
  'and stands alone: it opens on a strong first line that needs no earlier context and ends when the thought is complete. ' +
  'Prefer a clear opinion, a surprising fact, a story with a payoff or a practical tip. ' +
  'Skip greetings, housekeeping, sound checks and anything sexual, hateful or about a private person. ' +
  '"hook" is the opening line as spoken (max 120 characters). "title" is 3-8 words. No markdown, no commentary.';

/** The transcript as `[start-end] text` lines, cut to fit a prompt budget. */
export function promptTranscript(segments: Segment[], budget = 14000): string {
  const lines: string[] = [];
  let used = 0;
  for (const s of segments) {
    const line = `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`;
    if (used + line.length > budget) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join('\n');
}

export function parseSuggestions(raw: string | null | undefined): Suggestion[] {
  if (!raw) return [];
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const at = text.indexOf('[');
  const to = text.lastIndexOf(']');
  if (at < 0 || to <= at) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(text.slice(at, to + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((c: any) => ({ start: Number(c?.start), end: Number(c?.end), hook: clean(c?.hook).slice(0, 160), title: clean(c?.title).slice(0, 80) }))
    .filter((c) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start);
}

// ── Captions ────────────────────────────────────────────────────────────────

export interface Word {
  text: string;
  start: number;
  end: number;
  /** First word of a transcript line: a new speaker turn or a new breath. */
  lineStart?: boolean;
}

export interface Cue {
  start: number;
  end: number;
  words: Word[];
}

/** Characters on one caption line at the size the clip burns them in. */
export const CUE_MAX_CHARS = 22;
export const CUE_MAX_S = 3;
const CUE_MIN_S = 0.6;

/**
 * Words of the clip's window on the clip's own clock (0 = clip start). A
 * segment's time is shared out by word length, plus one for the gap, so long
 * words hold the highlight longer. Words that fall mostly outside the window
 * are dropped rather than shown for a sliver of a second.
 */
export function clipWords(segments: Segment[], start: number, end: number): Word[] {
  const out: Word[] = [];
  for (const s of segments) {
    if (s.end <= start || s.start >= end) continue;
    const parts = words(s.text);
    const weight = parts.reduce((n, w) => n + w.length + 1, 0);
    let t = s.start;
    let first = true;
    for (const w of parts) {
      const d = ((w.length + 1) / weight) * (s.end - s.start);
      const mid = t + d / 2;
      if (mid >= start && mid <= end) {
        out.push({ text: w, start: round2(Math.max(0, t - start)), end: round2(Math.min(end, t + d) - start), ...(first ? { lineStart: true } : {}) });
        first = false;
      }
      t += d;
    }
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Words grouped into caption lines: a line breaks at CUE_MAX_CHARS, after
 * CUE_MAX_S, after a full stop or comma once it has a few words, and at any
 * pause or new transcript line. Lines never overlap, and a short line stays up long enough to read.
 */
export function buildCues(ws: Word[]): Cue[] {
  const cues: Cue[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) cues.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur });
    cur = [];
  };
  for (const w of ws) {
    if (cur.length) {
      const chars = cur.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length;
      const prev = cur[cur.length - 1];
      const pause = w.start - prev.end > 0.5;
      const breath = /[.!?…]$/.test(prev.text) || (/[,;:]$/.test(prev.text) && cur.length >= 3);
      if (chars > CUE_MAX_CHARS || w.end - cur[0].start > CUE_MAX_S || pause || breath || w.lineStart) flush();
    }
    cur.push(w);
  }
  flush();

  for (let i = 0; i < cues.length; i++) {
    const next = cues[i + 1];
    const want = Math.max(cues[i].end, cues[i].start + CUE_MIN_S);
    cues[i].end = round2(next ? Math.min(want, next.start) : want);
  }
  return cues;
}

// ── The subtitle file the worker burns in ───────────────────────────────────

export const WIDTH = 1080;
export const HEIGHT = 1920;

/** ASS clock: H:MM:SS.cc */
export function assTime(sec: number): string {
  const cs = Math.max(0, Math.round(sec * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h}:${pad(m)}:${pad(s)}.${pad(c)}`;
}

/** Spoken text never becomes an override tag or a line break. */
export function assEscape(s: string): string {
  return clean(s).replace(/\\/g, '⧵').replace(/[{}]/g, (c) => (c === '{' ? '(' : ')'));
}

export interface CardText {
  /** Shown on the end card, e.g. "Hear the full Stage". */
  title: string;
  /** Shown under it without a scheme, e.g. dehub.io/stages/42. */
  url: string;
  /** Who hosted, under the watermark. */
  host?: string;
}

/**
 * The whole overlay as one ASS script: karaoke captions (each word turns gold as
 * it is spoken), the corner watermark for the clip's length and the end card
 * for END_CARD_S after it. The worker only darkens the frame under the card;
 * every glyph comes from here.
 */
export function buildAss(cues: Cue[], clipSeconds: number, card: CardText): string {
  const total = clipSeconds + END_CARD_S;
  // Colours are &HAABBGGRR. Gold #F5C542, white, near-black outline.
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${WIDTH}`,
    `PlayResY: ${HEIGHT}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Caption,DejaVu Sans,70,&H0042C5F5,&H00FFFFFF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,6,2,2,90,90,560,1',
    'Style: Mark,DejaVu Sans,40,&H40FFFFFF,&H40FFFFFF,&H80101010,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,9,0,56,72,1',
    'Style: Host,DejaVu Sans,32,&H40FFFFFF,&H40FFFFFF,&H80101010,&H00000000,0,0,0,0,100,100,0,0,1,2,0,9,0,56,124,1',
    'Style: Card,DejaVu Sans,72,&H00FFFFFF,&H00FFFFFF,&H00101010,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,5,80,80,0,1',
    'Style: CardUrl,DejaVu Sans,56,&H0042C5F5,&H0042C5F5,&H00101010,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,5,80,80,0,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const events: string[] = [];
  events.push(`Dialogue: 1,${assTime(0)},${assTime(clipSeconds)},Mark,,0,0,0,,DeHub`);
  if (card.host) events.push(`Dialogue: 1,${assTime(0)},${assTime(clipSeconds)},Host,,0,0,0,,${assEscape(card.host).slice(0, 40)}`);

  for (const cue of cues) {
    if (cue.start >= clipSeconds) break;
    const end = Math.min(cue.end, clipSeconds);
    // \k counts centiseconds from the cue start; gaps between words go to the next word's lead.
    let at = cue.start;
    const parts = cue.words.map((w) => {
      const k = Math.max(1, Math.round((w.end - at) * 100));
      at = w.end;
      return `{\\k${k}}${assEscape(w.text)}`;
    });
    events.push(`Dialogue: 0,${assTime(cue.start)},${assTime(end)},Caption,,0,0,0,,${parts.join(' ')}`);
  }

  // The card fades in over the frozen last frame.
  events.push(`Dialogue: 2,${assTime(clipSeconds)},${assTime(total)},Card,,0,0,0,,{\\fad(250,0)\\pos(${WIDTH / 2},${HEIGHT / 2 - 90})}${assEscape(card.title)}`);
  events.push(`Dialogue: 2,${assTime(clipSeconds)},${assTime(total)},CardUrl,,0,0,0,,{\\fad(250,0)\\pos(${WIDTH / 2},${HEIGHT / 2 + 30})}${assEscape(card.url)}`);
  events.push(`Dialogue: 2,${assTime(clipSeconds)},${assTime(total)},Mark,,0,0,0,,{\\fad(250,0)\\an5\\pos(${WIDTH / 2},${HEIGHT / 2 + 150})\\fs44}DeHub`);
  return [...header, ...events, ''].join('\n');
}

// ── Who is never clipped ────────────────────────────────────────────────────

const ADULT_WORDS = /(^|[^a-z0-9])(nsfw|18\+|porn\w*|xxx|onlyfans|nudes?|hentai|r34|sex\w*)(?=$|[^a-z0-9])/i;

/** True when a stage's own words say it is adult. The picker prompt skips such parts too. */
export function looksMature(...texts: (string | null | undefined)[]): boolean {
  return ADULT_WORDS.test(texts.map((t) => clean(String(t ?? ''))).join(' '));
}

export interface HostAccount {
  isBanned?: boolean;
  banned?: boolean;
  matureAccount?: boolean;
  isMature?: boolean;
}

export function hostBlocksClips(host: HostAccount | null | undefined): boolean {
  if (!host) return true;
  return !!(host.isBanned || host.banned || host.matureAccount || host.isMature);
}
