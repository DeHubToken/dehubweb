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
 * An *ended* stage stands still too. It used to redirect to /stages, which
 * quietly destroyed every stage link the moment its room closed: the
 * announcement post someone shared last week stopped pointing at the stage and
 * started pointing at a list of twenty recent ones. So the same card survives
 * the end — same art, same title, same host — and gains what the stage drew:
 * who turned up, how many have listened back, how long it ran, and the
 * recording itself.
 *
 * All three standing states run their card full width at the top of the page,
 * with an ad slot and the latest text posts (RelatedPostsFeed) below, so a
 * shared link lands on a living page rather than a lone card in empty space.
 */

import { BrandIcon } from '@/components/app/war/WarHudIcon';
import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { CalendarDays, CalendarPlus, Radio, Loader2, Share2, Bell, BellRing, Headphones, Square, Users, Clock, Play, Pause, PictureInPicture2, FileText } from 'lucide-react';
import { useStage } from '@/contexts/StageContext';
import { useAuth } from '@/contexts/AuthContext';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import { dehubLinkFor } from '@/lib/dehub-links';
import { useStageReminder } from '@/hooks/use-stage-reminders';
import { downloadStageIcs } from '@/lib/stage-calendar';
import { ShareEntityDrawer } from '@/components/app/ShareEntityDrawer';
import { StageCoverArt } from '@/components/app/stages/StageCoverArt';
import { StageHostLink } from '@/components/app/stages/StageHostLink';
import { StageReminderFaces } from '@/components/app/stages/StageReminderFaces';
import { StageScreenShare } from '@/components/app/spaces/StageScreenShare';
import { StageChat } from '@/components/app/spaces/StageChat';
import { StageTranscriptDrawer } from '@/components/app/spaces/StageTranscriptDrawer';
import { StaticWaveform } from '@/components/app/audio/StaticWaveform';
import { StageCaptionsButton, StageCaptionsOverlay } from '@/components/app/spaces/StageCaptions';
import { BadgedName } from '@/components/app/BadgedName';
import { Button } from '@/components/ui/button';
import { useAppTheme } from '@/contexts/ThemeContext';
import {
  closeStagePopout,
  popOutStageRecording,
  seekStageRecording,
  toggleStageRecording,
  useStagePlayback,
} from '@/lib/stage-playback';
import { cn } from '@/lib/utils';
import stagesMicIcon from '@/assets/icons/stages-mic-icon.png';
import { DeHubPageLoader } from '@/components/app/DeHubLoader';
import { RelatedPostsFeed } from '@/components/app/feeds/RelatedPostsFeed';
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
    // People open an announcement link early and sit on it — and this page had
    // no way to learn the stage started. The go-live toast navigates here, but
    // for someone already parked on the page that navigation is a no-op
    // against a cached 'scheduled' row, so the room opened and the very people
    // waiting on the announcement card were the last to know. Poll while the
    // stage has not ended; once live, the fresh row triggers the auto-join /
    // guest-player logic below on its own. 15s is one indexed single-row read
    // against a page someone is deliberately camping on.
    refetchInterval: (query) =>
      query.state.data && query.state.data.status !== 'ended' ? 15_000 : false,
  });

  const { hasReminder, toggleReminder, isToggling } = useStageReminder(stage?.id);

  // Who actually turned up. speaker_count/listener_count are a *live*
  // headcount, so by the time a stage ends they read whatever the room emptied
  // out to — usually zero. Participant rows persist instead (leaving sets
  // left_at rather than deleting), so counting them is the only honest answer
  // to "how many were there". Signed-out guests never get a row by design, so
  // this counts people who held a seat.
  const { data: attended = 0 } = useQuery({
    queryKey: ['stage-attendance', stage?.id],
    enabled: !!stage && stage.status === 'ended',
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from('space_participants')
        .select('*', { count: 'exact', head: true })
        .eq('space_id', stage!.id);
      return count ?? 0;
    },
  });

  const playback = useStagePlayback();
  const { theme } = useAppTheme();
  // Light/minimal are paper themes: white waveform bars vanish on them.
  const isPaper = theme === 'light' || theme === 'minimal';
  const [transcriptOpen, setTranscriptOpen] = useState(false);

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
    // Everything else — scheduled, ended, or a signed-out visitor — gets one
    // of the standing pages rendered below rather than a bounce elsewhere,
    // which read as the link being broken.
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

  // The share sheet replaces the old copy-only button: copy link, send in a
  // DM, or post to feed — the same options a post's share button offers.
  const [shareOpen, setShareOpen] = useState(false);

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
                <BadgedName
                  lookupId={stage.host_username || stage.host_wallet_address}
                  className="text-sm text-zinc-400 group-hover/host:text-white transition-colors"
                >
                  Hosted by @{stage.host_username || stage.host_wallet_address?.slice(0, 6)}
                </BadgedName>
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
                onClick={() => setShareOpen(true)}
                title="Share stage"
                aria-label="Share stage"
                className="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* The room's chat, on the page a shared link lands on. Both standing
            states get it: an announced stage can be talked about before it
            starts, and a guest listening in with no account can at least read
            what the room is saying — signing in is what buys a turn in it.
            Same rows the live room writes, so nothing said here is stranded
            on this page. */}
        <StageChat space={stage} className="mt-4" listClassName="h-56" />

        <RelatedPostsFeed currentPostId={stage.id} />

        <ShareEntityDrawer
          open={shareOpen}
          onOpenChange={setShareOpen}
          url={dehubLinkFor.stage(stage)}
          shareTitle={stage.title}
        />
      </div>
    );
  }

  // ── Ended stage: the same card, plus what the stage drew ─────────────────

  if (stage && stage.status === 'ended') {
    // Loaded and playing are different states: a paused recording keeps its
    // place on the bar and its lit controls, it just stops moving.
    const isLoaded = playback.spaceId === stage.id;
    const isPlaying = isLoaded && !playback.paused;
    const isPoppedOut = isLoaded && playback.popout;
    const endedAt = stage.ended_at ? new Date(stage.ended_at) : null;
    const ranFor =
      stage.started_at && stage.ended_at
        ? Math.max(
            1,
            Math.round(
              (new Date(stage.ended_at).getTime() - new Date(stage.started_at).getTime()) / 60000,
            ),
          )
        : null;

    return (
      <div data-glass-page className="min-h-screen bg-black p-4">
        <SEOHead
          title={`${stage.title} — Stage on DeHub`}
          description={
            stage.description ||
            'A past live audio Stage on DeHub — listen back to the recording.'
          }
          noindex
        />

        <div className="relative w-full rounded-2xl overflow-hidden border border-white/10">
          {stage.cover_image_url && (
            <StageCoverArt src={stage.cover_image_url} title={stage.title} />
          )}
          <div className="relative p-6 bg-zinc-900">
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10 mb-3">
              <Clock className="w-3 h-3 text-zinc-400" />
              <span className="text-zinc-400 text-[11px] font-medium">ENDED</span>
            </div>

            <h1 className="text-white text-xl font-semibold">{stage.title}</h1>

            {endedAt && (
              <p className="text-zinc-400 text-sm mt-2">
                Aired {format(endedAt, 'EEEE, d MMMM · h:mm a')}
                <span className="text-zinc-500"> · {formatDistanceToNowStrict(endedAt)} ago</span>
              </p>
            )}

            {stage.description && (
              <p className="text-zinc-400 text-sm mt-3">{stage.description}</p>
            )}

            {/* What the stage drew. Attendance and listens measure different
                things and both are worth saying: one is the room, the other is
                everyone who came to the recording afterwards. */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-sm text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-zinc-500" />
                <span className="text-white font-medium">{attended}</span> attended
              </span>
              <span className="flex items-center gap-1.5">
                <Headphones className="w-4 h-4 text-zinc-500" />
                <span className="text-white font-medium">{stage.total_listens ?? 0}</span> listened
              </span>
              {ranFor !== null && (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-zinc-500" />
                  <span className="text-white font-medium">{ranFor}</span> min
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-4">
              <StageHostLink
                space={stage}
                avatarUrl={avatar || undefined}
                className="group/host flex items-center gap-2 min-w-0"
              >
                <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 bg-zinc-700">
                  {avatar && <img src={avatar} alt="" className="w-full h-full object-cover" />}
                </div>
                <BadgedName
                  lookupId={stage.host_username || stage.host_wallet_address}
                  className="text-sm text-zinc-400 group-hover/host:text-white transition-colors"
                >
                  Hosted by @{stage.host_username || stage.host_wallet_address?.slice(0, 6)}
                </BadgedName>
              </StageHostLink>
            </div>

            {stage.recording_url ? (
              <>
                {/* Seekable, and the bar plays from wherever it is pressed —
                    the same shared player the Recorded tab and the card in the
                    feed drive, so pressing play here stops anything else
                    running. The control beside it lifts the audio into the
                    corner player, which no longer appears on its own. */}
                <div className="flex items-center gap-3 mt-5">
                  <button
                    onClick={() => toggleStageRecording(stage)}
                    aria-label={isPlaying ? 'Pause recording' : 'Play recording'}
                    className="shrink-0 w-11 h-11 rounded-xl bg-white text-black hover:bg-white/90 flex items-center justify-center transition-colors"
                  >
                    {isLoaded && playback.loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isPlaying ? (
                      <Pause className="w-4 h-4" fill="currentColor" />
                    ) : (
                      <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                    )}
                  </button>
                  <div
                    className={cn(
                      'flex items-center gap-2 flex-1 min-w-0 h-11 transition-opacity duration-300',
                      isLoaded ? 'opacity-100' : 'opacity-40',
                    )}
                  >
                    <StaticWaveform
                      seed={stage.id}
                      className="w-full min-w-0 h-full flex-1"
                      animated={isPlaying}
                      volumeLevel={isPlaying ? playback.volume : 0}
                      color={isPaper ? 'rgba(0,0,0,0.8)' : undefined}
                      progress={isLoaded ? playback.progress : undefined}
                      onSeek={(pos) => seekStageRecording(stage, pos)}
                    />
                    {isLoaded && playback.timeLeft && (
                      <span className="text-[10px] text-zinc-500 font-mono shrink-0 w-10 text-right">
                        {playback.timeLeft}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => (isPoppedOut ? closeStagePopout() : popOutStageRecording(stage))}
                    aria-pressed={isPoppedOut}
                    aria-label={isPoppedOut ? 'Close the corner player' : 'Pop out the player'}
                    title={isPoppedOut ? 'Close the corner player' : 'Pop out the player'}
                    className={cn(
                      'shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors',
                      isPoppedOut
                        ? 'bg-white/20 text-white'
                        : 'bg-white/10 hover:bg-white/20 text-white/70 hover:text-white',
                    )}
                  >
                    <PictureInPicture2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => setTranscriptOpen(true)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    Transcript
                  </button>
                  <button
                    onClick={() => setShareOpen(true)}
                    title="Share stage"
                    aria-label="Share stage"
                    className="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex gap-2 mt-5">
                {/* A stage can end without a recording — the host blocked the
                    mic prompt, or the upload failed. Say so rather than
                    offering a play button that cannot play. */}
                <p className="flex-1 self-center text-zinc-500 text-sm">
                  This stage wasn't recorded.
                </p>
                <button
                  onClick={() => setShareOpen(true)}
                  title="Share stage"
                  aria-label="Share stage"
                  className="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* The room's conversation, carried on past the room. */}
        <StageChat space={stage} className="mt-4" listClassName="h-56" />

        <RelatedPostsFeed currentPostId={stage.id} />

        <StageTranscriptDrawer
          space={stage}
          open={transcriptOpen}
          onOpenChange={setTranscriptOpen}
        />

        <ShareEntityDrawer
          open={shareOpen}
          onOpenChange={setShareOpen}
          url={dehubLinkFor.stage(stage)}
          shareTitle={stage.title}
        />
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

            {/* If the host is sharing a screen, a guest listening in sees it
                too — same subscription, no account. Renders nothing until they
                press "Listen in": there is no Agora connection to carry it
                before that. */}
            <StageScreenShare sharerName={stage.host_username} className="mt-4" />

            {/* Live subtitles, for a guest with no account. Reading them needs
                no credential and no microphone — only the realtime channel the
                speakers are already broadcasting on. Gated on actually
                listening: subtitles with no audio under them are a transcript
                nobody asked for. */}
            {listening && (
              <div className="mt-4 flex flex-col items-center gap-2">
                <StageCaptionsOverlay spaceId={stage.id} />
                <StageCaptionsButton isSpeaker={false} className="w-10 h-10" />
              </div>
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
                <BadgedName
                  lookupId={stage.host_username || stage.host_wallet_address}
                  className="text-sm text-zinc-400 group-hover/host:text-white transition-colors"
                >
                  Hosted by @{stage.host_username || stage.host_wallet_address?.slice(0, 6)}
                </BadgedName>
              </StageHostLink>
            </div>

            {/* The crowd on its way. A stage in its first minute has a
                headcount of one, and this page is where the go-live
                notification lands people — the reminder rows outlive the flip
                to live, so they still answer "is anyone else coming to this". */}
            <StageReminderFaces spaceId={stage.id} state="live" className="mt-3" />

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
                onClick={() => setShareOpen(true)}
                title="Share stage"
                aria-label="Share stage"
                className="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
              >
                <Share2 className="w-4 h-4" />
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

        {/* The room's chat, on the page a shared link lands on. Both standing
            states get it: an announced stage can be talked about before it
            starts, and a guest listening in with no account can at least read
            what the room is saying — signing in is what buys a turn in it.
            Same rows the live room writes, so nothing said here is stranded
            on this page. */}
        <StageChat space={stage} className="mt-4" listClassName="h-56" />

        <RelatedPostsFeed currentPostId={stage.id} />

        <ShareEntityDrawer
          open={shareOpen}
          onOpenChange={setShareOpen}
          url={dehubLinkFor.stage(stage)}
          shareTitle={stage.title}
        />
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
