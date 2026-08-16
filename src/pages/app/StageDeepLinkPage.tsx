/**
 * StageDeepLinkPage - Handles /stage/:id invite links
 *
 * A live stage is joined straight away and the page bounces to the app, which
 * is what an invite link has always done. A *scheduled* stage has nothing to
 * join yet, so the same URL has to be able to stand still and be a page: it
 * shows the announcement — graphic, title, when — plus the host's own controls
 * to start it. Bouncing that case to /app (the old behaviour for anything
 * joinSpace refused) would make every announcement link look broken until the
 * moment it went live.
 *
 * The announcement runs full width at the top, and below it the page carries
 * an ad slot and the latest text posts (RelatedPostsFeed), so a shared link
 * lands on a living page rather than a lone card in empty space.
 */

import { BrandIcon } from '@/components/app/war/WarHudIcon';
import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { CalendarDays, Radio, Loader2, Copy } from 'lucide-react';
import { useStage } from '@/contexts/StageContext';
import { useAuth } from '@/contexts/AuthContext';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import { dehubLinkFor } from '@/lib/dehub-links';
import stagesMicIcon from '@/assets/icons/stages-mic-icon.png';
import { DeHubPageLoader } from '@/components/app/DeHubLoader';
import { RelatedPostsFeed } from '@/components/app/feeds/RelatedPostsFeed';
import { toast } from 'sonner';
import type { AudioSpace } from '@/types/audio-spaces.types';

export default function StageDeepLinkPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { joinSpace, currentSpace, openModal, startScheduledSpace } = useStage();
  const { isAuthenticated, walletAddress } = useAuth();
  const joinedRef = useRef(false);
  const [starting, setStarting] = useState(false);

  const { data: stage, isLoading } = useQuery({
    queryKey: ['stage-by-id', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audio_spaces')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as AudioSpace;
    },
  });

  useEffect(() => {
    if (!id || joinedRef.current || isLoading) return;

    // If already in this space, just open the modal
    if (currentSpace?.id === id) {
      openModal('live');
      navigate('/app', { replace: true });
      return;
    }

    // Only a live stage auto-joins. Scheduled stages render below; an ended one
    // has nothing to join, so send it to the recorded shelf.
    if (!stage) return;
    if (stage.status === 'ended') {
      navigate('/stages', { replace: true });
      return;
    }
    if (stage.status !== 'live') return;

    if (!isAuthenticated) {
      // Not logged in — go home, modal will require auth
      navigate('/app', { replace: true });
      return;
    }

    joinedRef.current = true;

    joinSpace(id)
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
  }, [id, isAuthenticated, stage, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const isScheduled = stage?.status === 'scheduled';
  const startsAt = stage?.scheduled_at ? new Date(stage.scheduled_at) : null;
  const isOverdue = !!startsAt && startsAt.getTime() < Date.now();
  const isHost =
    !!walletAddress &&
    stage?.host_wallet_address?.toLowerCase() === walletAddress.toLowerCase();

  // ── Scheduled stage: the announcement, as a page ─────────────────────────

  if (isScheduled && stage) {
    const avatar =
      buildAvatarUrl(stage.host_wallet_address || '', stage.host_avatar) ||
      buildAvatarCdnFallbackUrl(stage.host_wallet_address || '');

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
            <>
              <img
                src={stage.cover_image_url}
                alt=""
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/85 to-black/60" />
            </>
          )}
          <div className={stage.cover_image_url ? 'relative p-6' : 'relative p-6 bg-zinc-900'}>
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
              <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 bg-zinc-700">
                {avatar && <img src={avatar} alt="" className="w-full h-full object-cover" />}
              </div>
              <span className="text-sm text-zinc-400">
                Hosted by @{stage.host_username || stage.host_wallet_address?.slice(0, 6)}
              </span>
            </div>

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
              ) : (
                <button
                  onClick={() => navigate('/stages')}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
                >
                  Browse Stages
                </button>
              )}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(dehubLinkFor.stage(stage.id)).then(
                    () => toast.success('Link copied'),
                    () => toast.error('Could not copy link'),
                  );
                }}
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

  // ── Live / loading ───────────────────────────────────────────────────────

  return (
    <div data-glass-page className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 text-white">
      {/* Shared invite links land here — without a title of its own, the page
          kept whatever document.title the previous route wrote. noindex to
          match the edge (the worker noindexes /stage/*), self-canonical (a
          cross-URL canonical alongside noindex is a mixed signal). */}
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
