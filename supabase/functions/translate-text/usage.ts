import { createUsageMeter, type ProviderAttempt } from '../_shared/ai-usage.ts';
import { translationControl } from './control.ts';
import { ProviderControlError } from '../_shared/provider-control.ts';

/** One request owns its fallback reason and its aggregate write. */
export function createTranslationUsage(bulk = false, deadline?: number) {
  const meter = createUsageMeter('translate-text', 'translation');
  const controlledFetch = translationControl(bulk, deadline);
  let blocked: ProviderControlError | undefined;
  let skipped = false;
  let fallback = 'none';
  return {
    meter,
    get blocked() { return blocked; },
    async fetchProvider(provider: string, url: string, init: RequestInit) {
      skipped = false;
      if (blocked) { skipped = true; throw blocked; }
      try { return await controlledFetch(provider,url,init); }
      catch (error) {
        if (error instanceof ProviderControlError) {
          skipped = true;
          if (error.code.startsWith('TRANSLATION_BUDGET')) blocked = error;
        }
        throw error;
      }
    },
    get fallback() { return fallback; },
    skip(provider: string, reason: string) { fallback = `${provider}_${reason}`; },
    start(provider: string, model: string, route: ProviderAttempt['route']) {
      const started = Date.now();
      const previous = fallback;
      let recorded = false;
      return (status: number, outcome: string, payload?: unknown) => {
        if (skipped) return;
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
