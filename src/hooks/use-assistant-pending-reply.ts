/**
 * The gap between tagging @assistant and its answer arriving.
 *
 * The API answers a mention by writing a real comment, but it has to call the
 * model first — several seconds, sometimes longer under load. The refetch that
 * runs immediately after posting is therefore always too early: the reply is
 * not written yet, and without this the thread just sits there looking like the
 * bot ignored you until something else happens to refresh it.
 *
 * So: arm on posting a comment that mentions the bot, poll the comments query
 * while waiting, and stop as soon as an assistant comment appears that is newer
 * than the moment we armed. The `isWaiting` flag is what the thread renders a
 * placeholder from.
 *
 * Polling rather than a socket because comments have no realtime channel — the
 * thread is query-backed everywhere it appears.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isAssistantAddress } from '@/lib/assistant';

/** How often to look for the reply. */
const POLL_INTERVAL_MS = 2_500;

/**
 * How long to keep looking. Past this the bot is assumed to have stayed silent
 * — rate limited, disabled, or the model timed out — and the placeholder is
 * cleared rather than left spinning forever.
 */
const GIVE_UP_AFTER_MS = 45_000;

interface AssistantAwareComment {
  address?: string;
  createdAt?: Date | string | number;
}

export function useAssistantPendingReply(
  tokenId: string | number | undefined,
  comments: AssistantAwareComment[] | undefined,
) {
  const queryClient = useQueryClient();
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const timers = useRef<{ poll?: ReturnType<typeof setInterval>; stop?: ReturnType<typeof setTimeout> }>({});

  const clear = useCallback(() => {
    if (timers.current.poll) clearInterval(timers.current.poll);
    if (timers.current.stop) clearTimeout(timers.current.stop);
    timers.current = {};
    setArmedAt(null);
  }, []);

  /** Call after posting a comment that mentions the assistant. */
  const arm = useCallback(() => {
    // A second mention while already waiting just extends the wait — restarting
    // the clock is right, since the newer question is the one being answered.
    setArmedAt(Date.now());
  }, []);

  useEffect(() => {
    if (armedAt === null || tokenId === undefined) return;

    timers.current.poll = setInterval(() => {
      queryClient.refetchQueries({ queryKey: ['comments', String(tokenId)] });
    }, POLL_INTERVAL_MS);
    timers.current.stop = setTimeout(clear, GIVE_UP_AFTER_MS);

    return () => {
      if (timers.current.poll) clearInterval(timers.current.poll);
      if (timers.current.stop) clearTimeout(timers.current.stop);
    };
  }, [armedAt, tokenId, queryClient, clear]);

  // Stop as soon as the answer is on screen.
  useEffect(() => {
    if (armedAt === null || !comments?.length) return;

    const answered = comments.some((c) => {
      if (!isAssistantAddress(c.address)) return false;
      const at = c.createdAt ? new Date(c.createdAt).getTime() : 0;
      // Compared against the arm time so an assistant comment already in the
      // thread from an earlier question does not count as this answer. The
      // allowance absorbs clock skew between the server row and the browser.
      return at >= armedAt - 10_000;
    });

    if (answered) clear();
  }, [comments, armedAt, clear]);

  useEffect(() => clear, [clear]);

  return { isWaiting: armedAt !== null, arm };
}
