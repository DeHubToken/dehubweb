import { createUsageMeter, type ProviderAttempt } from '../_shared/ai-usage.ts';

/** One request owns its fallback reason and its aggregate write. */
export function createTranslationUsage() {
  const meter = createUsageMeter('translate-text', 'translation');
  let fallback = 'none';
  return {
    meter,
    get fallback() { return fallback; },
    skip(provider: string, reason: string) { fallback = `${provider}_${reason}`; },
    start(provider: string, model: string, route: ProviderAttempt['route']) {
      const started = Date.now();
      const previous = fallback;
      let recorded = false;
      return (status: number, outcome: string, payload?: unknown) => {
        if (recorded) return;
        recorded = true;
        meter.record({ provider, model, route, status, outcome, fallback: previous, elapsedMs: Date.now() - started }, payload);
        if (outcome !== 'accepted') fallback = `${provider}_${outcome === 'http_error' ? `http_${status}` : outcome}`;
      };
    },
    flush() { meter.flush(); },
  };
}

export type TranslationUsage = ReturnType<typeof createTranslationUsage>;
