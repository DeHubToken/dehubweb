/**
 * Turn an assistant reply into text a voice can read out.
 *
 * Markdown is stripped and line breaks become pauses. When the reply is longer
 * than the voice accepts, it is cut at the last full sentence that fits rather
 * than mid-word, so a spoken reply never stops halfway through a sentence.
 */
export function speechText(text: string, maxChars = Infinity): string {
  const clean = text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // A line that already ends in punctuation keeps it; others get a full stop.
    .replace(/([.!?:;,])?[ \t]*\n+\s*/g, (_m, p: string | undefined) => (p ? `${p} ` : '. '))
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (clean.length <= maxChars) return clean;
  const head = clean.slice(0, maxChars);
  const lastStop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
  if (lastStop > maxChars * 0.3) return head.slice(0, lastStop + 1);
  const lastSpace = head.lastIndexOf(' ');
  return (lastSpace > 0 ? head.slice(0, lastSpace) : head).trim();
}

/**
 * Split speech into sentence-sized pieces. Browsers' built-in voices drop or
 * skip parts of long utterances (Chrome stops one after about 15 seconds), so
 * each sentence is queued as its own utterance.
 */
export function speechSentences(text: string, maxChunk = 220): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text];
  const out: string[] = [];
  for (const raw of sentences) {
    let s = raw.trim();
    while (s.length > maxChunk) {
      const cut = s.lastIndexOf(' ', maxChunk);
      const at = cut > maxChunk * 0.5 ? cut : maxChunk;
      out.push(s.slice(0, at).trim());
      s = s.slice(at).trim();
    }
    if (s) out.push(s);
  }
  return out;
}
