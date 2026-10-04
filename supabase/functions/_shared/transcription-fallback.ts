export interface CaptionResult {
  segments: { text: string }[];
  fullText: string;
  durationSeconds: number | null;
}

export function hasCaptions(result: CaptionResult): boolean {
  return result.segments.some((segment) => segment.text.trim()) && !!result.fullText.trim();
}

/** An empty primary result is inconclusive until a second engine has listened. */
export async function transcribeWithFallback<T extends CaptionResult>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  const result = await primary();
  if (hasCaptions(result)) return result;
  const recovered = await fallback();
  return { ...recovered, durationSeconds: recovered.durationSeconds ?? result.durationSeconds };
}
