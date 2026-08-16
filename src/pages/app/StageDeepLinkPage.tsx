/**
 * StageDeepLinkPage - Handles /stage/:id and /stages/:n invite links
 *
 * One page, two URL shapes: /stage/<uuid> is the original invite link,
 * /stages/<n> the short share form riding audio_spaces.short_id. Both resolve
 * to the same row and render identically, so links already in the wild keep
 * working.
 *
 * A live stage is joined straight away for a signed-in visitor and the page
 * bounces to the app, which is what an invite link has always done. A
 * signed-out visitor is NOT bounced: the link's whole promise is "come hear
 * this", so the page becomes a listen-only player — Agora audience, no
 * account — with the login path offered for anyone who wants a seat.
 *
 * A *scheduled* stage has nothing to join yet, so the same URL has to be able
 * to stand still and be a page: it shows the announcement — graphic, title,
 * when — plus a reminder bell (signed in), an add-to-calendar file (works for
 * everyone), and the host's own controls to start it.
 *
 * Both standing states (announcement, guest player) run their card full width
 * at the top of the page, with an ad slot and the latest text posts
 * (RelatedPostsFeed) below, so a shared link lands on a living page rather
 * than a lone card in empty space.
 */

import { BrandIcon } from '@/components/app/war/WarHudIcon';
import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { CalendarDays, CalendarPlus, Radio, Loader2, Copy, Bell, BellRing, Headphones, Square, Users } from 'lucide-react';
import { useStage } from '@/contexts/StageContext';
import { useAuth } from '@/contexts/AuthContext';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import { dehubLinkFor } from '@/lib/dehub-links';
import { useStageReminder } from '@/hooks/use-stage-reminders';
import { downloadStageIcs } from '@/lib/stage-calendar';
import { stageUtcClock } from '@/lib/stage-time';
import { StageCoverArt } from '@/components/app/stages/StageCoverArt';
import { StageHostLink } from '@/components/app/stages/StageHostLink';
import { StageReminderFaces } from '@/components/app/stages/StageReminderFaces';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import stagesMicIcon from '@/assets/icons/stages-mic-icon.png';
import { DeHubPageLoader } from '@/components/app/DeHubLoader';
import { RelatedPostsFeed } from '@/components/app/feeds/RelatedPostsFeed';
import { toast } from 'sonner';
import type { AudioSpace } from '@/types/audio-spaces.types';

export default function StageDeepLinkPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    joinSpace, currentSpace, openModal, startScheduledSpace,
    guestListen, guestStopListening, guestSpace, isConnected, isLoading: stageActionBusy,
  } = useStage();
  const { isAuthenticated, walletAddress } = useAuth();
  const joinedRef = useRef(false);
  const [starting, setStarting] = useState(false);

  const { data: stage, isLoading } = useQuery({
    queryKey: ['stage-by-param', id],
    enabled: !!id,
    queryFn: async () => {
      // The short link is all digits; anything else is the uuid form.
      const base = supabase.from('audio_spaces').select('*');
      const { data, error } = await (/^\d+$/.test(id!)
        ? base.eq('short_id', Number(id))
        : base.eq('id', id!)
      ).single();
      if (error) throw error;
      return data as AudioSpace;
    },
  });

  const { hasReminder, toggleReminder, isToggling } = useStageReminder(stage?.id);

  // Stop a listen-only session when the page unmounts — for a guest, this page
  // IS the player, and audio with no visible control is a haunting, not a
  // feature. Tracked via ref so the unmount cleanup sees the latest state.
  const guestActiveRef = useRef(false);
  guestActiveRef.current = !!(stage && guestSpace?.id === stage.id);
  useEffect(() => {
    return () => {
      if (guestActiveRef.current) void guestStopListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!stage || joinedRef.current || isLoading) return;

    // If already in this space, just open the modal
    if (currentSpace?.id === stage.id) {
      openModal('live');
      navigate('/app', { replace: true });
      return;
    }

    // Only a live stage auto-joins, and only for someone who can hold a seat.
    // A signed-out visitor gets the listen-only page rendered below instead of
    // the old bounce to /app, which read as the link being broken.
    if (stage.status === 'ended') {
      navigate('/stages', { replace: true });
      return;
    }
    if (stage.status !== 'live' || !isAuthenticated) return;

    joinedRef.current = true;

    joinSpace(stage.id)
      .then((success) => {
        if (success) {
          openModal('live');
        }
        // Navigate to home either way — mini player or modal will be visible
        navigate('/app', { replace: true });
      })
      .catch(() => {
        // A rejected join (invalid stage, network error) previously left the
        // user stuck on this spinner forever.
        navigate('/app', { replace: true });
      });
  }, [stage, isAuthenticated, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const isScheduled = stage?.status === 'scheduled';
  const startsAt = stage?.scheduled_at ? new Date(stage.scheduled_at) : null;
  const isOverdue = !!startsAt && startsAt.getTime() < Date.now();
  const isHost =
    !!walletAddress &&
    stage?.host_wallet_address?.toLowerCase() === walletAddress.toLowerCase();

  const copyLink = () => {
    if (!stage) return;
    navigator.clipboard.writeText(dehubLinkFor.stage(stage)).then(
      () => toast.success('Link copied'),
      () => toast.error('Could not copy link'),
    );
  };

  const avatar = stage
    ? buildAvatarUrl(stage.host_wallet_address || '', stage.host_avatar) ||
      buildAvatarCdnFallbackUrl(stage.host_wallet_address || '')
    : undefined;

  // ── Scheduled stage: the announcement, as a page ─────────────────────────

  if (isScheduled && stage) {
    return (
      <div data-glass-page className="min-h-screen bg-black p-4">
        <SEOHead
          title={`${stage.title} — Upcoming Stage on DeHub`}
          description={
            stage.description ||
            'An upcoming live audio Stage on DeHub — the decentralized, open source social platform.'
          }
          noindex
        />

        <div className="relative w-full rounded-2xl overflow-hidden border border-white/10">
          {stage.cover_image_url && (
            <StageCoverArt src={stage.cover_image_url} title={stage.title} />
          )}
          <div className="relative p-6 bg-zinc-900">
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10 mb-3">
              <CalendarDays className="w-3 h-3 text-zinc-300" />
              <span className="text-zinc-300 text-[11px] font-medium">
                {isOverdue ? 'STARTING SOON' : 'UPCOMING STAGE'}
              </span>
            </div>

            <h1 className="text-white text-xl font-semibold">{stage.title}</h1>

            {startsAt && (
              <p className="text-zinc-300 text-sm mt-2 flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4 shrink-0" />
                {format(startsAt, 'EEEE, d MMMM · h:mm a')}
                <span className="text-zinc-500">· {stageUtcClock(startsAt)}</span>
                {!isOverdue && (
                  <span className="text-zinc-500">· in {formatDistanceToNowStrict(startsAt)}</span>
                )}
              </p>
            )}

            {stage.description && (
              <p className="text-zinc-400 text-sm mt-3">{stage.description}</p>
            )}

            <div className="flex items-center gap-2 mt-4">
              <StageHostLink
                space={stage}
                avatarUrl={avatar || undefined}
                className="group/host flex items-center gap-2 min-w-0"
              >
                <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 bg-zinc-700">
                  {avatar && <img src={avatar} alt="" className="w-full h-full object-cover" />}
                </div>
                <span className="text-sm text-zinc-400 group-hover/host:text-white transition-colors">
                  Hosted by @{stage.host_username || stage.host_wallet_address?.slice(0, 6)}
                </span>
              </StageHostLink>
            </div>

            <StageReminderFaces spaceId={stage.id} className="mt-3" />

            <div className="flex gap-2 mt-5">
              {isHost ? (
                <button
                  onClick={async () => {
                    setStarting(true);
                    try {
                      const ok = await startScheduledSpace(stage.id);
                      if (ok) {
                        openModal('live');
                        navigate('/app', { replace: true });
                      }
                    } finally {
                      setStarting(false);
                    }
                  }}
                  disabled={starting}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black hover:bg-white/90 text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                  Start now
                </button>
              ) : isAuthenticated ? (
                <Button
                  onClick={toggleReminder}
                  disabled={isToggling}
                  aria-pressed={hasReminder}
                  variant={hasReminder ? 'secondary' : 'default'}
                  className="flex-1 h-auto py-2.5"
                >
                  {hasReminder ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                  {hasReminder ? 'Reminder set' : 'Remind me'}
                </Button>
              ) : (
                <button
                  onClick={() => navigate('/app')}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-white text-black hover:bg-white/90 text-sm font-medium transition-colors"
                >
                  Log in to get notified
                </button>
              )}
              <button
                onClick={() => downloadStageIcs(stage)}
                title="Add to calendar"
                aria-label="Add to calendar"
                className="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
              >
                <CalendarPlus className="w-4 h-4" />
              </button>
              <button
                onClick={copyLink}
                aria-label="Copy invite link"
                className="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <RelatedPostsFeed currentPostId={stage.id} />
      </div>
    );
  }

  // ── Live stage, signed out: the page is the player ───────────────────────

  if (stage && stage.status === 'live' && !isAuthenticated) {
    const listening = guestSpace?.id === stage.id && isConnected;
    const inRoom = Math.max(1, (stage.speaker_count || 1) + (stage.listener_count || 0));

    return (
      <div data-glass-page className="min-h-screen bg-black p-4">
        <SEOHead
          title={`${stage.title} — Live on DeHub`}
          description={
            stage.description ||
            'A live audio Stage on DeHub — listen in now, no account needed.'
          }
          noindex
        />

        <div className="relative w-full rounded-2xl overflow-hidden border border-white/10">
          {stage.cover_image_url && (
            <StageCoverArt src={stage.cover_image_url} title={stage.title} />
          )}
          <div className="relative p-6 bg-zinc-900">
            <div className="flex items-center justify-between mb-3">
              <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
                <span className="text-red-400 text-[11px] font-medium">LIVE NOW</span>
              </div>
              <span className="flex items-center gap-1 text-zinc-400 text-xs">
                <Users className="w-3.5 h-3.5" />
                {inRoom}
              </span>
            </div>

            <h1 className="text-white text-xl font-semibold">{stage.title}</h1>

            {stage.description && (
              <p className="text-zinc-400 text-sm mt-3">{stage.description}</p>
            )}

            <div className="flex items-center gap-2 mt-4">
              <StageHostLink
                space={stage}
                avatarUrl={avatar || undefined}
                className="group/host flex items-center gap-2 min-w-0"
              >
                <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 bg-zinc-700">
                  {avatar && <img src={avatar} alt="" className="w-full h-full object-cover" />}
                </div>
                <span className="text-sm text-zinc-400 group-hover/host:text-white transition-colors">
                  Hosted by @{stage.host_username || stage.host_wallet_address?.slice(0, 6)}
                </span>
              </StageHostLink>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => {
                  if (listening) void guestStopListening();
                  else void guestListen(stage.id);
                }}
                disabled={stageActionBusy}
                className={cn(
                  'flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60',
                  listening
                    ? 'bg-white/10 hover:bg-white/20 text-white'
                    : 'bg-white text-black hover:bg-white/90',
                )}
              >
                {stageActionBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : listening ? (
                  <Square className="w-4 h-4" fill="currentColor" />
                ) : (
                  <Headphones className="w-4 h-4" />
                )}
                {listening ? 'Stop listening' : 'Listen in'}
              </button>
              <button
                onClick={copyLink}
                aria-label="Copy invite link"
                className="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>

            {listening && (
              <p className="text-zinc-500 text-xs mt-3" role="status">
                You're listening as a guest.
              </p>
            )}

            <button
              onClick={() => navigate('/app')}
              className="w-full mt-3 px-4 py-2 rounded-xl text-zinc-400 hover:text-white text-xs transition-colors"
            >
              Log in to take the mic
            </button>
          </div>
        </div>

        <RelatedPostsFeed currentPostId={stage.id} />
      </div>
    );
  }

  // ── Live / loading ───────────────────────────────────────────────────────

  return (
    <div data-glass-page className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 text-white">
      {/* Shared invite links land here — without a title of its own, the page
          kept whatever document.title the previous route wrote. noindex to
          match the edge (the worker serves the real stage meta to crawlers),
          self-canonical (a cross-URL canonical alongside noindex is a mixed
          signal). */}
      <SEOHead
        title="Join a Live Stage — DeHub"
        description="You've been invited to a live audio Stage on DeHub. Join the room, listen in and take the mic on the decentralized social platform."
        noindex
      />
      <BrandIcon src={stagesMicIcon} alt="" className="w-16 h-16 object-contain opacity-80" />
      <DeHubPageLoader size={48} minHeight="0" label="Joining stage..." />
    </div>
  );
}
