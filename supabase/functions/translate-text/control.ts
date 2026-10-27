import { controlRpc, controlledProviderFetch, ProviderControlError } from '../_shared/provider-control.ts';

export function translationControl(bulk: boolean, deadline = Date.now() + 120000) {
  const configured = Number(Deno.env.get('TRANSLATION_DAILY_CAP') ?? 20000);
  const cap = Number.isSafeInteger(configured) && configured >= 0 ? Math.min(configured,20000) : 20000;
  return async (provider: string, url: string, init: RequestInit): Promise<Response> => {
    if (Date.now() >= deadline - 20000) throw new ProviderControlError('TRANSLATION_BUDGET_UNAVAILABLE');
    const body = String(init.body ?? '');
    const request = JSON.parse(body);
    const output = Number(request.max_completion_tokens ?? request.max_tokens ?? request.generationConfig?.maxOutputTokens);
    if (!Number.isSafeInteger(output) || output < 1) throw new ProviderControlError('TRANSLATION_BUDGET_UNAVAILABLE');
    const timeout = AbortSignal.timeout(15000);
    return controlledProviderFetch(provider, url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout }, async () => {
      let allowed: boolean;
      try {
        allowed = await controlRpc<boolean>('reserve_translation_attempt', {
          p_bulk: bulk, p_input_bytes: new TextEncoder().encode(body).length, p_output_tokens: output, p_cap: cap,
        });
      } catch { throw new ProviderControlError('TRANSLATION_BUDGET_UNAVAILABLE'); }
      if (allowed !== true) throw new ProviderControlError('TRANSLATION_BUDGET_EXHAUSTED', 300);
    });
  };
}
