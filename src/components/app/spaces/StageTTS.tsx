import { useState } from 'react';
import { Volume2, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useStage } from '@/contexts/StageContext';

const TTS_VOICES = [
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice' },
] as const;

export function StageTTS() {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<string>(TTS_VOICES[0].id);
  const [isGenerating, setIsGenerating] = useState(false);
  const { injectAudio } = useStage();

  const handleGenerate = async () => {
    if (!text.trim() || isGenerating) return;

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

  return (
    <div className="space-y-2 p-3 bg-white/5 rounded-xl border border-white/10">
      <h3 className="text-sm font-medium text-white flex items-center gap-2">
        <Volume2 className="w-4 h-4" />
        Text-to-Speech
      </h3>

      {/* Voice selector */}
      <div className="flex flex-wrap gap-1.5">
        {TTS_VOICES.map((voice) => (
          <button
            key={voice.id}
            onClick={() => setSelectedVoice(voice.id)}
            className={cn(
              "px-2.5 py-1 rounded-lg text-xs transition-all",
              selectedVoice === voice.id
                ? "bg-white/20 text-white border border-white/30"
                : "bg-white/5 text-white/60 hover:bg-white/10 border border-transparent"
            )}
          >
            {voice.emoji} {voice.name}
          </button>
        ))}
      </div>

      {/* Text input + send */}
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          placeholder="Type a message to speak..."
          className="flex-1 bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl text-sm"
          onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
          disabled={isGenerating}
        />
        <Button
          onClick={handleGenerate}
          disabled={!text.trim() || isGenerating}
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

      <p className="text-[10px] text-white/30 text-right">{text.length}/500</p>
    </div>
  );
}
