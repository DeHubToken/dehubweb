/** Formatting helpers for stage transcripts: TXT, SRT, timestamps, deep-links. */

export interface FormatSegment {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

export interface SpeakerInfo {
  /** Pretty name to show before the segment text. */
  name: string;
}

export function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function srtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const ms = Math.floor((seconds % 1) * 1000);
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

export function formatTxt(
  segments: FormatSegment[],
  speakerName: (speaker: string) => string,
): string {
  return segments
    .map((s) => `[${formatTimestamp(s.start)}] ${speakerName(s.speaker)}: ${s.text}`)
    .join('\n');
}

export function formatSrt(
  segments: FormatSegment[],
  speakerName: (speaker: string) => string,
): string {
  return segments
    .map((s, i) => {
      const idx = i + 1;
      const head = `${idx}\n${srtTime(s.start)} --> ${srtTime(s.end || s.start + 2)}`;
      return `${head}\n${speakerName(s.speaker)}: ${s.text}\n`;
    })
    .join('\n');
}

// ── Karaoke-style line splitter ────────────────────────────────────────────
// Break a long subtitle cue into short single-line chunks (~maxChars each)
// and distribute its duration proportionally by character length.

interface TimedSegment {
  start: number;
  end: number;
  text: string;
}

const MIN_CUE_DURATION = 0.6;

function chunkText(text: string, maxChars: number): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const words = clean.split(' ');
  const chunks: string[] = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxChars) {
      current += ' ' + w;
    } else {
      chunks.push(current);
      current = w;
    }
  }
  if (current) chunks.push(current);
  // Merge a tiny trailing orphan (1 word or <= 8 chars) into previous chunk
  if (chunks.length >= 2) {
    const last = chunks[chunks.length - 1];
    if (last.length <= 8 || !last.includes(' ')) {
      chunks[chunks.length - 2] = chunks[chunks.length - 2] + ' ' + last;
      chunks.pop();
    }
  }
  return chunks;
}

export function splitSegmentIntoLines<T extends TimedSegment>(
  segment: T,
  maxChars = 38,
): T[] {
  const chunks = chunkText(segment.text, maxChars);
  if (chunks.length <= 1) return [segment];
  const total = Math.max(0, segment.end - segment.start);
  const charsTotal = chunks.reduce((acc, c) => acc + c.length, 0) || 1;
  let cursor = segment.start;
  const out: T[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const share = (chunks[i].length / charsTotal) * total;
    const start = cursor;
    const end = i === chunks.length - 1 ? segment.end : start + share;
    out.push({ ...segment, start, end, text: chunks[i] });
    cursor = end;
  }
  return out;
}

export function splitSegmentsIntoLines<T extends TimedSegment>(
  segments: T[],
  maxChars = 38,
): T[] {
  const out: T[] = [];
  for (const seg of segments) {
    for (const piece of splitSegmentIntoLines(seg, maxChars)) {
      // Avoid strobing on extremely short cues
      if (out.length && piece.end - piece.start < MIN_CUE_DURATION) {
        const prev = out[out.length - 1];
        prev.end = piece.end;
        prev.text = (prev.text + ' ' + piece.text).trim();
      } else {
        out.push(piece);
      }
    }
  }
  return out;
}

// ── VTT re-chunker ─────────────────────────────────────────────────────────
function parseVttTime(t: string): number {
  // hh:mm:ss.mmm or mm:ss.mmm
  const parts = t.trim().split(':');
  let h = 0, m = 0, s = 0;
  if (parts.length === 3) {
    h = parseInt(parts[0], 10) || 0;
    m = parseInt(parts[1], 10) || 0;
    s = parseFloat(parts[2]) || 0;
  } else if (parts.length === 2) {
    m = parseInt(parts[0], 10) || 0;
    s = parseFloat(parts[1]) || 0;
  }
  return h * 3600 + m * 60 + s;
}

function fmtVttTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const ms = Math.round((seconds % 1) * 1000);
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

export function rechunkVtt(vtt: string, maxChars = 38): string {
  if (!vtt) return vtt;
  const lines = vtt.split(/\r?\n/);
  const cues: TimedSegment[] = [];
  const TIMING = /(\d{1,2}:\d{2}(?::\d{2})?\.\d{3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?\.\d{3})/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TIMING);
    if (!m) continue;
    const start = parseVttTime(m[1]);
    const end = parseVttTime(m[2]);
    const textLines: string[] = [];
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== '' && !TIMING.test(lines[j])) {
      textLines.push(lines[j]);
      j++;
    }
    const text = textLines.join(' ').replace(/\s+/g, ' ').trim();
    if (text) cues.push({ start, end, text });
    i = j - 1;
  }
  const split = splitSegmentsIntoLines(cues, maxChars);
  const out = ['WEBVTT', ''];
  split.forEach((c, idx) => {
    out.push(String(idx + 1));
    out.push(`${fmtVttTime(c.start)} --> ${fmtVttTime(c.end)}`);
    out.push(c.text);
    out.push('');
  });
  return out.join('\n');
}

export function downloadFile(content: string, filename: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
