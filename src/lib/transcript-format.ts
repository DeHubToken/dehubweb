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
