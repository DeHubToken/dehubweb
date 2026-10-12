import type { UsageMeter } from "../_shared/ai-usage.ts";

interface Dependencies {
  meter: (model: unknown) => UsageMeter;
  free: (body: Record<string, unknown>, signal: AbortSignal, meter: UsageMeter) => Promise<Response | null>;
  paid: (body: Record<string, unknown>, signal: AbortSignal) => Promise<Response>;
}

/** Use the configured image route first; preserve the existing fallback. */
export function createVisualCompletion(deps: Dependencies) {
  return async (body: Record<string, unknown>, signal: AbortSignal): Promise<Response> => {
    if (signal.aborted) throw new Error("cancelled");
    const meter = deps.meter(body.model);
    try {
      const free = await deps.free(body, signal, meter);
      if (signal.aborted) throw new Error("cancelled");
      return free ?? await deps.paid(body, signal);
    } finally { if (!meter.streaming) meter.flush(); }
  };
}
