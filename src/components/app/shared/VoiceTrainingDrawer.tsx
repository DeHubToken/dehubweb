import { useState, useRef, useCallback } from 'react';
import { Mic, Upload, Loader2, X, Square, Key } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';

interface VoiceTrainingDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** If provided, user is using their own API key (non-whale flow) */
  customApiKey?: string;
}

export function VoiceTrainingDrawer({ open, onOpenChange, onSuccess, customApiKey }: VoiceTrainingDrawerProps) {
  const { walletAddress } = useAuth();
  const [voiceName, setVoiceName] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], 'voice-sample.webm', { type: 'audio/webm' });
        setAudioFile(file);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch {
      toast.error('Could not access microphone');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File too large. Max 10MB.');
        return;
      }
      setAudioFile(file);
    }
  };

  const handleSubmit = async () => {
    if (!voiceName.trim() || !audioFile || !walletAddress) return;
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', voiceName.trim());
      formData.append('file', audioFile);
      formData.append('walletAddress', walletAddress);
      if (customApiKey) {
        formData.append('customApiKey', customApiKey);
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-clone-voice`,
        {
          method: 'POST',
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'x-wallet-address': walletAddress,
          },
          body: formData,
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Clone failed' }));
        throw new Error(err.error || 'Voice cloning failed');
      }

      const data = await res.json();

      // Save to custom_voices table
      const { error: dbError } = await withWalletHeader(
        supabase.from('custom_voices').insert({
          wallet_address: walletAddress,
          elevenlabs_voice_id: data.voice_id,
          name: voiceName.trim(),
        } as any),
        walletAddress
      );

      if (dbError) throw dbError;

      toast.success('Voice cloned successfully!');
      setVoiceName('');
      setAudioFile(null);
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Voice clone error:', err);
      toast.error(err.message || 'Failed to clone voice');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-black/90 border-white/10 text-white max-h-[85vh]">
        <DrawerHeader className="flex items-center justify-between">
          <DrawerTitle className="text-white">Train Custom Voice</DrawerTitle>
          <button onClick={() => onOpenChange(false)} className="p-1 rounded-lg hover:bg-white/10">
            <X className="w-5 h-5 text-white/60" />
          </button>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-4">
          {/* Custom API Key indicator */}
          {customApiKey && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs text-amber-300">Using your personal ElevenLabs API key</span>
            </div>
          )}

          {/* Voice Name */}
          <div className="space-y-1">
            <label className="text-xs text-white/60">Voice Name</label>
            <Input
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              placeholder="e.g. My Voice"
              className="bg-white/10 border-white/10 text-white placeholder:text-white/40"
              maxLength={50}
            />
          </div>

          {/* Audio Sample */}
          <div className="space-y-2">
            <label className="text-xs text-white/60">Audio Sample</label>
            <div className="flex flex-col gap-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span className="text-[11px] text-white/70"><span className="text-white font-medium">Minimum:</span> 30 seconds of clear speech</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[11px] text-white/70"><span className="text-white font-medium">Recommended:</span> 1–3 minutes for best results</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
                <span className="text-[11px] text-white/50">No background noise or music. One speaker only.</span>
              </div>
            </div>

            {audioFile ? (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                <Mic className="w-4 h-4 text-emerald-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{audioFile.name}</p>
                  <p className="text-xs text-white/40">{(audioFile.size / 1024).toFixed(0)} KB</p>
                </div>
                <button onClick={() => setAudioFile(null)} className="p-1 hover:bg-white/10 rounded-lg">
                  <X className="w-4 h-4 text-white/40" />
                </button>
              </div>
            ) : isRecording ? (
              <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center animate-pulse">
                  <Mic className="w-6 h-6 text-red-400" />
                </div>
                <p className="text-sm text-white">Recording... {formatTime(recordingTime)}</p>
                {recordingTime < 30 && (
                  <p className="text-[10px] text-amber-400">Keep going — need at least {30 - recordingTime}s more</p>
                )}
                {recordingTime >= 30 && recordingTime < 60 && (
                  <p className="text-[10px] text-emerald-400">✓ Minimum reached — more is better!</p>
                )}
                {recordingTime >= 60 && (
                  <p className="text-[10px] text-emerald-400">✓ Great length for high quality cloning</p>
                )}
                <Button onClick={stopRecording} variant="outline" size="sm" className="bg-white/10 border-white/20 text-white" disabled={recordingTime < 10}>
                  <Square className="w-3 h-3 mr-1" /> Stop
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={startRecording}
                  className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-white/70 transition-all"
                >
                  <Mic className="w-4 h-4" /> Record
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-white/70 transition-all"
                >
                  <Upload className="w-4 h-4" /> Upload
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            )}
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!voiceName.trim() || !audioFile || isSubmitting}
            className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/10"
          >
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Cloning Voice...</>
            ) : (
              'Clone Voice'
            )}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
