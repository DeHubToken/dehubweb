import { useState, useEffect, useMemo } from 'react';
import { Radio, Loader2, Copy, Check, ExternalLink, Tag, Search, X, Plus } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { mintPost } from '@/lib/api/dehub/content';
import { getWeb3AuthSigner, mintOnChain, BASE_CHAIN_ID } from '@/lib/contracts';
import { getCategories, getNFTInfo } from '@/lib/api/dehub/feed';
import { getStreamIngestUrl, startLiveStream } from '@/lib/api/dehub/livestream';
import type { DeHubCategory } from '@/lib/api/dehub/types';
import { createLogger } from '@/lib/logger';

const logger = createLogger('GoLiveModal');


interface GoLiveModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'setup' | 'ready' | 'streaming';

const MAX_CATEGORIES = 5;

export function GoLiveModal({ isOpen, onClose }: GoLiveModalProps) {
  const [step, setStep] = useState<Step>('setup');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamData, setStreamData] = useState<{ streamKey: string; ingestUrl: string; playbackUrl: string; streamId: string; hlsUrl?: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Category drawer state
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [categories, setCategories] = useState<DeHubCategory[]>([]);
  const [categorySearch, setCategorySearch] = useState('');
  const [loadingCategories, setLoadingCategories] = useState(false);

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
    setStep('setup');
    setTitle('');
    setDescription('');
    setSelectedCategory('');
    setStreamData(null);
    onClose();
  };

  const handleStartStream = async () => {
    if (!title.trim()) {
      toast.error('Please enter a stream title');
      return;
    }

    setIsLoading(true);
    logger.info('User initiated "Go Live"', { title, selectedCategoriesArray });
    try {
      // Step 1: Get user's wallet address for minting
      const minterAddress = await getWeb3AuthSigner();
      logger.info('Minter address obtained', { minterAddress });

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

      // Step 3: Execute on-chain minting transaction
      if (!mintResponse.v || !mintResponse.r || !mintResponse.s) {
        throw new Error('Invalid signature data from backend');
      }

      logger.info('Executing on-chain mint...', { tokenId });
      toast.loading('Publishing to blockchain...', { id: 'golive-progress', duration: Infinity });

      const txHash = await mintOnChain({
        tokenId,
        timestamp: mintResponse.timestamp,
        v: mintResponse.v,
        r: mintResponse.r,
        s: mintResponse.s,
        chainId: BASE_CHAIN_ID,
      });

      logger.info('On-chain mint confirmed', { tokenId, txHash });
      toast.dismiss('golive-progress');

      // Step 4: Poll /api/nft_info/{tokenId} to get stream credentials
      // Backend needs a moment to provision the stream after minting
      logger.info('Fetching stream credentials from nft_info...', { tokenId });

      let streamKey = '';
      let streamId = '';
      let playbackId = '';
      let retryCount = 0;
      const MAX_RETRIES = 8;

      while (retryCount < MAX_RETRIES) {
        try {
          const nftInfo = await getNFTInfo(tokenId);
          const stream = nftInfo?.stream;

          if (stream?.streamKey) {
            streamKey = stream.streamKey;
            playbackId = stream.playbackId || '';
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
      }

      if (!streamKey) {
        throw new Error('Stream key not available yet. The backend may still be provisioning your stream. Please try again in a moment.');
      }

      // Step 5: Activate the stream and get the RTMP ingest URL
      // Call /api/live/start to activate, which returns ingestUrl + playbackUrl
      const LIVEPEER_RTMP_URL = 'rtmp://rtmp.livepeer.com/live';
      let ingestUrl = '';
      let playbackUrl = '';

      // Try startLiveStream first — this activates the stream on the backend
      try {
        logger.info('Activating stream via /api/live/start...', { streamId });
        const startRes = await startLiveStream({ streamId, title: title.trim() });
        ingestUrl = startRes?.result?.ingestUrl || '';
        playbackUrl = startRes?.result?.playbackUrl || '';
        logger.info('Stream activated via /api/live/start', { ingestUrl, playbackUrl, startRes: startRes?.result });
      } catch (e) {
        logger.warn('startLiveStream failed, trying getStreamIngestUrl...', e);
      }

      // Fallback: try the ingest URL endpoint
      if (!ingestUrl) {
        try {
          logger.info('Fetching ingest URL from API...', { streamId });
          const ingestRes = await getStreamIngestUrl(streamId);
          ingestUrl = ingestRes?.result?.ingestUrl || '';
          logger.info('Ingest URL from getStreamIngestUrl', { ingestUrl });
        } catch (e) {
          logger.warn('getStreamIngestUrl failed', e);
        }
      }

      // Final fallback: standard Livepeer RTMP URL
      if (!ingestUrl) {
        ingestUrl = LIVEPEER_RTMP_URL;
        logger.info('Using standard Livepeer RTMP ingest URL', { ingestUrl });
      }

      const hlsUrl = playbackId ? `https://livepeercdn.studio/hls/${playbackId}/index.m3u8` : '';
      const resultData = {
        streamId,
        streamKey,
        ingestUrl,
        playbackUrl: playbackUrl || `https://dehub.io/app/post/${tokenId}`,
        hlsUrl,
      };

      setStreamData(resultData);
      setStep('ready');
      logger.info('Stream setup ready', { streamId, tokenId });
      toast.success('Live stream is ready!');
    } catch (error) {
      toast.dismiss('golive-progress');
      logger.error('Failed to start stream', { title, selectedCategory }, error);
      const errorMsg = error instanceof Error ? error.message : '';
      const isWeb3AuthError = errorMsg.includes('Web3Auth');
      const isOverflowError = errorMsg.includes('overflow') || errorMsg.includes('INVALID_ARGUMENT');

      if (isWeb3AuthError) {
        toast.error('Web3Auth service is currently slow or timing out. Please check your internet or try refreshing.');
      } else if (isOverflowError) {
        toast.error('Transaction signing failed. Please refresh the page and try again.');
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
    <Drawer open={isOpen} onOpenChange={handleClose}>
      <DrawerContent glass className="max-h-[90vh] px-4 pb-8">
        <DrawerHeader className="border-b border-white/10 mb-4">
          <DrawerTitle className="text-white flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            {step === 'setup' ? 'Go Live' : 'Stream Ready'}
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            Configure your livestream settings or get your RTMP credentials.
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-1 custom-scrollbar">
          {step === 'setup' ? (
            <div className="space-y-4 pb-4">
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
                <div className="flex items-center justify-between">
                  <label className="text-sm text-zinc-400 flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Category
                  </label>
                  <button
                    type="button"
                    onClick={() => setCategoryDrawerOpen(true)}
                    className="text-xs text-white/50 hover:text-white"
                  >
                    {selectedCategoriesArray.length > 0 ? 'Edit' : 'Add'}
                  </button>
                </div>
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
          ) : (
            <div className="space-y-4 pb-4">
              {streamData && (
                <>
                  <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
                    <p className="text-green-400 font-medium text-sm">Stream created successfully!</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-zinc-400">Stream Key</label>
                    <div className="flex gap-2">
                      <Input value={streamData.streamKey} readOnly type="password" className="bg-zinc-800 border-zinc-700 font-mono" />
                      <Button variant="outline" size="icon" onClick={() => copyToClipboard(streamData.streamKey, 'key')}>
                        {copiedField === 'key' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-zinc-400">Ingest URL</label>
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

        <div className="pt-4 mt-2 border-t border-white/10 bg-zinc-900">
          {step === 'setup' ? (
            <Button
              onClick={handleStartStream}
              disabled={!title.trim() || isLoading}
              className="w-full bg-red-500 hover:bg-red-600 h-14 text-lg font-bold"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Radio className="w-5 h-5 mr-2" /> Go Live</>}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1 h-14 border-zinc-700">Close</Button>
              <Button onClick={() => window.open(streamData?.playbackUrl, '_blank')} variant="glass" className="flex-1 h-14">
                <ExternalLink className="w-4 h-4 mr-2" /> View Stream
              </Button>
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
