/**
 * Go Live Modal
 * =============
 * Modal for starting a live stream with title, description, and category.
 * Supports both immediate live and scheduled streams.
 */

import { useState } from 'react';
import { Radio, Loader2, Copy, Check, ExternalLink } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { createLiveStream, startLiveStream, getStreamKey, getStreamIngestUrl, type StartLiveStreamResponse } from '@/lib/api/dehub';


interface GoLiveModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'setup' | 'ready' | 'streaming';

export function GoLiveModal({ isOpen, onClose }: GoLiveModalProps) {
  const [step, setStep] = useState<Step>('setup');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamData, setStreamData] = useState<StartLiveStreamResponse['result'] | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleClose = () => {
    // Reset state when closing
    setStep('setup');
    setTitle('');
    setDescription('');
    setCategory('');
    setStreamData(null);
    onClose();
  };

  const handleStartStream = async () => {
    if (!title.trim()) {
      toast.error('Please enter a stream title');
      return;
    }

    setIsLoading(true);
    try {
      // Step 1: Create the stream first
      const createResponse = await createLiveStream({
        title: title.trim(),
        description: description.trim() || undefined,
        category: category.trim() || undefined,
      });

      const streamId = createResponse.result?.streamId;

      if (!streamId) {
        throw new Error('Failed to create stream - no stream ID returned');
      }

      // Step 2: Start the stream to get RTMP credentials
      const startResponse = await startLiveStream({ streamId });

      let resultData = startResponse.result;

      // Step 3: If startLiveStream didn't return credentials, fetch them explicitly
      if (!resultData?.streamKey || !resultData?.ingestUrl) {
        const [keyRes, ingestRes] = await Promise.all([
          getStreamKey(streamId).catch(() => null),
          getStreamIngestUrl(streamId).catch(() => null),
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
      toast.success('Stream created! Copy your stream key to start broadcasting.');
    } catch (error) {
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

  const categories = [
    'Just Chatting',
    'Gaming',
    'Music',
    'Creative',
    'Sports',
    'Education',
    'Talk Show',
    'Other',
  ];

  return (
    <Drawer open={isOpen} onOpenChange={handleClose}>
      <DrawerContent glass className="max-h-[90vh] px-4 pb-8">
        <DrawerHeader className="border-b border-white/10 mb-4">
          <DrawerTitle className="text-white flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            {step === 'setup' ? 'Go Live' : step === 'ready' ? 'Ready to Stream' : 'Live Now'}
          </DrawerTitle>
        </DrawerHeader>

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

            {/* Category */}
            <div className="space-y-2">
              <label className="text-sm text-zinc-400">Category</label>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat === category ? '' : cat)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm transition-colors',
                      category === cat
                        ? 'bg-white text-black'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
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
      </DrawerContent>
    </Drawer>
  );
}
