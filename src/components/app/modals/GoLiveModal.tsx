import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useFormDraft } from '@/hooks/use-form-draft';
import { Radio, Loader2, Copy, Check, ExternalLink, Hash, Search, X, Plus, Video, MonitorPlay, ScreenShare } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { mintPost, getPostQuota, type PostQuotaStatus } from '@/lib/api/dehub/content';
// NOTE: mint helpers reach wallet/contract code (wagmi + web3auth) and this
// modal is re-exported by the modals barrel used by eager feed components —
// they are dynamically imported at go-live time to keep the wallet stack out
// of the entry bundle (scripts/check-entry-bundle.mjs fails the build
// otherwise). BASE_CHAIN_ID comes from the light dhb-token module.
import { BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { getCategories, getNFTInfo } from '@/lib/api/dehub/feed';
import { getStreamIngestUrl, startLiveStream, endLiveStream } from '@/lib/api/dehub/livestream';
import type { DeHubCategory } from '@/lib/api/dehub/types';
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

const MAX_CATEGORIES = 5;

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
  const [isLoading, setIsLoading] = useState(false);
  const [streamData, setStreamData] = useState<{ tokenId: string; streamKey: string; ingestUrl: string; playbackUrl: string; streamId: string; hlsUrl?: string; playbackId?: string; provider?: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
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
    { title, description, selectedCategory },
    (saved) => {
      if (saved.title) setTitle(saved.title);
      if (saved.description) setDescription(saved.description);
      if (saved.selectedCategory) setSelectedCategory(saved.selectedCategory);
    },
  );

  // Category drawer state
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [categories, setCategories] = useState<DeHubCategory[]>([]);
  const [categorySearch, setCategorySearch] = useState('');
  const [loadingCategories, setLoadingCategories] = useState(false);

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

  // mark-stream-live is fired without awaiting; every end path must sequence
  // its end-stream-session AFTER it settles, or a cold-started mark landing
  // late re-upserts the row the delete just removed — leaving the post
  // rendering live forever (the row is a pure existence check with no TTL).
  const markLivePromiseRef = useRef<Promise<unknown> | null>(null);

  const clearLiveSession = (tokenId: string) => {
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
    if (!broadcastingRef.current) return;
    const data = streamDataRef.current;
    if (!data) return;
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

  // Fetch categories when drawer opens
  useEffect(() => {
    if (categoryDrawerOpen && categories.length === 0) {
      setLoadingCategories(true);
      getCategories()
        .then(setCategories)
        .catch(console.error)
        .finally(() => setLoadingCategories(false));
    }
  }, [categoryDrawerOpen, categories.length]);

  const selectedCategoriesArray = useMemo(() =>
    selectedCategory ? selectedCategory.split('|||').filter(Boolean) : [],
    [selectedCategory]
  );

  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    const q = categorySearch.toLowerCase();
    return categories.filter(c => c.name.toLowerCase().includes(q));
  }, [categories, categorySearch]);

  const toggleCategory = (name: string) => {
    const current = selectedCategoriesArray;
    if (current.includes(name)) {
      const next = current.filter(c => c !== name);
      setSelectedCategory(next.join('|||'));
    } else if (current.length < MAX_CATEGORIES) {
      setSelectedCategory([...current, name].join('|||'));
    }
  };

  const removeCategory = (name: string) => {
    const next = selectedCategoriesArray.filter(c => c !== name);
    setSelectedCategory(next.join('|||'));
  };

  const handleClose = () => {
    // Invalidate any in-flight go-live sequence — its continuation checks
    // this and bails instead of marking a dismissed stream live.
    goLiveRunRef.current++;
    toast.dismiss('golive-progress');
    releasePendingScreen();
    setStep('setup');
    setSource('camera');
    setTitle('');
    setDescription('');
    setSelectedCategory('');
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
    logger.info('User initiated "Go Live"', { title, source, selectedCategoriesArray });

    // Bail points for a dismissal that arrives mid-sequence. Everything after
    // a bail is skipped — critically startLiveStream / mark-stream-live / the
    // step change — so a cancelled go-live never leaves a stream flagged live
    // or a 'broadcasting' step armed to auto-start the camera on reopen.
    // Releasing the capture here covers every one of those exits at once.
    const run = ++goLiveRunRef.current;
    const wasDismissed = () => {
      if (goLiveRunRef.current === run) return false;
      releasePendingScreen();
      return true;
    };

    // The browser paths need the broadcaster chunk the moment minting ends —
    // start it downloading now, in parallel with the wallet module, instead
    // of leaving the creator on a spinner (with the stream already flagged
    // live) while it fetches after the fact.
    if (source !== 'rtmp') {
      void import('@/components/app/modals/GoLiveBroadcaster');
    }

    try {
      // Step 1: Get user's wallet address for minting
      const { getWeb3AuthSigner, mintOnChain } = await import('@/lib/contracts/stream-collection');
      const minterAddress = await getWeb3AuthSigner();
      logger.info('Minter address obtained', { minterAddress });
      if (wasDismissed()) return;

      // Step 2: Mint the live post via /api/user_mint
      logger.info('Minting live post...', { title });

      const mintResponse = await mintPost({
        name: title.trim(),
        description: description.trim(),
        postType: 'live',
        chainId: BASE_CHAIN_ID,
        category: selectedCategoriesArray.length > 0 ? selectedCategoriesArray : ['General'],
        minterAddress,
        streamInfo: {
          isLockContent: false,
          isPayPerView: false,
          isAddBounty: false,
        },
      });

      const tokenId = mintResponse.createdTokenId;
      logger.info('NFT Minted via API', { tokenId });
      if (wasDismissed()) return;

      // Step 3: Execute on-chain minting transaction
      if (!mintResponse.v || !mintResponse.r || !mintResponse.s) {
        throw new Error('Invalid signature data from backend');
      }

      logger.info('Executing on-chain mint...', { tokenId });
      toast.loading('Publishing to decentralized database...', { id: 'golive-progress', duration: Infinity });

      const mintResult = await mintOnChain({
        tokenId,
        timestamp: mintResponse.timestamp,
        v: mintResponse.v,
        r: mintResponse.r,
        s: mintResponse.s,
        uri: mintResponse.uri,
        chainId: BASE_CHAIN_ID,
      });

      const txHash = mintResult.hash;
      logger.info('On-chain mint submitted', { tokenId, txHash });
      toast.dismiss('golive-progress');

      // Background confirmation
      mintResult.confirmed.catch((err) => {
        logger.warn('Background mint confirmation failed', err);
      });

      // Past this point the mint is on-chain either way; a dismissal still
      // stops us short of marking anything live.
      if (wasDismissed()) return;

      // Step 4: Poll /api/nft_info/{tokenId} to get stream credentials
      // Backend needs a moment to provision the stream after minting
      logger.info('Fetching stream credentials from nft_info...', { tokenId });

      let streamKey = '';
      let streamId = '';
      let playbackId = '';
      let provider = '';
      let retryCount = 0;
      const MAX_RETRIES = 8;

      while (retryCount < MAX_RETRIES) {
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
      if (wasDismissed()) {
        // Undo the settings marker just written — this is the only bail
        // point past that PATCH, so the compensation lives here.
        endLiveStream(streamId).catch(() => undefined);
        return;
      }

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
      }
    } catch (error) {
      toast.dismiss('golive-progress');
      // A failed mint leaves the creator staring at a "sharing your screen"
      // bar for a stream that never happened.
      releasePendingScreen();
      logger.error('Failed to start stream', { title, selectedCategory }, error);
      
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
      <DrawerContent glass className="max-h-[90vh] px-4 pb-8">
        <DrawerHeader className="border-b border-white/10 mb-4 relative">
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

        <div className="flex-1 overflow-y-auto px-1 custom-scrollbar">
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

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setCategoryDrawerOpen(true)}
                  className="flex items-center justify-between w-full"
                >
                  <label className="text-sm text-zinc-400 flex items-center gap-2 cursor-pointer">
                    <Hash className="w-4 h-4" />
                    Category
                  </label>
                  <span className="text-xs text-white/50 hover:text-white">
                    {selectedCategoriesArray.length > 0 ? 'Edit' : 'Add'}
                  </span>
                </button>
                {selectedCategoriesArray.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCategoriesArray.map((cat) => (
                      <span key={cat} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-white/10 text-white border border-white/10">
                        {cat}
                        <button type="button" onClick={() => removeCategory(cat)}>
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
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
                    onEnd={handleEndStream}
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

      <Drawer open={categoryDrawerOpen} onOpenChange={setCategoryDrawerOpen}>
        <DrawerContent glass hideHandle className="max-h-[60vh]">
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-medium">Categories</h3>
              <button onClick={() => setCategoryDrawerOpen(false)} className="text-sm text-zinc-400 hover:text-white">Done</button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="Search..."
                className="w-full h-11 bg-zinc-800 border border-white/10 rounded-xl pl-10 pr-4 text-white text-sm outline-none focus:border-white/20"
              />
            </div>
            <div className="overflow-y-auto max-h-[30vh] space-y-1">
              {categorySearch.trim() && !filteredCategories.some(c => c.name.toLowerCase() === categorySearch.trim().toLowerCase()) && (
                <button
                  onClick={() => {
                    const name = categorySearch.trim();
                    if (name && selectedCategoriesArray.length < MAX_CATEGORIES && !selectedCategoriesArray.includes(name)) {
                      setSelectedCategory([...selectedCategoriesArray, name].join('|||'));
                      setCategorySearch('');
                    }
                  }}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm text-white hover:bg-white/5 transition-colors"
                >
                  <Plus className="w-4 h-4 text-zinc-400" />
                  Create "{categorySearch.trim()}"
                </button>
              )}
              {filteredCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => toggleCategory(cat.name)}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-colors",
                    selectedCategoriesArray.includes(cat.name) ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5"
                  )}
                >
                  {cat.name}
                  {selectedCategoriesArray.includes(cat.name) && <Check className="w-4 h-4" />}
                </button>
              ))}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
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
