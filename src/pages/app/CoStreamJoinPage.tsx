/**
 * /app/live/join/:id — the link a host sends to bring someone on screen.
 *
 * Opens straight onto the decision: join (for someone the host invited),
 * ask to join (for anyone else, while the host takes requests), or sign in.
 * Joining opens the same guest room the live player uses. The share card for
 * the link is rendered at the edge (CLOUDFLARE_WORKER_SEO.js, costream route);
 * this page writes the same title for browsers.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Hand, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { useAuth } from '@/contexts/AuthContext';
import { getLiveStream } from '@/lib/api/dehub/livestream';
import {
  acceptInvite,
  declineInvite,
  getCoStream,
  requestToJoin,
  type CoStreamState,
} from '@/lib/live/costream-api';
import { participantLabel } from '@/hooks/use-costream-host';
import CoStreamGuestRoom from '@/components/app/live/costream/CoStreamGuestRoom';

const BTN =
  'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-60';

export default function CoStreamJoinPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { walletAddress, user, isAuthenticated, openLoginModal } = useAuth();
  const me = walletAddress?.toLowerCase() ?? null;
  const [state, setState] = useState<CoStreamState | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);

  const load = useCallback(async () => setState(await getCoStream(id)), [id]);
  const seat = me ? state?.seats.find((s) => s.wallet === me) ?? null : null;
  const waiting = seat?.status === 'requested' || seat?.status === 'invited';

  useEffect(() => {
    if (roomOpen) return;
    void load();
    const timer = window.setInterval(() => void load(), waiting ? 3000 : 15_000);
    return () => window.clearInterval(timer);
  }, [load, waiting, roomOpen]);

  const room = state?.room;
  const { data: stream } = useQuery({
    queryKey: ['costream-join-stream', room?.host_stream_id],
    queryFn: () => getLiveStream(room!.host_stream_id).then((r) => r.result),
    enabled: !!room?.host_stream_id,
    staleTime: 60_000,
  });

  const host = room ? participantLabel(room.host_username, room.host_wallet) : '';
  const live = room?.status === 'active';
  const title = host
    ? t('costream.joinTitle', { defaultValue: 'Join {{name}} live on DeHub', name: host })
    : t('costream.joinTitleGeneric', { defaultValue: 'Join a live on DeHub' });

  const act = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('costream.couldNotJoin', { defaultValue: 'Could not join the live' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-10 text-white">
      <SEOHead
        title={title}
        description={t('costream.joinDescription', {
          defaultValue: 'You have been invited on screen in a live video stream on DeHub. Open the link to join with your camera.',
        })}
        noindex
      />

      {state === undefined ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-white/60" />
      ) : !room || !live ? (
        <div className="space-y-4 text-center">
          <h1 className="text-xl font-semibold">{t('costream.linkEnded', { defaultValue: 'This live has ended' })}</h1>
          <p className="text-sm text-zinc-400">
            {t('costream.linkEndedBody', { defaultValue: 'The host has closed their guest seats. Catch them next time they go live.' })}
          </p>
          <Link to="/" className={BTN}>{t('costream.home', { defaultValue: 'Go to DeHub' })}</Link>
        </div>
      ) : (
        <div className="space-y-5 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="space-y-1.5">
            <span className="inline-flex h-6 items-center gap-1.5 rounded-lg bg-red-500 px-2 text-[10px] font-semibold uppercase tracking-wide">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              {t('costream.liveNow', { defaultValue: 'Live now' })}
            </span>
            <h1 className="text-xl font-semibold">{title}</h1>
            {stream?.title && <p className="text-sm text-zinc-400">{stream.title}</p>}
          </div>

          {!isAuthenticated || !me ? (
            <button type="button" className={BTN} onClick={() => openLoginModal?.()}>
              {t('costream.signInToJoin', { defaultValue: 'Sign in to join' })}
            </button>
          ) : me === room.host_wallet ? (
            <p className="text-sm text-zinc-400">
              {t('costream.yourOwnLink', { defaultValue: 'This is your own invite link. Send it to the person you want on screen.' })}
            </p>
          ) : seat?.status === 'invited' ? (
            <div className="space-y-2">
              <button
                type="button"
                className={BTN}
                disabled={busy}
                onClick={() => void act(async () => {
                  await acceptInvite(me, seat.id, null, user?.username);
                  setRoomOpen(true);
                })}
              >
                {t('costream.joinWithCamera', { defaultValue: 'Join with camera' })}
              </button>
              <button type="button" className="w-full text-xs text-zinc-400" disabled={busy}
                onClick={() => void act(() => declineInvite(me, seat.id))}>
                {t('costream.notNow', { defaultValue: 'Not now' })}
              </button>
            </div>
          ) : seat?.status === 'accepted' ? (
            <button type="button" className={BTN} onClick={() => setRoomOpen(true)}>
              {t('costream.goOnScreen', { defaultValue: "You're in — go on screen" })}
            </button>
          ) : seat?.status === 'requested' ? (
            <p className="flex items-center gap-2 text-sm text-zinc-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('costream.waitingForHost', { defaultValue: 'Asked to join. Waiting for the host…' })}
            </p>
          ) : seat?.status === 'removed' ? (
            <p className="text-sm text-zinc-400">{t('costream.removedBody', { defaultValue: 'The host took you off screen.' })}</p>
          ) : room.accepting_requests ? (
            <button type="button" className={BTN} disabled={busy}
              onClick={() => void act(() => requestToJoin(me, room.id, user?.username))}>
              <Hand className="h-4 w-4" />
              {t('costream.askToJoin', { defaultValue: 'Ask to join' })}
            </button>
          ) : (
            <p className="text-sm text-zinc-400">
              {t('costream.notTaking', { defaultValue: 'The host is not taking requests right now.' })}
            </p>
          )}

          {stream?.tokenId != null && (
            <Link to={`/video/${stream.tokenId}`} className="block text-center text-xs text-zinc-400 underline-offset-2 hover:underline">
              {t('costream.watchInstead', { defaultValue: 'Just watch the live' })}
            </Link>
          )}
          <p className="text-[11px] text-zinc-500">
            {t('costream.headphonesGuest', { defaultValue: 'Use headphones so the host does not hear themselves back.' })}
          </p>
        </div>
      )}

      {roomOpen && me && room && (
        <CoStreamGuestRoom roomId={room.id} wallet={me} onClose={() => { setRoomOpen(false); void load(); }} />
      )}
    </div>
  );
}
