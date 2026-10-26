/**
 * The broadcaster's guest controls: open seats, invite, take requests, mute,
 * remove — and, when another creator has invited this one, join them.
 *
 * Glass on black like the other broadcaster panels; it floats over the
 * picture on a phone and sits under it on desktop.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Loader2, Mic, MicOff, Swords, UserPlus, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { searchUsers } from '@/lib/api/dehub/users';
import type { DeHubUser } from '@/lib/api/dehub/types';
import { battlePhase, battleSides, BATTLE_DURATIONS_S, costreamJoinPath, MAX_COSTREAM_GUESTS } from '@/lib/live/costream-api';
import { participantLabel, type UseCoStreamHost } from '@/hooks/use-costream-host';

const ROW = 'flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-2 text-xs text-white';
const ICON_BTN =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white hover:bg-white/20 disabled:opacity-50';
const TEXT_BTN =
  'inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-lg border border-white/15 bg-white/10 px-2.5 text-[11px] font-medium text-white hover:bg-white/20 disabled:opacity-50';

function useUserSearch(query: string) {
  const [results, setResults] = useState<DeHubUser[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const q = query.trim().replace(/^@/, '');
    if (q.length < 2) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchUsers({ q, limit: 5 })
        .then((res) => { if (!cancelled) setResults((res.data || []).filter((u) => u.address)); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);
  return { results, loading };
}

function FindPartner({ co }: { co: UseCoStreamHost }) {
  const { t } = useTranslation();
  if (co.searching) {
    return (
      <div className={ROW}>
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        <span className="min-w-0 flex-1">
          {co.searching.waiting > 1
            ? t('costream.searchingCount', { defaultValue: 'Looking for a co-streamer… {{count}} creators searching', count: co.searching.waiting })
            : t('costream.searching', { defaultValue: 'Looking for a co-streamer…' })}
        </span>
        <button type="button" className={TEXT_BTN} disabled={co.busy} onClick={() => void co.cancelFind()}>
          {t('costream.cancel', { defaultValue: 'Cancel' })}
        </button>
      </div>
    );
  }
  return (
    <button type="button" className={cn(TEXT_BTN, 'h-9 w-full text-xs')} disabled={co.busy} onClick={() => void co.findPartner()}>
      <Users className="h-3.5 w-3.5" />
      {t('costream.findPartner', { defaultValue: 'Find a co-streamer' })}
    </button>
  );
}

function BattleControls({ co }: { co: UseCoStreamHost }) {
  const { t } = useTranslation();
  const sides = battleSides(co.state);
  if (!sides) return null;
  const running = battlePhase(co.state?.room) === 'running';
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {t('costream.battle', { defaultValue: 'Gift battle' })}
      </p>
      {running ? (
        <button type="button" className={cn(TEXT_BTN, 'h-9 w-full text-xs')} disabled={co.busy} onClick={() => void co.endBattle()}>
          {t('costream.endBattle', { defaultValue: 'End the round now' })}
        </button>
      ) : (
        <div className="flex gap-1.5">
          {BATTLE_DURATIONS_S.map((seconds) => (
            <button key={seconds} type="button" className={cn(TEXT_BTN, 'h-9 flex-1 text-xs')} disabled={co.busy}
              onClick={() => void co.battle(seconds)}>
              <Swords className="h-3.5 w-3.5" />
              {t('costream.battleMinutes', { defaultValue: '{{count}} min', count: seconds / 60 })}
            </button>
          ))}
        </div>
      )}
      <p className="text-[11px] text-zinc-500">
        {t('costream.battleHint', {
          defaultValue: 'Each side scores the gifts its own stream is paid during the round. Both audiences see the bar.',
        })}
      </p>
    </div>
  );
}

export function CoStreamHostPanel({ co, className }: { co: UseCoStreamHost; className?: string }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const { results, loading } = useUserSearch(query);
  const { state, role } = co;

  useEffect(() => {
    if (co.error) toast.error(co.error);
  }, [co.error]);

  const copyLink = async () => {
    if (!state) return;
    const url = `${window.location.origin}${costreamJoinPath(state.room.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('costream.linkCopied', { defaultValue: 'Invite link copied' }));
    } catch {
      toast.message(url);
    }
  };

  const incoming = co.incoming.length > 0 && (
    <div className="space-y-1.5">
      {co.incoming.map((seat) => (
        <div key={seat.id} className={ROW}>
          <span className="min-w-0 flex-1 truncate">
            {t('costream.invitedYou', {
              defaultValue: '{{name}} invited you onto their live',
              name: participantLabel(seat.room.host_username, seat.room.host_wallet),
            })}
          </span>
          <button type="button" className={TEXT_BTN} disabled={co.busy} onClick={() => void co.joinInvite(seat.id)}>
            {t('costream.join', { defaultValue: 'Join' })}
          </button>
          <button type="button" className={ICON_BTN} disabled={co.busy} onClick={() => void co.declineIncoming(seat.id)}
            aria-label={t('costream.decline', { defaultValue: 'Decline' })}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );

  if (!state) {
    return (
      <div className={cn('space-y-3', className)}>
        {incoming}
        <div>
          <p className="text-sm font-semibold text-white">{t('costream.title', { defaultValue: 'Guests' })}</p>
          <p className="mt-1 text-[11px] text-zinc-400">
            {t('costream.intro', {
              defaultValue: 'Bring up to {{count}} people on screen with you. Invite someone, or let viewers ask to join.',
              count: MAX_COSTREAM_GUESTS,
            })}
          </p>
        </div>
        <button type="button" className={cn(TEXT_BTN, 'h-9 w-full text-xs')} disabled={co.busy} onClick={() => void co.open()}>
          {co.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          {t('costream.openSeats', { defaultValue: 'Open guest seats' })}
        </button>
        <FindPartner co={co} />
        <p className="text-[11px] text-zinc-500">
          {t('costream.findHint', { defaultValue: 'Pairs you with another creator who is live right now, ready for a gift battle.' })}
        </p>
      </div>
    );
  }

  if (role === 'guest') {
    const host = participantLabel(state.room.host_username, state.room.host_wallet);
    return (
      <div className={cn('space-y-3', className)}>
        <p className="text-sm font-semibold text-white">
          {t('costream.onTheirLive', { defaultValue: "You're on {{name}}'s live", name: host })}
        </p>
        <OnScreenList co={co} canManage={false} />
        <button type="button" className={cn(TEXT_BTN, 'h-9 w-full text-xs')} disabled={co.busy} onClick={() => void co.leave()}>
          {t('costream.leave', { defaultValue: 'Leave their live' })}
        </button>
      </div>
    );
  }

  const full = co.onScreen.length >= MAX_COSTREAM_GUESTS;

  return (
    <div className={cn('space-y-3', className)}>
      {incoming}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white">{t('costream.title', { defaultValue: 'Guests' })}</p>
        <button type="button" className={TEXT_BTN} onClick={() => void copyLink()}>
          <Copy className="h-3 w-3" />
          {t('costream.copyLink', { defaultValue: 'Copy invite link' })}
        </button>
      </div>

      <label className="flex items-center justify-between gap-3 text-[11px] text-zinc-300">
        {t('costream.allowRequests', { defaultValue: 'Let viewers ask to join' })}
        <input
          type="checkbox"
          className="h-4 w-4 accent-white"
          checked={state.room.accepting_requests}
          disabled={co.busy}
          onChange={(e) => void co.setRequests(e.target.checked)}
        />
      </label>

      <div className="space-y-1.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('costream.searchPlaceholder', { defaultValue: 'Invite by username' })}
          className="h-9 w-full rounded-lg border border-white/15 bg-white/5 px-3 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/30"
        />
        {loading && <Loader2 className="mx-auto h-4 w-4 animate-spin text-white/60" />}
        {results.map((user) => (
          <div key={user.address} className={ROW}>
            <span className="min-w-0 flex-1 truncate">{participantLabel(user.username, user.address!)}</span>
            <button
              type="button"
              className={TEXT_BTN}
              disabled={co.busy || full}
              onClick={() => { void co.invite(user.address!, user.username).then(() => setQuery('')); }}
            >
              {t('costream.invite', { defaultValue: 'Invite' })}
            </button>
          </div>
        ))}
      </div>

      {co.requests.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            {t('costream.requests', { defaultValue: 'Asking to join' })}
          </p>
          {co.requests.map((seat) => (
            <div key={seat.id} className={ROW}>
              <span className="min-w-0 flex-1 truncate">{participantLabel(seat.username, seat.wallet)}</span>
              <button type="button" className={ICON_BTN} disabled={co.busy || full} onClick={() => void co.accept(seat.id)}
                aria-label={t('costream.accept', { defaultValue: 'Bring on screen' })}>
                <Check className="h-3.5 w-3.5" />
              </button>
              <button type="button" className={ICON_BTN} disabled={co.busy} onClick={() => void co.decline(seat.id)}
                aria-label={t('costream.decline', { defaultValue: 'Decline' })}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <OnScreenList co={co} canManage />

      <BattleControls co={co} />
      {co.onScreen.length === 0 && <FindPartner co={co} />}

      {co.invited.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            {t('costream.waiting', { defaultValue: 'Invited' })}
          </p>
          {co.invited.map((seat) => (
            <div key={seat.id} className={cn(ROW, 'text-zinc-300')}>
              <span className="min-w-0 flex-1 truncate">{participantLabel(seat.username, seat.wallet)}</span>
              <button type="button" className={ICON_BTN} disabled={co.busy} onClick={() => void co.remove(seat.id)}
                aria-label={t('costream.cancelInvite', { defaultValue: 'Cancel invite' })}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className={cn(TEXT_BTN, 'h-9 w-full text-xs')} disabled={co.busy} onClick={() => void co.close()}>
        {t('costream.closeSeats', { defaultValue: 'Close guest seats' })}
      </button>
      <p className="text-[11px] text-zinc-500">
        {t('costream.headphones', { defaultValue: 'Headphones stop guests hearing themselves back.' })}
      </p>
    </div>
  );
}

function OnScreenList({ co, canManage }: { co: UseCoStreamHost; canManage: boolean }) {
  const { t } = useTranslation();
  if (co.onScreen.length === 0) {
    return canManage ? (
      <p className="text-[11px] text-zinc-500">{t('costream.nobody', { defaultValue: 'Nobody is on screen with you yet.' })}</p>
    ) : null;
  }
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {t('costream.onScreen', { defaultValue: 'On screen' })}
      </p>
      {co.onScreen.map((p) => (
        <div key={p.wallet} className={ROW}>
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', p.connected ? 'bg-emerald-400' : 'bg-zinc-500')} />
          <span className="min-w-0 flex-1 truncate">
            {p.label}
            {!p.connected && (
              <span className="ml-1 text-zinc-500">{t('costream.connecting', { defaultValue: 'connecting…' })}</span>
            )}
          </span>
          {canManage && p.seat && (
            <>
              <button type="button" className={ICON_BTN} disabled={co.busy} onClick={() => void co.mute(p.seat!.id, !p.seat!.muted)}
                aria-label={p.seat.muted ? t('costream.unmute', { defaultValue: 'Unmute' }) : t('costream.mute', { defaultValue: 'Mute' })}>
                {p.seat.muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </button>
              <button type="button" className={TEXT_BTN} disabled={co.busy} onClick={() => void co.remove(p.seat!.id)}>
                {t('costream.remove', { defaultValue: 'Remove' })}
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
