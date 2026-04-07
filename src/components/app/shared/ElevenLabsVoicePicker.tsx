import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Play, Square, Loader2, Trash2, Mic } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useCustomVoices, type CustomVoice } from '@/hooks/use-custom-voices';

interface VoiceOption {
  voice_id: string;
  name: string;
  description: string;
  labels: Record<string, string>;
  preview_url: string | null;
}

interface ElevenLabsVoicePickerProps {
  selectedVoiceId: string;
  onSelect: (voiceId: string) => void;
  onTrainVoice?: () => void;
  /** If true, play preview locally instead of injecting into a channel */
  localPreview?: boolean;
  className?: string;
}

export function ElevenLabsVoicePicker({
  selectedVoiceId,
  onSelect,
  onTrainVoice,
  localPreview = true,
  className,
}: ElevenLabsVoicePickerProps) {
  const [search, setSearch] = useState('');
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const { voices: customVoices, isLoading: isLoadingCustom, deleteVoice } = useCustomVoices();

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
    } catch (err) {
      console.error('Voice fetch error:', err);
    } finally {
      setIsLoadingVoices(false);
    }
  }, []);

  useEffect(() => { fetchVoices(''); }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchVoices(search), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const stopPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setPreviewingId(null);
  };

  const handlePreview = async (previewUrl: string, voiceId: string) => {
    stopPreview();
    if (previewingId === voiceId) return;
    if (!previewUrl) return;
    setPreviewingId(voiceId);
    try {
      const audio = new Audio(previewUrl);
      previewAudioRef.current = audio;
      audio.onended = () => setPreviewingId(null);
      audio.onerror = () => setPreviewingId(null);
      await audio.play();
    } catch {
      toast.error('Could not play preview');
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

  useEffect(() => {
    return () => stopPreview();
  }, []);

  return (
    <div className={cn('space-y-2', className)}>
      {/* Search */}
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
      <div className="h-[180px] overflow-y-auto scrollbar-none space-y-1">
        {/* Custom Voices Section */}
        {customVoices.length > 0 && (
          <>
            <div className="text-[10px] uppercase tracking-wider text-white/40 px-2 py-1">
              Your Voices
            </div>
            {customVoices.map((cv) => (
              <button
                key={cv.id}
                onClick={() => onSelect(cv.elevenlabs_voice_id)}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all text-xs',
                  selectedVoiceId === cv.elevenlabs_voice_id
                    ? 'bg-white/20 text-white border border-white/30'
                    : 'bg-white/5 text-white/70 hover:bg-white/10 border border-transparent'
                )}
              >
                <Mic className="w-3 h-3 text-emerald-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{cv.name}</div>
                  <div className="text-[10px] text-white/40">Custom cloned voice</div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteVoice(cv.id); }}
                  className="shrink-0 p-1 rounded hover:bg-white/10"
                >
                  <Trash2 className="w-3 h-3 text-white/40 hover:text-red-400" />
                </button>
              </button>
            ))}
            <div className="text-[10px] uppercase tracking-wider text-white/40 px-2 py-1 pt-2">
              ElevenLabs Library
            </div>
          </>
        )}

        {/* ElevenLabs Library */}
        {isLoadingVoices && voices.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-4 h-4 animate-spin text-white/40" />
          </div>
        ) : voices.length === 0 ? (
          <p className="text-xs text-white/40 text-center py-4">No voices found</p>
        ) : (
          voices.map((voice) => (
            <button
              key={voice.voice_id}
              onClick={() => onSelect(voice.voice_id)}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all text-xs',
                selectedVoiceId === voice.voice_id
                  ? 'bg-white/20 text-white border border-white/30'
                  : 'bg-white/5 text-white/70 hover:bg-white/10 border border-transparent'
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{voice.name.split(' - ')[0]}</div>
                <div className="text-[10px] text-white/40 truncate">{getLabel(voice)}</div>
              </div>
              {voice.preview_url && (
                <button
                  onClick={(e) => { e.stopPropagation(); handlePreview(voice.preview_url!, voice.voice_id); }}
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
          ))
        )}
      </div>

      {/* Train Custom Voice Button */}
      {onTrainVoice && (
        <button
          onClick={onTrainVoice}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/70 hover:text-white transition-all"
        >
          <Mic className="w-3.5 h-3.5" />
          + Train Custom Voice
        </button>
      )}
    </div>
  );
}
