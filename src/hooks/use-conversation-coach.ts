/**
 * Conversation coach — a tone check on a comment before it goes out.
 *
 * Calls the `conversation-coach` edge function with the draft and gets back
 * up to three flags (attacks the person, misstates their view, either-or
 * framing, sweeping claim, hostile tone), each with the phrase that triggered
 * it and one sentence on how to keep the point without it.
 *
 * Suggestions only, by design: the caller renders them beside a Post button
 * that stays live, and every failure here is silent — a coach that cannot be
 * reached must never look like a comment that cannot be posted. That is also
 * why this is a plain fetch with the publishable key rather than
 * supabase-js's invoke(): the endpoint is unauthenticated and an opaque
 * "Failed to send a request" would be noise the composer has to hide anyway.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type CoachFlagKind = 'ad_hominem' | 'straw_man' | 'false_dilemma' | 'overgeneralisation' | 'hostile_tone';

export interface CoachFlag {
  kind: CoachFlagKind;
  /** The exact words from the draft the flag is about. May be empty. */
  quote: string;
  /** One sentence for the writer. */
  suggestion: string;
}

export type CoachMode = 'coach' | 'commonGround';
export type CoachStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Below this the button is not offered — there is nothing to review yet. */
export const COACH_MIN_CHARS = 40;
/** The function refuses longer drafts with a 400; the composer caps at this too. */
export const COACH_MAX_CHARS = 2000;

const KINDS: readonly CoachFlagKind[] = ['ad_hominem', 'straw_man', 'false_dilemma', 'overgeneralisation', 'hostile_tone'];

// Same publishable values src/integrations/supabase/client.ts bakes in — they
// ship in every browser bundle by design.
const FUNCTIONS_BASE =
  import.meta.env.VITE_SUPABASE_URL || 'https://aigxuutjaqsywioxjefr.supabase.co';
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I';

const DEBOUNCE_MS = 350;

function sanitiseFlags(raw: unknown): CoachFlag[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    .filter((f) => typeof f.kind === 'string' && KINDS.includes(f.kind as CoachFlagKind))
    .map((f) => ({
      kind: f.kind as CoachFlagKind,
      quote: typeof f.quote === 'string' ? f.quote.trim() : '',
      suggestion: typeof f.suggestion === 'string' ? f.suggestion.trim() : '',
    }))
    .filter((f) => f.suggestion.length > 0)
    .slice(0, 3);
}

/**
 * One request to the coach. Resolves to the flags, or null when the coach
 * could not answer (network, rate limit, aborted). Exported for callers that
 * want the promise without the hook's state.
 */
export async function fetchCoachFlags(
  text: string,
  mode: CoachMode = 'coach',
  signal?: AbortSignal,
): Promise<CoachFlag[] | null> {
  const draft = text.trim().slice(0, COACH_MAX_CHARS);
  if (!draft) return [];
  try {
    const res = await fetch(`${FUNCTIONS_BASE}/functions/v1/conversation-coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
      body: JSON.stringify({ text: draft, mode }),
      signal,
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== 'object') return null;
    return sanitiseFlags((data as { flags?: unknown }).flags);
  } catch {
    return null;
  }
}

export function useConversationCoach() {
  const [status, setStatus] = useState<CoachStatus>('idle');
  const [flags, setFlags] = useState<CoachFlag[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancel();
    };
  }, [cancel]);

  /**
   * Review the draft. Debounced so a double tap costs one call, and any call
   * still in flight is dropped in favour of the newest draft. Resolves to the
   * flags, or null when the coach could not answer.
   */
  const check = useCallback((text: string, mode: CoachMode = 'coach'): Promise<CoachFlag[] | null> => {
    cancel();
    setStatus('loading');
    return new Promise((resolve) => {
      timerRef.current = setTimeout(async () => {
        timerRef.current = null;
        const controller = new AbortController();
        abortRef.current = controller;
        const result = await fetchCoachFlags(text, mode, controller.signal);
        if (abortRef.current !== controller) {
          // Superseded by a newer check; that one owns the state now.
          resolve(null);
          return;
        }
        abortRef.current = null;
        if (!mountedRef.current) {
          resolve(null);
          return;
        }
        if (result === null) {
          setFlags([]);
          setStatus('error');
        } else {
          setFlags(result);
          setStatus('ready');
        }
        resolve(result);
      }, DEBOUNCE_MS);
    });
  }, [cancel]);

  const dismiss = useCallback((index: number) => {
    setFlags((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const reset = useCallback(() => {
    cancel();
    setFlags([]);
    setStatus('idle');
  }, [cancel]);

  return { status, flags, check, dismiss, reset };
}
