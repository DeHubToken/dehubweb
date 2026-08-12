import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

/**
 * Drafts replies to the newest incoming message.
 *
 * Never fires on mount. The composer calls generate() when it raises the tray,
 * which is at most once per incoming message — suggestions are a paid call on a
 * surface that receives unsolicited traffic, so anyone who can DM the user must
 * not be able to spend against the rate limit just by typing. The guard in
 * generate() is the backstop: a thread the user spoke last in never costs a
 * request, whichever surface asks.
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
    if (inFlight.current) return;
    // Nothing to reply to — no thread, or the user spoke last and the drafter
    // would be answering them. Belt and braces with the caller's own check: the
    // request is paid, so the refusal belongs where no caller can skip it.
    const tail = thread[thread.length - 1];
    if (!tail || tail.from === 'me') {
      setSuggestions([]);
      setStatus('empty');
      return;
    }

    inFlight.current = true;
    setStatus('loading');
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('suggest-replies', {
        body: { thread, peerName },
      });

      if (fnError) {
        setError(fnError.message || 'Could not draft replies');
        setStatus('error');
        return;
      }

      const next: SmartReplySuggestion[] = Array.isArray(data?.suggestions) ? data.suggestions : [];
      if (next.length === 0) {
        // 'awaiting-reply' is the expected no-op: the user sent last, so there
        // is nothing to reply to. Not an error, just nothing to show.
        setSuggestions([]);
        setStatus('empty');
        return;
      }

      setSuggestions(next);
      draftedFor.current = tailKey;
      setStatus('ready');
    } catch {
      setError('Could not draft replies');
      setStatus('error');
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
