// MyMemory limits each segment to 500 UTF-8 bytes, not 500 JS characters.
// Preserve whitespace separately so title/body separators survive translation.
export function translationChunks(text: string): string[] {
  const chunks: string[] = [];
  for (const paragraph of text.split(/(\n+)/)) {
    if (!paragraph) continue;
    if (!paragraph.trim()) { chunks.push(paragraph); continue; }
    let remaining = paragraph;
    while (remaining) {
      let bytes = 0;
      let end = 0;
      for (const char of remaining) {
        const size = new TextEncoder().encode(char).length;
        if (bytes + size > 480) break;
        bytes += size;
        end += char.length;
      }
      if (end < remaining.length) {
        const prefix = remaining.slice(0, end);
        const sentence = [...prefix.matchAll(/[.!?]\s+/g)].at(-1);
        const space = prefix.lastIndexOf(' ');
        if (sentence && sentence.index! > end / 2) end = sentence.index! + 1;
        else if (space > 0) end = space;
      }
      chunks.push(remaining.slice(0, end));
      remaining = remaining.slice(end);
      const whitespace = remaining.match(/^\s+/)?.[0];
      if (whitespace) { chunks.push(whitespace); remaining = remaining.slice(whitespace.length); }
    }
  }
  return chunks;
}
