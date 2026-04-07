import { useState, useRef, useEffect, useCallback } from 'react';
import { Volume2, Send, Loader2, Search, Play, Square, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useStage } from '@/contexts/StageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCustomVoices } from '@/hooks/use-custom-voices';
import { getBadgeName } from '@/lib/staking-badges';
import { VoiceTrainingDrawer } from '@/components/app/shared/VoiceTrainingDrawer';

interface VoiceOption {
  voice_id: string;
  name: string;
  description: string;
  labels: Record<string, string>;
  preview_url: string | null;
}

export function StageTTS() {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [search, setSearch] = useState('');
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [voiceTrainingOpen, setVoiceTrainingOpen] = useState(false);
  const [showApiKeyPrompt, setShowApiKeyPrompt] = useState(false);
  const [customElevenLabsKey, setCustomElevenLabsKey] = useState(() => {
    try { return localStorage.getItem('dehub-custom-elevenlabs-key') || ''; } catch { return ''; }
  });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const { injectAudio } = useStage();
  const { user } = useAuth();
  const { customVoices, refetch: refetchCustomVoices } = useCustomVoices();

  const fetchVoices = useCallback(async (query: string) => {
    setIsLoadingVoices(true);
    try {
      const params = new URLSearchParams({ page_size: '30' });
      if (query.trim()) params.set('search', query.trim());

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-voices?${params}`,
        {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );
      if (!res.ok) throw new Error('Failed to fetch voices');
      const data = await res.json();
      setVoices(data.voices || []);
      if (!selectedVoice && data.voices?.length) {
        setSelectedVoice(data.voices[0].voice_id);
      }
    } catch (err) {
      console.error('Voice fetch error:', err);
    } finally {
      setIsLoadingVoices(false);
    }
  }, [selectedVoice]);

  useEffect(() => {
    fetchVoices('');
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchVoices(search);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const handlePreview = async (voice: VoiceOption) => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    if (previewingId === voice.voice_id) {
      setPreviewingId(null);
      return;
    }
    if (!voice.preview_url) return;
    setPreviewingId(voice.voice_id);
    try {
      const res = await fetch(voice.preview_url);
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      await injectAudio(blob);
    } catch {
      toast.error('Could not play preview on stage');
    } finally {
      setPreviewingId(null);
    }
  };

  const getLabel = (voice: VoiceOption) => {
    const parts: string[] = [];
    if (voice.labels.descriptive) parts.push(voice.labels.descriptive);
    if (voice.labels.accent) parts.push(voice.labels.accent);
    if (voice.labels.gender) parts.push(voice.labels.gender);
    return parts.join(' · ');
  };

  const handleGenerate = async () => {
    if (!text.trim() || isGenerating || !selectedVoice) return;

    setIsGenerating(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text: text.trim(), voiceId: selectedVoice }),
        }
      );

      if (!response.ok) {
        throw new Error(`TTS failed: ${response.status}`);
      }

      const audioBlob = await response.blob();
      await injectAudio(audioBlob);

      setText('');
    } catch (err) {
      console.error('TTS error:', err);
      toast.error('Failed to generate speech');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTrainVoice = () => {
    const badgeName = getBadgeName(user?.badgeBalance, user?.username);
    const allowed = badgeName === 'Meglodon' || badgeName === 'Blue Whale';
    if (!allowed) {
      if (customElevenLabsKey) {
        setVoiceTrainingOpen(true);
      } else {
        setApiKeyInput('');
        setShowApiKeyPrompt(true);
      }
      return;
    }
    setVoiceTrainingOpen(true);
  };

  const badgeName = getBadgeName(user?.badgeBalance, user?.username);
  const isWhale = badgeName === 'Meglodon' || badgeName === 'Blue Whale';

  return (
    <>
      <div className="space-y-2 p-3 bg-white/5 rounded-xl border border-white/10">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <Volume2 className="w-4 h-4" />
          Text-to-Speech
        </h3>

        {/* Custom voices section */}
        {customVoices.length > 0 && !search && (
          <div className="space-y-1">
            <p className="text-[10px] text-white/40 uppercase tracking-wider">Your Voices</p>
            {customVoices.map((cv) => (
              <button
                key={cv.elevenlabs_voice_id}
                onClick={() => setSelectedVoice(cv.elevenlabs_voice_id)}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all text-xs",
                  selectedVoice === cv.elevenlabs_voice_id
                    ? "bg-white/20 text-white border border-white/30"
                    : "bg-white/5 text-white/70 hover:bg-white/10 border border-transparent"
                )}
              >
                <Mic className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="font-medium truncate">{cv.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Voice search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search voices..."
            className="pl-8 h-8 bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-lg text-xs"
          />
        </div>

        {/* Voice list */}
        <div className="h-[120px] overflow-y-auto scrollbar-none">
          {isLoadingVoices && voices.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-4 h-4 animate-spin text-white/40" />
            </div>
          ) : voices.length === 0 ? (
            <p className="text-xs text-white/40 text-center py-4">No voices found</p>
          ) : (
            <div className="space-y-1 pr-2">
              {voices.map((voice) => (
                <button
                  key={voice.voice_id}
                  onClick={() => setSelectedVoice(voice.voice_id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all text-xs",
                    selectedVoice === voice.voice_id
                      ? "bg-white/20 text-white border border-white/30"
                      : "bg-white/5 text-white/70 hover:bg-white/10 border border-transparent"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{voice.name.split(' - ')[0]}</div>
                    <div className="text-[10px] text-white/40 truncate">{getLabel(voice)}</div>
                  </div>
                  {voice.preview_url && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePreview(voice); }}
                      className="shrink-0 p-1 rounded hover:bg-white/10"
                    >
                      {previewingId === voice.voice_id ? (
                        <Square className="w-3 h-3 text-white/60" />
                      ) : (
                        <Play className="w-3 h-3 text-white/60" />
                      )}
                    </button>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Train Custom Voice */}
        <button
          onClick={handleTrainVoice}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/70 hover:text-white transition-all"
        >
          <Mic className="w-3.5 h-3.5" />
          Train Custom Voice
        </button>

        {/* Text input + send */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 500))}
              placeholder="Type a message to speak..."
              className="w-full bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl text-sm pr-14"
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              disabled={isGenerating}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-white/30 pointer-events-none">{text.length}/500</span>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={!text.trim() || isGenerating || !selectedVoice}
            size="icon"
            className="rounded-xl bg-white/10 hover:bg-white/20 text-white border-0 shrink-0"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Voice Training Drawer */}
      <VoiceTrainingDrawer
        open={voiceTrainingOpen}
        onOpenChange={setVoiceTrainingOpen}
        onSuccess={() => refetchCustomVoices()}
        customApiKey={isWhale ? undefined : customElevenLabsKey || undefined}
      />

      {/* API Key Prompt for non-whale users */}
      {showApiKeyPrompt && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-[90%] max-w-md rounded-2xl bg-black/95 border border-white/10 p-6 space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-white">Voice Cloning Access</h3>
              <p className="text-sm text-white/60">
                Voice cloning is free for <span className="text-amber-400 font-medium">Blue Whale</span> and <span className="text-amber-400 font-medium">Megalodon</span> badge holders.
              </p>
              <p className="text-sm text-white/60">
                You can still clone voices by providing your own ElevenLabs API key. Get one free at{' '}
                <a href="https://elevenlabs.io" target="_blank" rel="noopener noreferrer" className="text-amber-400 underline hover:text-amber-300">elevenlabs.io</a>
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-white/50">ElevenLabs API Key</label>
              <Input
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="xi_..."
                type="password"
                className="bg-white/10 border-white/10 text-white placeholder:text-white/30 font-mono text-sm"
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => setShowApiKeyPrompt(false)}
                variant="outline"
                className="flex-1 bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!apiKeyInput.trim()) {
                    toast.error('Please enter your ElevenLabs API key');
                    return;
                  }
                  setCustomElevenLabsKey(apiKeyInput.trim());
                  localStorage.setItem('dehub-custom-elevenlabs-key', apiKeyInput.trim());
                  setShowApiKeyPrompt(false);
                  setVoiceTrainingOpen(true);
                }}
                className="flex-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30"
              >
                Continue
              </Button>
            </div>

            <p className="text-[10px] text-white/25 text-center">
              Your key is stored locally and never shared. It's only used for voice cloning requests.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
