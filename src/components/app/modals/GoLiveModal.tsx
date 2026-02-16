import { useState, useEffect, useMemo } from 'react';
import { Radio, Loader2, Copy, Check, ExternalLink, Tag, Search, X, Plus, Save } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { createLiveStream, startLiveStream, getStreamKey, getStreamIngestUrl, type StartLiveStreamResponse } from '@/lib/api/dehub';
import { getCategories } from '@/lib/api/dehub/feed';
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
  const [streamData, setStreamData] = useState<StartLiveStreamResponse['result'] | null>(null);
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
    logger.info('User initiated "Go Live"', { title, category });
    try {
      // Send first category to API (API accepts single category string)
      const categoryForApi = selectedCategoriesArray.length > 0
        ? selectedCategoriesArray[0]
        : undefined;

      const createResponse = await createLiveStream({
        title: title.trim(),
        description: description.trim() || undefined,
        category: categoryForApi,
      });

      const streamId = createResponse.result?.streamId;
      logger.info('Stream creation response received', { streamId });

      if (!streamId) {
        throw new Error('Failed to create stream - no stream ID returned');
      }

      const startResponse = await startLiveStream({ streamId });
      logger.info('Start stream response received', { hasResult: !!startResponse.result });

      let resultData = startResponse.result;

      if (!resultData?.streamKey || !resultData?.ingestUrl) {
        logger.warn('Start stream response missing credentials, fetching explicitly');
        const [keyRes, ingestRes] = await Promise.all([
          getStreamKey(streamId).catch((err) => {
            logger.error('Failed to get stream key', { streamId }, err);
            return null;
          }),
          getStreamIngestUrl(streamId).catch((err) => {
            logger.error('Failed to get ingest URL', { streamId }, err);
            return null;
          }),
        ]);
        resultData = {
          streamId,
          streamKey: resultData?.streamKey || keyRes?.result?.streamKey || '',
          ingestUrl: resultData?.ingestUrl || keyRes?.result?.ingestUrl || ingestRes?.result?.ingestUrl || '',
          playbackUrl: resultData?.playbackUrl || '',
        };
      }

      setStreamData(resultData);
      setStep('ready');
      logger.info('Stream setup ready', { streamId, hasKey: !!resultData.streamKey });
      toast.success('Stream created! Copy your stream key to start broadcasting.');
    } catch (error) {
      logger.error('Failed to start stream', { title, category }, error);
      console.error('Failed to start stream:', error);
      const message = error instanceof Error ? error.message : 'Failed to create stream';
      if (message.includes('401') || message.toLowerCase().includes('unauthorized')) {
        toast.error('Session expired. Please log in again.');
      } else if (message.includes('400')) {
        toast.error('Invalid request. Please check your input.');
      } else {
        toast.error(message);
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
            {step === 'setup' ? 'Go Live' : step === 'ready' ? 'Ready to Stream' : 'Live Now'}
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            Configure your livestream settings including title and category.
          </DrawerDescription>
        </DrawerHeader>

        <div className="overflow-y-auto max-h-[70vh] px-1 pb-12 custom-scrollbar">
          {step === 'setup' && (
            <div className="space-y-4">
            {/* Title */}
            <div className="space-y-2">
              <label className="text-sm text-zinc-400">Stream Title *</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What's your stream about?"
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                maxLength={100}
              />
              <p className="text-xs text-zinc-500 text-right">{title.length}/100</p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm text-zinc-400">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell viewers what to expect..."
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 resize-none"
                rows={3}
                maxLength={500}
              />
            </div>

            {/* Category - matching PostAccessToggles pattern */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-zinc-400 flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Category
                </label>
                <button
                  type="button"
                  onClick={() => { setCategorySearch(''); setCategoryDrawerOpen(true); }}
                  className="text-xs text-white/50 hover:text-white transition-colors"
                >
                  {selectedCategoriesArray.length > 0 ? 'Edit' : 'Add'}
                </button>
              </div>
              {selectedCategoriesArray.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {selectedCategoriesArray.length < MAX_CATEGORIES && (
                    <button type="button" onClick={() => { setCategorySearch(''); setCategoryDrawerOpen(true); }} className="text-xs text-white/50 hover:text-white">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {selectedCategoriesArray.map((cat) => (
                    <span key={cat} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-white/10 text-white/80 border border-white/10">
                      {cat}
                      <button type="button" onClick={() => removeCategory(cat)} className="hover:text-red-400 transition-colors">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.setItem('post_default_categories', selectedCategory);
                      toast.success('Default categories saved');
                    }}
                    className="text-xs text-white/50 hover:text-white"
                  >
                    <Save className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Start Button */}
            <Button
              onClick={handleStartStream}
              disabled={!title.trim() || isLoading}
              className="w-full bg-red-500 hover:bg-red-600 text-white py-6 text-lg font-semibold rounded-xl"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Creating Stream...
                </>
              ) : (
                <>
                  <Radio className="w-5 h-5 mr-2" />
                  Go Live
                </>
              )}
            </Button>
          </div>
        )}

        {step === 'ready' && streamData && (
          <div className="space-y-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
              <p className="text-green-400 font-medium">Stream created successfully!</p>
              <p className="text-sm text-zinc-400 mt-1">
                Use the info below to start broadcasting with OBS, Streamlabs, or any RTMP software.
              </p>
            </div>

            {/* Stream Key */}
            <div className="space-y-2">
              <label className="text-sm text-zinc-400">Stream Key</label>
              <div className="flex gap-2">
                <Input
                  value={streamData.streamKey}
                  readOnly
                  type="password"
                  className="bg-zinc-800 border-zinc-700 text-white font-mono"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(streamData.streamKey, 'key')}
                  className="shrink-0 border-zinc-700"
                >
                  {copiedField === 'key' ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-amber-400">⚠️ Keep this secret! Don't share it with anyone.</p>
            </div>

            {/* Ingest URL */}
            <div className="space-y-2">
              <label className="text-sm text-zinc-400">Server / Ingest URL</label>
              <div className="flex gap-2">
                <Input
                  value={streamData.ingestUrl}
                  readOnly
                  className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(streamData.ingestUrl, 'url')}
                  className="shrink-0 border-zinc-700"
                >
                  {copiedField === 'url' ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Playback URL */}
            <div className="space-y-2">
              <label className="text-sm text-zinc-400">Playback URL (share with viewers)</label>
              <div className="flex gap-2">
                <Input
                  value={streamData.playbackUrl}
                  readOnly
                  className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(streamData.playbackUrl, 'playback')}
                  className="shrink-0 border-zinc-700"
                >
                  {copiedField === 'playback' ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-zinc-800/50 rounded-xl p-4 space-y-2">
              <p className="text-white font-medium text-sm">How to go live:</p>
              <ol className="text-sm text-zinc-400 space-y-1 list-decimal list-inside">
                <li>Open OBS Studio or your streaming software</li>
                <li>Go to Settings → Stream</li>
                <li>Select "Custom" as the service</li>
                <li>Paste the Server URL above</li>
                <li>Paste the Stream Key</li>
                <li>Click "Start Streaming"</li>
              </ol>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleClose}
                className="flex-1 border-zinc-700"
              >
                Close
              </Button>
              <Button
                onClick={() => window.open(streamData.playbackUrl, '_blank')}
                variant="glass"
                className="flex-1"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View Stream
              </Button>
            </div>
          </div>
        )}
        </div>
      </DrawerContent>

      {/* Category Drawer - matching PostAccessToggles pattern */}
      <Drawer open={categoryDrawerOpen} onOpenChange={setCategoryDrawerOpen}>
        <DrawerContent glass hideHandle>
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div className="flex items-center gap-2 text-white font-medium">
              <Tag className="w-5 h-5" />
              Select Categories
            </div>
            <button type="button" onClick={() => setCategoryDrawerOpen(false)} className="text-sm text-white/60 hover:text-white transition-colors">
              Done
            </button>
          </div>
          <div className="px-4 pb-4 space-y-3">
            {/* Selected chips */}
            {selectedCategoriesArray.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedCategoriesArray.map((cat) => (
                  <span key={cat} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-white/15 text-white border border-white/20">
                    {cat}
                    <button type="button" onClick={() => removeCategory(cat)} className="hover:text-red-400 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="Search categories..."
                className={cn(inputClass, "pl-10")}
                autoFocus
              />
              {categorySearch && (
                <button
                  type="button"
                  onClick={() => setCategorySearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Category list */}
            <div className="max-h-[40vh] overflow-y-auto space-y-1 scrollbar-hide">
              {loadingCategories ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* Custom category option */}
                  {categorySearch.trim().length >= 3 && !categories.some(c => c.name.toLowerCase() === categorySearch.trim().toLowerCase()) && selectedCategoriesArray.length < MAX_CATEGORIES && (
                    <button
                      type="button"
                      onClick={() => { toggleCategory(categorySearch.trim()); setCategorySearch(''); }}
                      className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm transition-colors text-white bg-white/10 hover:bg-white/15 border border-dashed border-white/20 mb-1"
                    >
                      <Plus className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Create "<span className="font-medium">{categorySearch.trim()}</span>"</span>
                    </button>
                  )}
                  {filteredCategories.length === 0 && !categorySearch.trim() ? (
                    <p className="text-center text-sm text-zinc-500 py-8">No categories found</p>
                  ) : (
                    filteredCategories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => toggleCategory(cat.name)}
                        disabled={!selectedCategoriesArray.includes(cat.name) && selectedCategoriesArray.length >= MAX_CATEGORIES}
                        className={cn(
                          "w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-colors",
                          selectedCategoriesArray.includes(cat.name)
                            ? "bg-white/15 text-white border border-white/20"
                            : selectedCategoriesArray.length >= MAX_CATEGORIES
                              ? "text-zinc-600 border border-transparent cursor-not-allowed"
                              : "text-zinc-300 hover:bg-white/5 border border-transparent"
                        )}
                      >
                        <span>{cat.name}</span>
                        {selectedCategoriesArray.includes(cat.name) && (
                          <Check className="w-4 h-4 text-white" />
                        )}
                      </button>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </Drawer>
  );
}
