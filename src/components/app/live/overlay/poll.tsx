/**
 * Live polls on screen.
 *
 * The same widget is drawn in three places: over a viewer's player, where the
 * options are real buttons; on the OBS page, where the poll is burned into
 * video and the way to vote is `!vote 2` in chat; and in Live Studio's
 * preview. Which one it is comes from PollContext, not from the widget.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthenticationError } from '@/lib/api/dehub/core';
import { getStreamPoll, voteInPoll } from '@/lib/api/dehub/live-polls';
import { isPollOpen, pollLeaders, pollShares, type LivePoll } from '@/lib/live-overlay/polls';
import { setting } from '@/lib/live-overlay/registry';

export interface PollState {
  poll: LivePoll | null;
  myVote: number | null;
  /** In the app the options are buttons; a burned-in picture cannot be tapped. */
  interactive: boolean;
  vote?: (option: number) => void;
  voting?: boolean;
  /** Why the last vote did not count, if it did not. */
  problem?: 'signIn' | 'failed' | null;
}

export const PollContext = createContext<PollState>({ poll: null, myVote: null, interactive: false });

const VOTE_KEY = 'dehub.pollVote.';

function rememberedVote(pollId: string): number | null {
  try {
    const v = window.sessionStorage.getItem(VOTE_KEY + pollId);
    return v == null ? null : Number(v);
  } catch {
    return null;
  }
}

function rememberVote(pollId: string, option: number) {
  try {
    window.sessionStorage.setItem(VOTE_KEY + pollId, String(option));
  } catch {
    /* private mode: the highlight just does not survive a refresh */
  }
}

/** A newer copy of the same poll, or a different poll altogether. Late, older copies are ignored. */
function newer(current: LivePoll | null, incoming: LivePoll): boolean {
  if (!current || current.id !== incoming.id) return true;
  if (incoming.closed !== current.closed) return incoming.closed;
  return incoming.total >= current.total;
}

/**
 * The stream's current poll, kept up to date from its room. `canVote` adds the
 * vote action; the OBS page leaves it off.
 */
export function useStreamPoll(streamId: string | null | undefined, canVote: boolean): Omit<PollState, 'interactive'> {
  const [poll, setPoll] = useState<LivePoll | null>(null);
  const [myVote, setMyVote] = useState<number | null>(null);
  const [voting, setVoting] = useState(false);
  const [problem, setProblem] = useState<PollState['problem']>(null);
  const pollRef = useRef<LivePoll | null>(null);

  const take = useCallback((incoming: LivePoll | null) => {
    if (!incoming) return;
    if (!newer(pollRef.current, incoming)) return;
    if (pollRef.current?.id !== incoming.id) {
      setMyVote(rememberedVote(incoming.id));
      setProblem(null);
    }
    pollRef.current = incoming;
    setPoll(incoming);
  }, []);

  useEffect(() => {
    pollRef.current = null;
    setPoll(null);
    setMyVote(null);
    if (!streamId) return;
    let cancelled = false;
    let sub: { leave: () => void } | null = null;
    getStreamPoll(streamId)
      .then((p) => !cancelled && take(p))
      .catch(() => undefined);
    import('@/lib/api/dehub/overlay-control')
      .then(({ watchStreamPoll }) => {
        if (!cancelled) sub = watchStreamPoll(streamId, take);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      sub?.leave();
    };
  }, [streamId, take]);

  const vote = useCallback(
    (option: number) => {
      const current = pollRef.current;
      if (!streamId || !current || voting || myVote != null || !isPollOpen(current)) return;
      setVoting(true);
      setProblem(null);
      voteInPoll(streamId, current.id, option)
        .then((res) => {
          setMyVote(res.myVote);
          rememberVote(current.id, res.myVote);
          take(res.poll);
        })
        .catch((err) => {
          if (err instanceof AuthenticationError) setProblem('signIn');
          else if ((err as { httpStatus?: number })?.httpStatus === 400) take({ ...current, closed: true });
          else setProblem('failed');
        })
        .finally(() => setVoting(false));
    },
    [streamId, voting, myVote, take],
  );

  return { poll, myVote, vote: canVote ? vote : undefined, voting, problem };
}

/** Seconds left, ticking once a second while the poll is open. */
function useSecondsLeft(poll: LivePoll | null): number {
  const left = () => (poll ? Math.max(0, Math.ceil((new Date(poll.endsAt).getTime() - Date.now()) / 1000)) : 0);
  const [seconds, setSeconds] = useState(left);
  useEffect(() => {
    setSeconds(left());
    if (!poll || poll.closed) return;
    const id = window.setInterval(() => setSeconds(left()), 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll?.id, poll?.endsAt, poll?.closed]);
  return seconds;
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function PollWidget({ settings }: { settings: Record<string, unknown> }) {
  const { t } = useTranslation();
  const { poll, myVote, interactive, vote, voting, problem } = useContext(PollContext);
  const seconds = useSecondsLeft(poll);
  if (!poll) return null;

  const open = !poll.closed && seconds > 0;
  const shares = pollShares(poll);
  const leaders = pollLeaders(poll);
  const tint = setting(settings, 'accent', '#ffffff');
  const canTap = interactive && open && myVote == null && !!vote && !voting;
  const rows = poll.options.length;

  return (
    <div data-ow-poll style={{ '--ow-accent': HEX.test(tint) ? tint : '#ffffff', '--ow-rows': rows } as CSSProperties}>
      <div data-ow-poll-head>
        <span data-ow-poll-q>{poll.question}</span>
        <span data-ow-poll-time>{open ? clock(seconds) : t('liveOverlay.poll.closed')}</span>
      </div>
      <div data-ow-poll-options>
        {poll.options.map((option, i) => {
          const body = (
            <>
              <span data-ow-poll-fill style={{ transform: `scaleX(${shares[i] / 100})` }} />
              <span data-ow-poll-n>{i + 1}</span>
              <span data-ow-poll-text>{option.text}</span>
              <span data-ow-poll-pct>{shares[i]}%</span>
            </>
          );
          const state = {
            'data-mine': myVote === i || undefined,
            'data-leader': (!open && leaders.has(i)) || undefined,
          };
          return interactive ? (
            <button
              key={i}
              type="button"
              data-ow-poll-option
              {...state}
              disabled={!canTap}
              aria-pressed={myVote === i}
              aria-label={t('liveOverlay.poll.voteFor', { option: option.text })}
              onClick={() => vote?.(i)}
            >
              {body}
            </button>
          ) : (
            <div key={i} data-ow-poll-option {...state}>
              {body}
            </div>
          );
        })}
      </div>
      <div data-ow-poll-foot>
        {problem === 'signIn'
          ? t('liveOverlay.poll.signIn')
          : problem === 'failed'
            ? t('liveOverlay.poll.failed')
            : interactive
              ? myVote != null
                ? t('liveOverlay.poll.voted', { count: poll.total })
                : t('liveOverlay.poll.votes', { count: poll.total })
              : open
                ? t('liveOverlay.poll.howToVote', { count: poll.total, command: '!vote' })
                : t('liveOverlay.poll.votes', { count: poll.total })}
      </div>
    </div>
  );
}
