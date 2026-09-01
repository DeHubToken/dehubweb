import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useFormDraft } from '@/hooks/use-form-draft';
import { Radio, Loader2, Copy, Check, ExternalLink, ImagePlus, X, Video, MonitorPlay, ScreenShare } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import {
  mintPost,
  getPostQuota,
  getMintFee,
  deletePost,
  type PostQuotaStatus,
  type MintFeeQuoteResponse,
} from '@/lib/api/dehub/content';
import type { ShopLink } from '@/lib/api/dehub/types';
import { attachShopListings } from '@/lib/attach-shop-listings';
import { isSmartWalletSession } from '@/lib/connection-source';
import {
  probeIngestReachable,
  fetchTurnServers,
  hadRecentIngestFailure,
  hadRecentRelayFailure,
  lastProbeFailure,
  lastTurnFailure,
} from '@/lib/live-ingest';
// NOTE: mint helpers reach wallet/contract code (wagmi + web3auth) and this
// modal is re-exported by the modals barrel used by eager feed components —
// they are dynamically imported at go-live time to keep the wallet stack out
// of the entry bundle (scripts/check-entry-bundle.mjs fails the build
// otherwise). BASE_CHAIN_ID comes from the light dhb-token module.
import { BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { buildStreamInfo } from '@/features/post/lib/stream-info';
import type { Currency } from '@/features/post/types';
import type { PostChainId } from '@/components/app/ChainSelector';
import { useCreatorPlansLite } from '@/hooks/use-creator-plans';
import { getNFTInfo } from '@/lib/api/dehub/feed';
import { getStreamIngestUrl, startLiveStream, endLiveStream } from '@/lib/api/dehub/livestream';
import { createLogger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/lib/api/dehub/core';
import { useAuth } from '@/contexts/AuthContext';
import { hlsUrlFor } from '@/lib/live-ingest';

// The WebRTC broadcaster pulls in getUserMedia + peer-connection code that
// only the browser capture paths need, so it loads on demand rather than
// riding along with the modal for people who stream from OBS.
const GoLiveBroadcaster = React.lazy(() =>
  import('@/components/app/modals/GoLiveBroadcaster').then(m => ({ default: m.GoLiveBroadcaster }))
);

/**
 * The composer's own switch list, reused rather than reimplemented — a live
 * post gets the same options a normal post does, in the same order, with the
 * same drawers behind them.
 *
 * Lazy for the same reason the broadcaster is: this modal is re-exported by
 * the modals barrel that eager feed components import, and the toggles reach
 * the subscription and chain-token modules that scripts/check-entry-bundle.mjs
 * refuses on the boot path.
 */
const PostAccessToggles = React.lazy(() =>
  import('@/features/post/components/PostAccessToggles').then(m => ({ default: m.PostAccessToggles }))
);

const logger = createLogger('GoLiveModal');


interface GoLiveModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'setup' | 'ready' | 'broadcasting';

/**
 * 'camera' and 'screen' both publish from the browser over WHIP — no software
 * to install. 'camera' is the only one that works on a phone; 'screen' shares
 * a desktop, window or tab (with its audio) and is what a game or a walkthrough
 * wants. 'rtmp' hands out the ingest URL and stream key for OBS and other
 * desktop encoders, which is now only needed for scenes, overlays and capture
 * cards.
 */
type StreamSource = 'camera' | 'screen' | 'rtmp';

/**
 * Screen capture is a desktop capability: getDisplayMedia is undefined on iOS
 * and on Android Chrome, so the option is feature-detected rather than guessed
 * from a viewport width. Kept inline instead of imported from the broadcaster —
 * that module is deliberately lazy and importing a constant would drag the
 * whole WebRTC chunk into this one.
 */
const canShareScreen =
  typeof navigator !== 'undefined' &&
  typeof navigator.mediaDevices?.getDisplayMedia === 'function';

/** Matches the broadcaster's own screen constraints: 1080p keeps text legible. */
const SCREEN_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 30 },
};

/** Matches the server's cap on the thumbnail route. */
const MAX_COVER_BYTES = 8 * 1024 * 1024;

/**
 * 1024-based, matching the server's pool math — a 1000-based reading would
 * announce a smaller budget than the backend actually honours. Local rather
 * than lib/editor/quota's formatBytes, which drags all thirteen badge images
 * into whatever imports it and fails the entry-bundle check.
 */
function formatGb(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb % 1 === 0 ? gb : gb.toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

export function GoLiveModal({ isOpen, onClose }: GoLiveModalProps) {
  const { walletAddress } = useAuth();
  const [step, setStep] = useState<Step>('setup');
  const [source, setSource] = useState<StreamSource>('camera');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  /*
   * A live post is a post. It carries the same access switches the composer
   * writes — minting, the paywalls, the gates, the rating — and they are held
   * here in the same names PostAccessToggles and buildStreamInfo use, so the
   * one shared row of switches drives both surfaces.
   *
   * Mint is off by default, matching the composer: going live no longer needs
   * a wallet, a signature or gas. The stream key comes back from /user_mint
   * itself, not from the chain, so nothing about the broadcast depends on it.
   */
  const [shouldMint, setShouldMint] = useState(false);
  const [isSubscribersOnly, setIsSubscribersOnly] = useState(false);
  const [isPPV, setIsPPV] = useState(false);
  const [ppvAmount, setPpvAmount] = useState('');
  const [ppvCurrency, setPpvCurrency] = useState<Currency>('DHB');
  const [isWatch2Earn, setIsWatch2Earn] = useState(false);
  const [w2eViews, setW2eViews] = useState('');
  const [w2eComments, setW2eComments] = useState('');
  const [w2eTotal, setW2eTotal] = useState('');
  const [w2eCurrency, setW2eCurrency] = useState<Currency>('DHB');
  const [isTokenGated, setIsTokenGated] = useState(false);
  const [tokenContract, setTokenContract] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [tokenAmount, setTokenAmount] = useState('');
  const [isMature, setIsMature] = useState(false);
  /** The Shop board this stream goes on air with. Empty means no Shop button. */
  const [shopLinks, setShopLinks] = useState<ShopLink[]>([]);
  /** Own store listings picked for the board, attached once the mint returns. */
  const [shopListingIds, setShopListingIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamData, setStreamData] = useState<{ tokenId: string; streamKey: string; ingestUrl: string; playbackUrl: string; streamId: string; hlsUrl?: string; playbackId?: string; provider?: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  /*
   * Optional cover image.
   *
   * Mobile has always required one and the web flow never asked, which is the
   * whole reason streams started from a browser list as empty boxes. Optional
   * here rather than required: the broadcaster grabs a frame off the live
   * video a few seconds in, so a creator who skips this still ends up with a
   * picture — it just will not be one they chose.
   */
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  // The display capture taken at click time (see handleStartStream), handed to
  // the broadcaster once the mint lands. Mirrored in a ref because every
  // bail-out — dismissal, unmount, a failed mint — has to release it, and those
  // run outside the render cycle. The ref is cleared the moment the broadcaster
  // adopts the capture, so a later bail never stops a live share.
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const pendingScreenRef = useRef<MediaStream | null>(null);

  const releasePendingScreen = () => {
    pendingScreenRef.current?.getTracks().forEach((t) => t.stop());
    pendingScreenRef.current = null;
  };

  /*
   * Only the three fields the creator actually writes. Everything else here is
   * live-session state — `step`, `streamData`, the MediaStream — and restoring
   * any of it would put the modal back on a broadcasting screen with no stream
   * behind it. Cleared once the stream exists, since by then the title is on
   * the post rather than pending.
   */
  const draft = useFormDraft(
    'go-live',
    {
      title,
      description,
      selectedCategory,
      shouldMint,
      isSubscribersOnly,
      isPPV,
      ppvAmount,
      ppvCurrency,
      isWatch2Earn,
      w2eViews,
      w2eComments,
      w2eTotal,
      isTokenGated,
      tokenContract,
      tokenSymbol,
      tokenAmount,
      isMature,
      shopLinks,
      shopListingIds,
    },
    (saved) => {
      if (saved.title) setTitle(saved.title);
      if (saved.description) setDescription(saved.description);
      if (saved.selectedCategory) setSelectedCategory(saved.selectedCategory);
      // Every switch is restored, but only from a truthy value: a draft saved
      // before these existed carries none of them and must not read as "off"
      // overwriting a default, nor as "on" turning a paywall on by itself.
      if (saved.shouldMint) setShouldMint(true);
      if (saved.isSubscribersOnly) setIsSubscribersOnly(true);
      if (saved.isPPV) setIsPPV(true);
      if (saved.ppvAmount) setPpvAmount(saved.ppvAmount);
      if (saved.ppvCurrency) setPpvCurrency(saved.ppvCurrency);
      if (saved.isWatch2Earn) setIsWatch2Earn(true);
      if (saved.w2eViews) setW2eViews(saved.w2eViews);
      if (saved.w2eComments) setW2eComments(saved.w2eComments);
      if (saved.w2eTotal) setW2eTotal(saved.w2eTotal);
      if (saved.isTokenGated) setIsTokenGated(true);
      if (saved.tokenContract) setTokenContract(saved.tokenContract);
      if (saved.tokenSymbol) setTokenSymbol(saved.tokenSymbol);
      if (saved.tokenAmount) setTokenAmount(saved.tokenAmount);
      if (saved.isMature) setIsMature(true);
      // Restored on the same truthy rule, and worth more than the switches:
      // these are URLs somebody typed by hand.
      if (Array.isArray(saved.shopLinks) && saved.shopLinks.length) setShopLinks(saved.shopLinks);
      if (Array.isArray(saved.shopListingIds) && saved.shopListingIds.length) setShopListingIds(saved.shopListingIds);
    },
  );

  // Generation counter for the go-live sequence. handleClose bumps it, and
  // handleStartStream re-checks after every await: without this, dismissing
  // the drawer during the mint → poll → provision chain (15-30s) let the
  // continuation finish against the closed modal — marking the stream live
  // with nothing feeding it, and leaving step='broadcasting' behind so the
  // next open of the modal silently turned the camera on.
  const goLiveRunRef = useRef(0);
  // Mirrors for the unmount teardown below — an unmount cleanup can't read
  // fresh state.
  const streamDataRef = useRef<typeof streamData>(null);
  const walletAddressRef = useRef(walletAddress);
  const broadcastingRef = useRef(false);
  useEffect(() => { streamDataRef.current = streamData; }, [streamData]);
  useEffect(() => { walletAddressRef.current = walletAddress; }, [walletAddress]);
  useEffect(() => { broadcastingRef.current = step === 'broadcasting'; }, [step]);
  // Whether this go-live ever actually went on air (the broadcaster's WHIP
  // session reached 'live' at least once). A launch that never did leaves a
  // post advertising a stream nobody can ever watch, so every end path
  // discards it instead of keeping it — see discardFailedLaunch.
  const wentLiveRef = useRef(false);

  // mark-stream-live is fired without awaiting; every end path must sequence
  // its end-stream-session AFTER it settles, or a cold-started mark landing
  // late re-upserts the row the delete just removed — leaving the post
  // rendering live forever (the row is a pure existence check with no TTL).
  const markLivePromiseRef = useRef<Promise<unknown> | null>(null);

  /**
   * The pulse behind that row.
   *
   * The row has no TTL and nothing removes it when a broadcast dies without
   * running its teardown — a crashed tab, a killed browser, a closed laptop —
   * so a post went on claiming to be LIVE forever over a player that could
   * never load. `mark-stream-live` doubles as the heartbeat: re-invoking it
   * only moves `heartbeat_at`, and a row whose pulse has stopped no longer
   * reads as live (see use-stream-live-status).
   */
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopHeartbeat = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  };

  const startHeartbeat = (tokenId: string, streamId?: string) => {
    stopHeartbeat();
    heartbeatRef.current = setInterval(() => {
      const token = getAuthToken();
      const addr = walletAddressRef.current?.toLowerCase();
      if (!token || !addr) return;
      supabase.functions
        .invoke('mark-stream-live', {
          body: { tokenId, streamId },
          headers: { 'x-wallet-address': addr, 'x-dehub-token': token },
        })
        .catch(() => undefined);
    }, 60_000);
  };

  const clearLiveSession = (tokenId: string) => {
    // Before anything else: a beat that fires after the delete would re-upsert
    // the row this call exists to remove, which is the same race the
    // markLivePromiseRef sequencing below already guards against.
    stopHeartbeat();
    const token = getAuthToken();
    const addr = walletAddressRef.current?.toLowerCase();
    if (!token || !addr) return;
    Promise.resolve(markLivePromiseRef.current)
      .catch(() => undefined)
      .then(() =>
        supabase.functions.invoke('end-stream-session', {
          body: { tokenId },
          headers: { 'x-wallet-address': addr, 'x-dehub-token': token },
        })
      )
      .catch(() => undefined);
  };

  // A live post whose stream never went on air is pure feed pollution: no
  // content, no replay, nothing anyone can ever watch. Discard it with the
  // same soft delete the card menu runs, and tidy the live surfaces. Every
  // call is best-effort — a cleanup that fails just leaves what a failed
  // launch leaves today, a stranded row.
  const discardFailedLaunch = (tokenId: string, streamId?: string) => {
    logger.info('Discarding live post from failed launch', { tokenId, streamId });
    deletePost(tokenId).catch((e) => logger.warn('Failed to discard dead live post', e));
    if (streamId) endLiveStream(streamId).catch(() => undefined);
    clearLiveSession(tokenId);
  };

  // Route-change unmount (browser Back, link navigation): the broadcaster's
  // own cleanup stops the camera and the WHIP ingest, but nothing else clears
  // the live surfaces. Note what each call really does: end-stream-session
  // deletes the Supabase row viewers key on, endLiveStream plants the
  // client-honored settings.status='ended' marker — the backend's own status
  // transitions only via the Livepeer idle webhook once ingest stops, which
  // the WHIP teardown triggers.
  useEffect(() => () => {
    // An unmount invalidates any in-flight go-live exactly like a dismissal:
    // without this, navigating away mid-mint let the continuation finish and
    // mark a stream live that no UI could ever end.
    goLiveRunRef.current++;
    // A capture taken for a go-live that never reached the broadcaster would
    // otherwise keep the browser's "sharing your screen" bar up for good.
    releasePendingScreen();
    // Unconditionally, and before the early return below: the RTMP path never
    // reaches step 'broadcasting', so a beat started for it would outlive the
    // component and keep a stream marked live for good.
    stopHeartbeat();
    if (!broadcastingRef.current) return;
    const data = streamDataRef.current;
    if (!data) return;
    // Navigating away from a broadcast that never connected follows the same
    // rule as an explicit end: the post advertises a stream that never existed.
    if (data.tokenId && !wentLiveRef.current) {
      deletePost(data.tokenId).catch(() => undefined);
    }
    if (data.streamId) {
      endLiveStream(data.streamId).catch(() => undefined);
    }
    if (data.tokenId) clearLiveSession(data.tokenId);
  }, []);

  // What today's allowance still permits as a replay. Replays draw from the
  // same daily media pool uploads do, and the backend truncates the recording
  // to whatever is left — so the ceiling is shown HERE, before going live,
  // rather than discovered as a mysteriously short replay afterwards.
  const [quota, setQuota] = useState<PostQuotaStatus | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    getPostQuota().then((q) => {
      if (!cancelled) setQuota(q);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  /**
   * A bounty locks DHB through the mint transaction, so it cannot ride on a
   * stream that never goes on chain — the switch forces minting on, exactly as
   * the composer does.
   */
  const mintRequired = isWatch2Earn;
  const effectiveShouldMint = shouldMint || mintRequired;

  /**
   * Broadcasting from a phone: the sheet becomes the screen. Only while
   * actually on air — the setup form still wants to be a normal sheet, and
   * desktop keeps the card at every step.
   */
  const isMobile = useIsMobile();
  const liveFullScreen = isMobile && step === 'broadcasting';

  /** Published plans only — an unpublished plan gates a stream nobody can open. */
  const { planIds: myPlanIds } = useCreatorPlansLite(walletAddress);

  // Priced by the server and only for sponsored sessions; a null quote means
  // "could not price it" and is shown as free rather than as a blocker.
  const [mintFee, setMintFee] = useState<MintFeeQuoteResponse | null>(null);
  useEffect(() => {
    if (!isOpen || !effectiveShouldMint || !isSmartWalletSession()) {
      setMintFee(null);
      return;
    }
    let cancelled = false;
    getMintFee(BASE_CHAIN_ID).then((quote) => {
      if (!cancelled) setMintFee(quote);
    });
    return () => { cancelled = true; };
  }, [isOpen, effectiveShouldMint]);

  const mintFeeLabel =
    mintFee?.chargeable && mintFee.amount > 0
      ? `${mintFee.amount >= 1 ? mintFee.amount.toFixed(2).replace(/\.?0+$/, '') : mintFee.amount.toFixed(8).replace(/\.?0+$/, '')} ${mintFee.symbol}`
      : null;

  const replayBudget = useMemo(() => {
    if (!quota) return null;
    const remaining = Math.max(0, quota.mediaBytesPerDay - quota.mediaBytesUsed);
    return { remaining, tier: quota.tier };
  }, [quota]);

  // Load saved default categories
  useEffect(() => {
    if (isOpen && !selectedCategory) {
      const saved = localStorage.getItem('post_default_categories');
      if (saved) setSelectedCategory(saved);
    }
  }, [isOpen]);

  // Categories are picked in PostAccessToggles below, which stores them in the
  // same '|||'-joined string the composer uses. Only the saved default is
  // seeded here, so a creator's usual tags are already on a fresh stream.
  const selectedCategoriesArray = useMemo(() =>
    selectedCategory ? selectedCategory.split('|||').filter(Boolean) : [],
    [selectedCategory]
  );

  /**
   * Object URLs are not garbage-collected on their own. The effect owns the
   * revoking — its cleanup runs both when a preview is replaced and on
   * unmount — so choosing a cover never has to think about it.
   */
  const chooseCover = (file: File | null) => {
    setCover(file);
    setCoverPreview(file ? URL.createObjectURL(file) : null);
  };

  useEffect(() => {
    if (!coverPreview) return;
    return () => URL.revokeObjectURL(coverPreview);
  }, [coverPreview]);

  const handleClose = () => {
    // Invalidate any in-flight go-live sequence — its continuation checks
    // this and bails instead of marking a dismissed stream live.
    goLiveRunRef.current++;
    toast.dismiss('golive-progress');
    releasePendingScreen();
    // Covers the RTMP path, which closes from step 'ready' without running the
    // end-stream teardown. Its broadcast carries on in OBS and the backend's
    // own LIVE status is what the post reads from then on — but this browser
    // has stopped vouching for it, which is exactly right once the tab is gone.
    stopHeartbeat();
    setStep('setup');
    setSource('camera');
    setTitle('');
    setDescription('');
    setSelectedCategory('');
    chooseCover(null);
    // The access switches reset with the rest of the form: leaving a paywall
    // armed would put a price on the next stream without anyone asking for it.
    setShouldMint(false);
    setIsSubscribersOnly(false);
    setIsPPV(false);
    setPpvAmount('');
    setIsWatch2Earn(false);
    setW2eViews('');
    setW2eComments('');
    setW2eTotal('');
    setIsTokenGated(false);
    setTokenContract('');
    setTokenSymbol('');
    setTokenAmount('');
    setIsMature(false);
    setShopLinks([]);
    setShopListingIds([]);
    setStreamData(null);
    // The broadcaster stops the tracks it adopted in its own teardown; this
    // only drops the reference so a reopened modal starts from a clean slate.
    setScreenStream(null);
    onClose();
  };

  const handleEndStream = async () => {
    if (!streamData?.tokenId) return;
    // The unmount teardown must not double-fire after an explicit end.
    broadcastingRef.current = false;

    // A browser broadcast that never actually connected has nothing behind its
    // post — no stream happened, no replay will exist — so ending it discards
    // the post rather than leaving a dead live card in the feed. The RTMP path
    // (step 'ready') stays out of this: OBS connects out-of-band, so "never
    // aired" is unknowable here.
    if (step === 'broadcasting' && !wentLiveRef.current) {
      discardFailedLaunch(streamData.tokenId, streamData.streamId);
      handleClose();
      return;
    }

    // Plant the settings.status='ended' marker. This is client-honored only
    // (deriveIsLive reads it) — the backend's top-level status transitions
    // via the Livepeer idle webhook once ingest actually stops.
    if (streamData.streamId) {
      try {
        await endLiveStream(streamData.streamId);
        logger.info('Stream end marker set', { streamId: streamData.streamId });
      } catch (e) {
        logger.warn('endLiveStream failed (non-blocking)', e);
      }
    }

    // Remove from Supabase live sessions table (sequenced after any pending
    // mark-stream-live so the delete cannot be overwritten by a late upsert).
    clearLiveSession(streamData.tokenId);
    handleClose();
  };

  /**
   * Dismissing the drawer mid-broadcast has to run the same teardown as the
   * End Stream button — otherwise the camera is released on unmount but the
   * post stays flagged live on the backend with nothing feeding it.
   */
  const handleDismiss = () => {
    if (step === 'broadcasting') {
      void handleEndStream();
      return;
    }
    handleClose();
  };

  const handleStartStream = async () => {
    if (!title.trim()) {
      toast.error('Please enter a stream title');
      return;
    }

    // The access switches become the same `streamInfo` blob a normal post
    // writes. Resolved here, before the screen picker and before anything is
    // sent, so a gate that cannot be built costs a toast rather than a capture
    // the browser then has to be talked out of.
    const access = buildStreamInfo({
      chainId: BASE_CHAIN_ID,
      isTokenGated,
      tokenAmount,
      tokenContract,
      tokenSymbol,
      isPPV,
      ppvAmount,
      ppvCurrency,
      isWatch2Earn,
      w2eTotal,
      w2eViews,
      w2eComments,
      isSubscribersOnly,
      myPlanIds,
    });

    if (access.error) {
      toast.error(access.error);
      return;
    }

    // The screen picker has to open from THIS click. getDisplayMedia requires
    // transient user activation, and the mint that follows runs 15-30s — long
    // past the window — so a broadcaster asking for it on mount is refused
    // outright. Doing it first also makes a cancelled picker free: no mint, no
    // gas, no stream to tear down.
    if (source === 'screen') {
      try {
        const capture = await navigator.mediaDevices.getDisplayMedia({
          video: SCREEN_CONSTRAINTS,
          audio: true,
        });
        pendingScreenRef.current = capture;
      } catch (error) {
        logger.info('Screen picker dismissed', error);
        toast.error('Screen sharing was cancelled.');
        return;
      }
    }

    setIsLoading(true);
    wentLiveRef.current = false;
    logger.info('User initiated "Go Live"', { title, source, selectedCategoriesArray });

    // Once the mint lands these identify the post this launch created, so the
    // bail-outs and the catch below can discard it — a launch that dies (or is
    // dismissed) after minting must not leave a dead live post in the feed.
    let mintedTokenId: string | null = null;
    let mintedStreamId: string | undefined;

    // Bail points for a dismissal that arrives mid-sequence. Everything after
    // a bail is skipped — critically startLiveStream / mark-stream-live / the
    // step change — so a cancelled go-live never leaves a stream flagged live
    // or a 'broadcasting' step armed to auto-start the camera on reopen.
    // Releasing the capture here covers every one of those exits at once.
    const run = ++goLiveRunRef.current;
    const wasDismissed = () => {
      if (goLiveRunRef.current === run) return false;
      releasePendingScreen();
      if (mintedTokenId) discardFailedLaunch(mintedTokenId, mintedStreamId);
      return true;
    };

    // The browser paths need the broadcaster chunk the moment minting ends —
    // start it downloading now, in parallel with the wallet module, instead
    // of leaving the creator on a spinner (with the stream already flagged
    // live) while it fetches after the fact.
    if (source !== 'rtmp') {
      void import('@/components/app/modals/GoLiveBroadcaster');
    }

    // Some networks cannot reach the self-hosted ingest at all (its bare
    // droplet IP is the one DeHub host not behind Cloudflare, and a few ISPs
    // null-route whole hosting ranges — every request from there just hangs).
    // Ask now, in parallel with the wallet module, and tell the mint so the
    // stream is created on Livepeer instead of on a server this browser will
    // never manage to send a byte to.
    // Three-way call, decided once the probe answers: reachable → direct
    // self-hosted; unreachable with a TURN relay deployed → self-hosted via
    // the api.dehub.io signaling edge and relayed media; unreachable with no
    // relay → Livepeer, the fallback of last resort. Both lookups run in
    // parallel with the wallet module so neither costs wall-clock.
    // A passing probe is additionally outvoted by a fresh failure marker: on
    // DPI-throttled networks one small GET slips through intermittently while
    // the WHIP POST never does, so the device's own last direct connect is
    // better evidence than a probe taken seconds before the same dead end.
    const ingestReachable = probeIngestReachable();
    const turnServers = fetchTurnServers();

    try {
      /*
       * Step 1: the wallet, but only if this stream is going on chain.
       *
       * getWeb3AuthSigner is getWalletAddress under another name, and on a
       * built-in wallet reading it raises the unlock dialog — which is why
       * going live used to ask for a password before anything existed. The
       * backend takes the minter from the authenticated session, so an
       * off-chain stream needs no address from here at all.
       */
      let mintingThisStream = effectiveShouldMint;
      let minterAddress = walletAddress || '';

      if (mintingThisStream) {
        const { getWeb3AuthSigner } = await import('@/lib/contracts/stream-collection');
        minterAddress = await getWeb3AuthSigner();
        logger.info('Minter address obtained', { minterAddress });
        if (wasDismissed()) return;

        // A bounty locks DHB through the mint, so the tokens have to be there
        // before the stream exists — a stream advertising a bounty with
        // nothing behind it is worse than one that never started.
        if (access.bounty) {
          const { calculateTotalBounty, getDHBBalance } = await import('@/lib/contracts/stream-controller');
          const totalBounty = calculateTotalBounty(
            access.bounty.amount,
            access.bounty.viewers,
            access.bounty.commenters,
          );
          const balance = await getDHBBalance(minterAddress, BASE_CHAIN_ID);
          const balanceNum = Number(balance) / 1e18;
          if (balanceNum < totalBounty) {
            throw new Error(
              `Insufficient DHB balance. Need ${totalBounty} DHB but have ${balanceNum.toFixed(2)} DHB`,
            );
          }
          if (wasDismissed()) return;
        }
      }

      // Step 2: Mint the live post via /api/user_mint
      logger.info('Minting live post...', { title, mint: mintingThisStream });

      const mintResponse = await mintPost({
        name: title.trim(),
        description: description.trim(),
        postType: 'live',
        chainId: BASE_CHAIN_ID,
        category: selectedCategoriesArray.length > 0 ? selectedCategoriesArray : ['General'],
        // Rides the mint as files[0], which is where the server reads a live
        // post's cover from. Skipping it is fine — the broadcaster posts a
        // frame off its own video once the stream is up.
        thumbnail: cover ?? undefined,
        minterAddress,
        // The relay only counts as a way out while this device has no fresh
        // record of the relay itself failing — an edge that refuses the SDP
        // POST refuses it every time, and Livepeer is the fallback then.
        ingestPreference:
          ((await ingestReachable) && !hadRecentIngestFailure()) ||
          ((await turnServers).length > 0 && !hadRecentRelayFailure())
            ? undefined
            : 'livepeer',
        streamInfo: access.streamInfo,
        plans: access.subscriberPlanIds,
        contentRating: isMature ? 'mature' : undefined,
        // On the mint, so the Shop button has something behind it for the
        // people who arrive in the first seconds of the stream.
        shopLinks: shopLinks.length ? shopLinks : undefined,
        // What we are about to attach — the attach needs the tokenId this call
        // returns, so the count lands now and the rows a moment later.
        shopListingCount: shopListingIds.length || undefined,
        mintOptOut: !mintingThisStream,
      });

      const tokenId = mintResponse.createdTokenId;
      mintedTokenId = String(tokenId);
      logger.info('Live post created', { tokenId, mint: mintingThisStream });
      if (wasDismissed()) return;

      /**
       * Put the picked store listings on the stream, now that it has a
       * tokenId. Not awaited: going live must not wait on Supabase, and the
       * board resolves whatever landed when a viewer opens it. A failure is
       * reported rather than swallowed — the host can add them from the shop
       * manager beside the player.
       */
      if (shopListingIds.length) {
        void attachShopListings(tokenId, shopListingIds, walletAddress).then(({ failed }) => {
          if (failed > 0) {
            toast.error(
              `${failed} shop ${failed === 1 ? 'item' : 'items'} could not be attached — add them from the shop panel.`,
            );
          }
        });
      }

      // Step 3: Execute the on-chain mint — skipped wholesale when the creator
      // turned minting off. The post is already published (the server serves
      // status 'signed' everywhere) and the stream below is provisioned either
      // way, so nothing about the broadcast waits on a transaction.
      if (mintingThisStream) {
        if (!mintResponse.v || !mintResponse.r || !mintResponse.s) {
          throw new Error('Invalid signature data from backend');
        }

        logger.info('Executing on-chain mint...', { tokenId });
        toast.loading('Publishing to decentralized database...', { id: 'golive-progress', duration: Infinity });

        const chainMint = {
          tokenId,
          timestamp: mintResponse.timestamp,
          v: mintResponse.v,
          r: mintResponse.r,
          s: mintResponse.s,
          uri: mintResponse.uri,
          chainId: BASE_CHAIN_ID as import('@/components/app/ChainSelector').ChainId,
        };

        if (access.bounty) {
          const { mintWithBounty } = await import('@/lib/contracts/stream-controller');
          const txHash = await mintWithBounty({
            ...chainMint,
            timestamp: mintResponse.timestamp!,
            v: mintResponse.v!,
            r: mintResponse.r!,
            s: mintResponse.s!,
            bountyAmount: access.bounty.amount,
            countOfViewers: access.bounty.viewers,
            countOfCommentors: access.bounty.commenters,
          });
          logger.info('On-chain mint with bounty submitted', { tokenId, txHash });
        } else {
          const { mintOnChain } = await import('@/lib/contracts/stream-collection');
          const mintResult = await mintOnChain(chainMint);
          logger.info('On-chain mint submitted', { tokenId, txHash: mintResult.hash });
          // Background confirmation
          mintResult.confirmed.catch((err) => {
            logger.warn('Background mint confirmation failed', err);
          });
        }

        toast.dismiss('golive-progress');

        // Past this point the mint is on-chain either way; a dismissal still
        // stops us short of marking anything live.
        if (wasDismissed()) return;
      }

      /*
       * Step 4: the stream credentials.
       *
       * /user_mint provisions the stream in the same call and answers with it,
       * so the usual case needs no lookup at all. The poll below stays as the
       * fallback for a response that arrived without one — it is also what an
       * on-chain mint used to depend on, and the eight two-second attempts are
       * cheap next to a stream that cannot start.
       */
      let streamKey = mintResponse.stream?.streamKey || '';
      let streamId = String(mintResponse.stream?._id || '');
      let playbackId = mintResponse.stream?.playbackId || '';
      let provider = mintResponse.stream?.provider || '';
      let retryCount = 0;
      const MAX_RETRIES = 8;

      if (!streamKey) logger.info('Fetching stream credentials from nft_info...', { tokenId });

      while (!streamKey && retryCount < MAX_RETRIES) {
        try {
          const nftInfo = await getNFTInfo(tokenId);
          const stream = nftInfo?.stream;

          if (stream?.streamKey) {
            streamKey = stream.streamKey;
            playbackId = stream.playbackId || '';
            provider = ((stream as Record<string, unknown>).provider as string) || '';
            // Try to get the MongoDB ObjectId from stream (needed for some API calls)
            const streamObj = stream as Record<string, unknown>;
            streamId = (streamObj._id as string) || (streamObj.id as string) || stream.streamId || tokenId;
            logger.info('Stream credentials obtained', { streamId, playbackId, hasKey: true, attempt: retryCount + 1 });
            break;
          }

          logger.info('Stream not ready yet, retrying...', { attempt: retryCount + 1, status: stream?.status });
        } catch (e) {
          logger.warn('Failed to fetch nft_info, retrying...', { attempt: retryCount + 1 });
        }
        retryCount++;
        await new Promise(r => setTimeout(r, 2000));
        if (wasDismissed()) return;
      }

      if (streamId) mintedStreamId = streamId;
      // Every /api/live/{id}/* route wants the Mongo ObjectId; the tokenId is
      // the same last-resort the poll above falls back to.
      if (!streamId) streamId = tokenId;

      if (wasDismissed()) return;
      if (!streamKey) {
        throw new Error('Stream key not available yet. The backend may still be provisioning your stream. Please try again in a moment.');
      }

      // Step 5: Activate stream in DeHub backend + get ingest URL
      // Uses PATCH /api/live/{streamId}/settings to mark as live, GET /ingesturl for RTMP URL.
      const LIVEPEER_RTMP_URL = 'rtmp://rtmp.livepeer.com/live';
      let ingestUrl = '';
      let playbackUrl = '';

      // Step 5a: Get ingest URL from API
      try {
        const ingestRes = await getStreamIngestUrl(streamId);
        ingestUrl = ingestRes?.result?.ingestUrl || '';
        if (ingestUrl) logger.info('Ingest URL obtained', { ingestUrl });
      } catch (e) {
        logger.warn('getStreamIngestUrl failed, trying Edge Function...', e);
        try {
          const token = getAuthToken();
          const { data, error } = await supabase.functions.invoke('get-stream-ingest', {
            body: { tokenId },
            ...(token && { headers: { Authorization: `Bearer ${token}` } }),
          });
          if (!error && data?.ingestUrl) {
            ingestUrl = data.ingestUrl;
            logger.info('Ingest URL obtained via Edge Function');
          }
        } catch (e2) {
          logger.warn('Edge Function also failed, using standard RTMP', e2);
        }
      }
      if (wasDismissed()) return;

      // The backend's /ingesturl hands back rtmp://livepeer.studio/live/… —
      // that's the API host, not Livepeer's ingest host, and OBS pointed at
      // it fails to connect. Normalize to the documented RTMP endpoint (the
      // key is shown separately, so the embedded one is dropped with it).
      if (/^rtmp:\/\/livepeer\.studio\//i.test(ingestUrl)) {
        ingestUrl = LIVEPEER_RTMP_URL;
      }

      // Step 5b: Mark stream as live via PATCH /settings
      try {
        await startLiveStream({ streamId });
        logger.info('Stream marked as live via settings', { streamId });
      } catch (e) {
        logger.warn('startLiveStream (settings) failed (non-blocking)', e);
      }
      // The dismissal discard (via wasDismissed) also unwinds the settings
      // marker the PATCH above just wrote.
      if (wasDismissed()) return;

      // Final fallback: standard Livepeer RTMP URL. Only Livepeer's — a
      // self-hosted stream publishes to its own host, and handing its
      // creator Livepeer's endpoint would send them somewhere that will
      // never accept their key.
      if (!ingestUrl && provider !== 'mediamtx') {
        ingestUrl = LIVEPEER_RTMP_URL;
        logger.info('Using standard Livepeer RTMP ingest URL');
      }

      const hlsUrl = hlsUrlFor({ provider, playbackId }) || '';

      const resultData = {
        tokenId,
        streamId,
        streamKey,
        playbackId,
        provider,
        ingestUrl,
        playbackUrl: playbackUrl || `https://dehub.io/app/post/${tokenId}`,
        hlsUrl,
      };

      // warn, not info, so it ships to the error log — see the broadcaster's
      // 'connect route' line: together they bracket where provider is lost.
      logger.warn('mint stream fields', {
        provider: resultData.provider || '(empty)',
        playbackId: resultData.playbackId || '(empty)',
        hasKey: Boolean(resultData.streamKey),
        fromMintResponse: Boolean(mintResponse.stream?.streamKey),
        // Why the mint asked for what it asked for: the failing browser's
        // probe and TURN lookup both die while the same requests arrive at
        // nginx and get answered — these say HOW they die on the client.
        probeOk: await ingestReachable,
        probeFailure: lastProbeFailure || '(none)',
        turnCount: (await turnServers).length,
        turnFailure: lastTurnFailure || '(none)',
      });
      setStreamData(resultData);
      // The stream exists and carries the title — the pending copy of it should
      // not reappear in the next Go Live.
      draft.clear();
      // Hand the capture over: from here the broadcaster owns stopping it, so
      // the ref is cleared and the bail-out paths leave it alone.
      setScreenStream(pendingScreenRef.current);
      pendingScreenRef.current = null;
      // The browser paths go straight on air; the RTMP path stops at the
      // credentials screen so the creator can paste them into their encoder.
      setStep(source !== 'rtmp' ? 'broadcasting' : 'ready');
      logger.info('Stream setup ready', { streamId, tokenId, source });
      toast.success(source !== 'rtmp' ? 'You are going live!' : 'Live stream is ready!');

      // Mark stream as live in Supabase (api.dehub.io /start fails with 404).
      // The promise is kept so end paths can sequence their delete after it —
      // otherwise a slow cold start here re-upserts the row an immediate end
      // just removed.
      const token = getAuthToken();
      const addr = walletAddress || minterAddress;
      if (token && addr) {
        markLivePromiseRef.current = supabase.functions.invoke('mark-stream-live', {
          body: { tokenId, streamId },
          headers: { 'x-wallet-address': addr.toLowerCase(), 'x-dehub-token': token },
        }).then(({ error }) => {
          if (error) logger.warn('mark-stream-live failed (non-blocking)', error);
        });
        startHeartbeat(String(tokenId), streamId);
      }
    } catch (error) {
      toast.dismiss('golive-progress');
      // A failed mint leaves the creator staring at a "sharing your screen"
      // bar for a stream that never happened.
      releasePendingScreen();
      logger.error('Failed to start stream', { title, selectedCategory }, error);
      // The mint may already have landed; without this the failed launch
      // leaves a dead "live" post stranded at the head of the feed.
      if (mintedTokenId) discardFailedLaunch(mintedTokenId, mintedStreamId);

      const errorMsg = error instanceof Error ? error.message : '';
      const isWeb3AuthError = errorMsg.includes('Web3Auth');
      // "overflow" or "INVALID_ARGUMENT" often happen during gas calculation or signing
      const isSigningError = errorMsg.includes('overflow') || errorMsg.includes('INVALID_ARGUMENT') || errorMsg.includes('user rejected');

      if (isWeb3AuthError) {
        toast.error('Web3Auth service is currently slow or timing out. Please check your internet or try refreshing.');
      } else if (isSigningError) {
        toast.error('Blockchain signing failed. Please check your wallet or refresh the page.');
      } else {
        toast.error(errorMsg || 'Failed to create stream');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const inputClass = "w-full h-12 px-4 text-base bg-zinc-800/50 border border-white/20 rounded-xl text-white placeholder:text-zinc-500 outline-none focus:border-white/50";

  return (
    // Scrim-tap / drag dismissal is locked while the mint sequence runs: an
    // accidental swipe during the 15-30s wait was cancelling a go-live the
    // user had already paid gas for. The header X stays active as the
    // explicit cancel.
    <Drawer open={isOpen} onOpenChange={handleDismiss} dismissible={!isLoading}>
      <DrawerContent
        column
        glass
        className={cn(
          // Broadcasting from a phone takes the whole device. The sheet's own
          // chrome — height cap, padding, title bar — is what turned a portrait
          // camera into a wide strip with two thirds of the screen given over
          // to furniture, so on that one step it all comes off and the
          // broadcaster fills the frame. Every other step, and every desktop,
          // keeps the sheet it has always been.
          // mt-0 and rounded-none are not cosmetic: DrawerContent ships
          // `mt-24 rounded-t-[20px]`, and with bottom:0 plus a full-viewport
          // height that margin resolves to top:-96px, clipping the first 96px
          // of the broadcast off the top of the screen.
          liveFullScreen
            ? 'h-[100dvh] max-h-[100dvh] mt-0 rounded-none px-0 pb-0'
            : 'max-h-[90vh] px-4 pb-8'
        )}
      >
        <DrawerHeader
          className={cn(
            'border-b border-white/10 mb-4 relative',
            liveFullScreen && 'sr-only'
          )}
        >
          <DrawerTitle className="text-white flex items-center gap-2">
            <div data-live-pulse className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            {step === 'setup' ? 'Go Live' : step === 'broadcasting' ? "You're Live" : 'Stream Ready'}
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            Configure your livestream settings or get your RTMP credentials.
          </DrawerDescription>
          <button
            onClick={handleDismiss}
            className="absolute top-1/2 -translate-y-1/2 right-0 w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </DrawerHeader>

        <div
          className={cn(
            'flex-1 custom-scrollbar',
            // The broadcaster positions itself against this box, and a
            // scrolling parent would let the floating controls drift off the
            // bottom of a portrait video.
            liveFullScreen ? 'relative overflow-hidden' : 'overflow-y-auto px-1'
          )}
        >
          {step === 'setup' ? (
            <div className="space-y-4 pb-4">
              <div className="space-y-2">
                <label className="text-sm text-zinc-400">How do you want to stream?</label>
                <div className={cn('grid gap-2', canShareScreen ? 'grid-cols-3' : 'grid-cols-2')}>
                  <SourceOption
                    selected={source === 'camera'}
                    onClick={() => setSource('camera')}
                    icon={<Video className="w-4 h-4" />}
                    title="Camera"
                    subtitle="Straight from this device"
                  />
                  {canShareScreen && (
                    <SourceOption
                      selected={source === 'screen'}
                      onClick={() => setSource('screen')}
                      icon={<ScreenShare className="w-4 h-4" />}
                      title="Screen"
                      subtitle="Share a game, app or tab"
                    />
                  )}
                  <SourceOption
                    selected={source === 'rtmp'}
                    onClick={() => setSource('rtmp')}
                    icon={<MonitorPlay className="w-4 h-4" />}
                    title="OBS / Encoder"
                    subtitle="Get RTMP details"
                  />
                </div>
                {source === 'screen' && (
                  <p className="text-[11px] text-zinc-500">
                    You'll pick the screen, window or tab next — then it goes live
                    with your mic and the tab's own sound.
                  </p>
                )}
                {replayBudget && (
                  replayBudget.remaining <= 0 ? (
                    <p className="text-[11px] text-amber-400/90">
                      You've used today's upload allowance, so this stream won't
                      keep a replay. The allowance resets at midnight UTC.
                    </p>
                  ) : replayBudget.tier == null ? (
                    <p className="text-[11px] text-amber-400/90">
                      Free accounts keep the first {formatGb(replayBudget.remaining)} of
                      a stream as a replay — staking badges raises the limit.
                    </p>
                  ) : (
                    <p className="text-[11px] text-zinc-500">
                      Up to {formatGb(replayBudget.remaining)} of this stream is kept
                      as a replay ({replayBudget.tier} daily allowance).
                    </p>
                  )
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm text-zinc-400">Stream Title *</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What's your stream about?"
                  className="bg-zinc-800 border-zinc-700 text-white"
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-zinc-400">Description</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tell viewers what to expect..."
                  className="bg-zinc-800 border-zinc-700 text-white resize-none"
                  rows={3}
                  maxLength={500}
                />
              </div>

              {/* Cover image — optional. Left empty, the broadcaster posts a
                  frame off the live video a few seconds in, so the listing
                  still gets a picture; this is the creator's chance to pick a
                  better one. */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-zinc-400 flex items-center gap-2">
                    <ImagePlus className="w-4 h-4" />
                    Cover image
                  </label>
                  {cover ? (
                    <button
                      type="button"
                      onClick={() => chooseCover(null)}
                      className="text-xs text-white/50 hover:text-white"
                    >
                      Remove
                    </button>
                  ) : (
                    <span className="text-xs text-white/30">Optional</span>
                  )}
                </div>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file && file.size > MAX_COVER_BYTES) {
                      toast.error('Cover image must be under 8 MB');
                      e.target.value = '';
                      return;
                    }
                    chooseCover(file);
                    // Cleared so re-picking the same file still fires change.
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className={cn(
                    'w-full aspect-video rounded-xl overflow-hidden border border-dashed border-zinc-700',
                    'bg-zinc-800/60 flex items-center justify-center text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 transition-colors'
                  )}
                >
                  {coverPreview ? (
                    <img src={coverPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="flex flex-col items-center gap-1 text-xs">
                      <ImagePlus className="w-5 h-5" />
                      Add a cover
                    </span>
                  )}
                </button>
              </div>

              {/* The composer's own switches — minting, subscribers, PPV,
                  bounty, token gate, category, community, rating — so a
                  stream can be sold or gated exactly like any other post.
                  Suspense rather than a spinner: the chunk is small and the
                  fields above are usable while it arrives. */}
              <Suspense fallback={<div className="h-[140px]" />}>
                <PostAccessToggles
                  isSubscribersOnly={isSubscribersOnly}
                  setIsSubscribersOnly={setIsSubscribersOnly}
                  isPPV={isPPV}
                  setIsPPV={setIsPPV}
                  ppvAmount={ppvAmount}
                  setPpvAmount={setPpvAmount}
                  ppvCurrency={ppvCurrency}
                  setPpvCurrency={setPpvCurrency}
                  isWatch2Earn={isWatch2Earn}
                  setIsWatch2Earn={setIsWatch2Earn}
                  w2eViews={w2eViews}
                  setW2eViews={setW2eViews}
                  w2eComments={w2eComments}
                  setW2eComments={setW2eComments}
                  w2eTotal={w2eTotal}
                  setW2eTotal={setW2eTotal}
                  w2eCurrency={w2eCurrency}
                  setW2eCurrency={setW2eCurrency}
                  isTokenGated={isTokenGated}
                  setIsTokenGated={setIsTokenGated}
                  tokenContract={tokenContract}
                  setTokenContract={setTokenContract}
                  tokenSymbol={tokenSymbol}
                  setTokenSymbol={setTokenSymbol}
                  tokenAmount={tokenAmount}
                  setTokenAmount={setTokenAmount}
                  postChainId={BASE_CHAIN_ID as PostChainId}
                  selectedCategory={selectedCategory}
                  setSelectedCategory={setSelectedCategory}
                  /* A stream always has a title of its own above, so the
                     Title switch has nothing to offer — the same reason the
                     composer hides it for video and audio posts. */
                  showTitle
                  setShowTitle={() => undefined}
                  hasVideoOrAudio
                  isMature={isMature}
                  setIsMature={setIsMature}
                  shopLinks={shopLinks}
                  setShopLinks={setShopLinks}
                  shopListingIds={shopListingIds}
                  setShopListingIds={setShopListingIds}
                  shouldMint={effectiveShouldMint}
                  setShouldMint={setShouldMint}
                  mintFeeLabel={mintFeeLabel}
                  mintRequired={mintRequired}
                />
              </Suspense>
            </div>
          ) : step === 'broadcasting' ? (
            streamData && (
              <BroadcasterBoundary onEnd={handleEndStream}>
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="w-6 h-6 animate-spin text-white" />
                    </div>
                  }
                >
                  <GoLiveBroadcaster
                    streamKey={streamData.streamKey}
                    playbackId={streamData.playbackId}
                    provider={streamData.provider}
                    initialScreenStream={screenStream}
                    streamId={streamData.streamId}
                    tokenId={String(streamData.tokenId)}
                    onEnd={handleEndStream}
                    onLive={() => { wentLiveRef.current = true; }}
                  />
                </Suspense>
              </BroadcasterBoundary>
            )
          ) : (
            <div className="space-y-4 pb-4">
              {streamData && (
                <>

                  <div className="space-y-2">
                    <label className="text-sm text-white font-medium">Stream Key</label>
                    <div className="flex gap-2">
                      <Input value={streamData.streamKey} readOnly type="password" className="bg-zinc-800 border-zinc-700 font-mono" />
                      <Button variant="outline" size="icon" onClick={() => copyToClipboard(streamData.streamKey, 'key')}>
                        {copiedField === 'key' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-white font-medium">Ingest URL</label>
                    <div className="flex gap-2">
                      <Input value={streamData.ingestUrl} readOnly className="bg-zinc-800 border-zinc-700 font-mono text-xs" />
                      <Button variant="outline" size="icon" onClick={() => copyToClipboard(streamData.ingestUrl, 'url')}>
                        {copiedField === 'url' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="bg-zinc-800/50 rounded-xl p-4 space-y-2">
                    <p className="text-white font-medium text-xs uppercase tracking-wider">Quick Setup Guide:</p>
                    <ol className="text-xs text-zinc-400 space-y-1 list-decimal list-inside">
                      <li>Open OBS → Settings → Stream</li>
                      <li>Select "Custom" Service</li>
                      <li>Paste Ingest URL & Stream Key</li>
                      <li>Click "Start Streaming"</li>
                    </ol>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* The broadcaster owns its own controls, including End Stream. */}
        <div className={cn('pt-4 mt-2', step === 'broadcasting' && 'hidden')}>
          {step === 'setup' ? (
            <LiquidGlassBubble2
              label={isLoading ? '' : 'Go Live'}
              icon={isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Radio className="w-5 h-5" />}
              onClick={handleStartStream}
              disabled={!title.trim() || isLoading}
              width="100%"
              height="56px"
            />
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleEndStream}
                className="flex-1 h-14 flex items-center justify-center gap-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-medium hover:bg-white/10 transition-colors"
              >
                <Radio className="w-4 h-4" /> End Stream
              </button>
              <button
                onClick={() => window.open(streamData?.playbackUrl, '_blank')}
                className="flex-1 h-14 flex items-center justify-center gap-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-medium hover:bg-white/10 transition-colors"
              >
                <ExternalLink className="w-4 h-4" /> View Stream
              </button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * The broadcaster chunk loads only when the step flips to 'broadcasting' —
 * after the mint is paid and the stream is flagged live. If that dynamic
 * import rejects (deploy skew serving a stale chunk manifest is a documented,
 * recurring cause here), an unguarded Suspense would crash the whole page
 * with the stream still live and no way to end it. Catch it and keep the End
 * Stream control reachable instead.
 */
class BroadcasterBoundary extends React.Component<
  { onEnd: () => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    logger.error('Broadcaster failed to load', {}, error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex flex-col items-center gap-4 py-10 px-6 text-center">
        <p className="text-sm text-white">
          The broadcaster failed to load, so nothing was ever captured — but the
          stream was already created. End it below, then refresh the page and go
          live again.
        </p>
        <button
          onClick={this.props.onEnd}
          className="h-12 px-6 rounded-xl border border-red-500/30 bg-red-500/10 text-sm font-medium text-red-300 hover:bg-red-500/20 transition-colors"
        >
          End Stream
        </button>
      </div>
    );
  }
}

function SourceOption({
  selected,
  onClick,
  icon,
  title,
  subtitle,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors',
        selected
          ? 'border-white/40 bg-white/10'
          : 'border-white/10 bg-zinc-800/40 hover:bg-zinc-800/70'
      )}
    >
      <span className={cn('flex items-center gap-2 text-sm font-medium', selected ? 'text-white' : 'text-zinc-300')}>
        {icon}
        {title}
      </span>
      <span className="text-[11px] text-zinc-500">{subtitle}</span>
    </button>
  );
}
