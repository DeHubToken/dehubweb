import { useCallback, useEffect, useRef, useState } from 'react';

/** One turn of context handed to the drafter. Trimmed by the edge function. */
export interface SmartReplyTurn {
  from: 'me' | 'them';
  name?: string;
  text: string;
}

export interface SmartReplySuggestion {
  /** 2-4 words naming the move — "Turn it back". This is what users read. */
  label: string;
  /** The reply itself, inserted into the composer on tap. */
  text: string;
}

type Status = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

// Same publishable values src/integrations/supabase/client.ts bakes in — they
// ship in every browser bundle by design. Duplicated here because the client
// keeps url/key behind protected accessors and this endpoint only needs them
// as plain fetch inputs.
const FUNCTIONS_BASE =
  import.meta.env.VITE_SUPABASE_URL || 'https://aigxuutjaqsywioxjefr.supabase.co';
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I';

/**
 * Drafts two replies against the newest turns of the thread — whichever side
 * holds the last word. When the user spoke last the function drafts follow-ups
 * that move the chat along rather than a reply to oneself.
 *
 * The composer spends the call either when it raises the tray (pointer
 * devices) or when the resting strip under the composer needs chips to show
 * (touch) — at most once per incoming message either way.
 *
 * The call goes out as a plain fetch carrying only the publishable apikey.
 * supabase-js's invoke() attaches whatever auth session it finds and wraps any
 * hiccup in an opaque "Failed to send a request to the Edge Function"; this
 * endpoint is unauthenticated by design, so none of that is needed here. One
 * automatic retry covers the cold-start blips edge functions are prone to.
 */
export function useSmartReplies(thread: SmartReplyTurn[], peerName?: string) {
  const [status, setStatus] = useState<Status>('idle');
  const [suggestions, setSuggestions] = useState<SmartReplySuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Identity of the thread tail the current suggestions were drafted against.
  const draftedFor = useRef<string | null>(null);
  const inFlight = useRef(false);

  const tailKey = thread.length
    ? `${thread.length}:${thread[thread.length - 1].from}:${thread[thread.length - 1].text.slice(0, 64)}`
    : '';

  // A reply that arrives after drafting makes the drafts answer the wrong
  // message, so drop them rather than let a stale card be sent.
  useEffect(() => {
    if (draftedFor.current && draftedFor.current !== tailKey) {
      draftedFor.current = null;
      setSuggestions([]);
      setStatus('idle');
      setError(null);
    }
  }, [tailKey]);

  const generate = useCallback(async () => {
    if (inFlight.current || thread.length === 0) return;

    inFlight.current = true;
    setStatus('loading');
    setError(null);

    const payload = JSON.stringify({ thread, peerName });
    const url = `${FUNCTIONS_BASE}/functions/v1/suggest-replies`;
    const headers = { 'Content-Type': 'application/json', apikey: ANON_KEY };

    try {
      let data: { suggestions?: unknown; error?: string } | null = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(url, { method: 'POST', headers, body: payload });
          data = await res.json().catch(() => null);
          if (res.ok && Array.isArray((data as { suggestions?: unknown } | null)?.suggestions)) break;
          // A refused request will be refused again; only transport-adjacent
          // failures (cold boot, dropped connection) deserve a second go.
          if (res.status < 500 && res.status !== 429) break;
        } catch {
          // Network-level failure: fall through to retry, then surface below.
        }
        if (attempt === 0) await new Promise((r) => setTimeout(r, 900));
        data = null;
      }

      const next: SmartReplySuggestion[] = Array.isArray(data?.suggestions)
        ? (data.suggestions as SmartReplySuggestion[])
        : [];
      if (next.length === 0) {
        setError(data?.error ? String(data.error) : 'Could not draft replies');
        setStatus('error');
        return;
      }

      setSuggestions(next);
      draftedFor.current = tailKey;
      setStatus('ready');
    } finally {
      inFlight.current = false;
    }
  }, [thread, peerName, tailKey]);

  const reset = useCallback(() => {
    draftedFor.current = null;
    setSuggestions([]);
    setStatus('idle');
    setError(null);
  }, []);

  // Exposed so the composer can open the tray at most once per incoming
  // message: it remembers the key it last auto-opened for and compares.
  return { status, suggestions, error, generate, reset, tailKey };
}
