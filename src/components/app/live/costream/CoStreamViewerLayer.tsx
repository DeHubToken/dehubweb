/**
 * What a viewer sees of a co-stream on the live player: a way to ask onto
 * the screen, the host's invite when there is one, and the "you're in" moment
 * that opens the guest room.
 *
 * The picture itself needs nothing here — the guests are already in the
 * broadcast. This only polls the room, gently: every 15s for an ordinary
 * viewer, every 3s once they have asked or been asked.
 */
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Hand, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  acceptInvite,
  declineInvite,
  getCoStreamForStream,
  requestToJoin,
  type CoStreamState,
} from '@/lib/live/costream-api';
import { participantLabel } from '@/hooks/use-costream-host';

const CoStreamGuestRoom = lazy(() => import('./CoStreamGuestRoom'));

const IDLE_POLL_MS = 15_000;
const ACTIVE_POLL_MS = 3000;
const PILL =
  'pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/20 bg-black/40 px-3 text-[11px] font-medium text-white backdrop-blur-xl hover:bg-black/55 disabled:opacity-60';

export function CoStreamViewerLayer({
  streamId,
  owner,
  onRoomChange,
}: {
  streamId: string;
  /** The stream owner's wallet; rows naming anyone else are ignored. */
  owner?: string | null;
  /** The guest room opened or closed — the player should go quiet under it. */
  onRoomChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { walletAddress, user, isAuthenticated, openLoginModal } = useAuth();
  const me = walletAddress?.toLowerCase() ?? null;
  const [state, setState] = useState<CoStreamState | null>(null);
  const [busy, setBusy] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);

  const seat = me ? state?.seats.find((s) => s.wallet === me) ?? null : null;
  const pending = seat?.status === 'requested' || seat?.status === 'invited' || seat?.status === 'accepted';

  const load = useCallback(async () => {
    const next = await getCoStreamForStream(streamId, owner);
    setState(next);
  }, [streamId, owner]);

  useEffect(() => {
    if (roomOpen) return;
    let cancelled = false;
    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      void load().catch(() => { if (!cancelled) setState(null); });
    };
    tick();
    const timer = window.setInterval(tick, pending ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [load, pending, roomOpen]);

  useEffect(() => { onRoomChange?.(roomOpen); }, [roomOpen, onRoomChange]);

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

  if (!state || state.room.status !== 'active') return null;
  const room = state.room;
  // The host and their live partners run this from their own broadcaster.
  if (me && (room.host_wallet === me || (seat?.status === 'accepted' && seat.stream_id))) return null;

  const host = participantLabel(room.host_username, room.host_wallet);

  return (
    <>
      <div className="pointer-events-none absolute left-1/2 top-[max(3.25rem,calc(env(safe-area-inset-top)+3.25rem))] z-30 flex -translate-x-1/2 flex-col items-center gap-2">
        {seat?.status === 'invited' && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/20 bg-black/60 px-3 py-2 text-xs text-white backdrop-blur-xl">
            <span>{t('costream.hostInvitedYou', { defaultValue: '{{name}} invited you on screen', name: host })}</span>
            <button
              type="button"
              className={PILL}
              disabled={busy}
              onClick={() => void act(async () => {
                await acceptInvite(me!, seat.id, null, user?.username);
                setRoomOpen(true);
              })}
            >
              {t('costream.join', { defaultValue: 'Join' })}
            </button>
            <button type="button" className={PILL} disabled={busy} onClick={() => void act(() => declineInvite(me!, seat.id))}>
              {t('costream.notNow', { defaultValue: 'Not now' })}
            </button>
          </div>
        )}

        {seat?.status === 'accepted' && !roomOpen && (
          <button type="button" className={PILL} onClick={() => setRoomOpen(true)}>
            {t('costream.goOnScreen', { defaultValue: "You're in — go on screen" })}
          </button>
        )}

        {seat?.status === 'requested' && (
          <span className={PILL}>
            <Loader2 className="h-3 w-3 animate-spin" />
            {t('costream.requestSent', { defaultValue: 'Asked to join' })}
          </span>
        )}

        {room.accepting_requests && (!seat || seat.status === 'declined' || seat.status === 'left') && (
          <button
            type="button"
            className={PILL}
            disabled={busy}
            onClick={() => {
              if (!isAuthenticated || !me) { openLoginModal?.(); return; }
              void act(() => requestToJoin(me, room.id, user?.username));
            }}
          >
            <Hand className="h-3.5 w-3.5" />
            {t('costream.askToJoin', { defaultValue: 'Ask to join' })}
          </button>
        )}
      </div>

      {roomOpen && me && (
        <Suspense fallback={null}>
          <CoStreamGuestRoom
            roomId={room.id}
            wallet={me}
            onClose={() => { setRoomOpen(false); void load(); }}
          />
        </Suspense>
      )}
    </>
  );
}

export default CoStreamViewerLayer;
