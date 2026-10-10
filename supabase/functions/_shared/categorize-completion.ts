import { tryFree } from './free-models.ts';
import { createUsageMeter } from './ai-usage.ts';

export class CategorizationUnavailable extends Error {
  constructor() { super('Categorization providers unavailable; post remains pending'); }
}

/** Categorization never falls through to a paid Google or Lovable request. */
export async function categorizeCompletion(
  body: Record<string, unknown>,
  publicContent: boolean,
): Promise<Response | null> {
  const meter = createUsageMeter('categorize', 'free-categorization');
  try {
    return await tryFree(body, {
      label: 'categorize', expectToolCall: 'categorize_post',
      publicContent, allowVision: true, meter,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      console.warn('categorize: provider deadline exceeded');
      return null;
    }
    throw error;
  } finally {
    meter.flush();
  }
}
