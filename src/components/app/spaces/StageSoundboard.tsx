/**
 * StageSoundboard - Host soundboard for Stages
 * Built-in synthesized effects + custom uploaded sounds via Howler.js
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Howl } from 'howler';
import { 
  Music, Volume2, VolumeX, X, Upload, Trash2, Loader2,
  Megaphone, PartyPopper, Drum, Bug, Laugh, Sparkles, User, Ghost, Wand2,
  ThumbsUp, ThumbsDown, AlertTriangle, Timer, FileAudio
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// ---------- Built-in effects (synthesized via Web Audio API) ----------

interface BuiltInEffect {
  id: string;
  label: string;
  icon: React.ReactNode;
  frequency: number;
  type: OscillatorType;
  duration: number;
}

const BUILT_IN_EFFECTS: BuiltInEffect[] = [
  { id: 'airhorn', label: 'Air Horn', icon: <Megaphone className="w-4 h-4" />, frequency: 600, type: 'sawtooth', duration: 800 },
  { id: 'applause', label: 'Applause', icon: <PartyPopper className="w-4 h-4" />, frequency: 0, type: 'sawtooth', duration: 2000 },
  { id: 'drumroll', label: 'Drum Roll', icon: <Drum className="w-4 h-4" />, frequency: 150, type: 'triangle', duration: 1500 },
  { id: 'buzzer', label: 'Buzzer', icon: <AlertTriangle className="w-4 h-4" />, frequency: 200, type: 'square', duration: 500 },
  { id: 'ding', label: 'Ding', icon: <ThumbsUp className="w-4 h-4" />, frequency: 880, type: 'sine', duration: 300 },
  { id: 'boo', label: 'Boo', icon: <ThumbsDown className="w-4 h-4" />, frequency: 100, type: 'sawtooth', duration: 600 },
  { id: 'cricket', label: 'Crickets', icon: <Bug className="w-4 h-4" />, frequency: 4000, type: 'sine', duration: 2000 },
  { id: 'countdown', label: 'Countdown', icon: <Timer className="w-4 h-4" />, frequency: 440, type: 'sine', duration: 3000 },
  { id: 'lol', label: 'LOL', icon: <Laugh className="w-4 h-4" />, frequency: 0, type: 'sine', duration: 2000 },
  { id: 'ooh-ahh', label: 'Ooh Ahh', icon: <Sparkles className="w-4 h-4" />, frequency: 0, type: 'sine', duration: 3000 },
  { id: 'ooh-man', label: 'Ooh (Man)', icon: <User className="w-4 h-4" />, frequency: 0, type: 'sine', duration: 1000 },
  { id: 'ohh-girl', label: 'Ohh (Girl)', icon: <User className="w-4 h-4" />, frequency: 0, type: 'sine', duration: 1500 },
  { id: 'ba-dum-tish', label: 'Ba Dum Tish', icon: <Drum className="w-4 h-4" />, frequency: 0, type: 'sine', duration: 2000 },
  { id: 'spooky', label: 'Spooky', icon: <Ghost className="w-4 h-4" />, frequency: 0, type: 'sine', duration: 2000 },
  { id: 'magic-spell', label: 'Magic Spell', icon: <Wand2 className="w-4 h-4" />, frequency: 0, type: 'sine', duration: 2000 },
];

// ---------- Custom sound type ----------

interface CustomSound {
  name: string;
  url: string;
  path: string; // storage path for deletion
}

const MAX_CUSTOM_SOUNDS = 8;
const MAX_FILE_SIZE_MB = 2;
const ACCEPTED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/x-m4a'];

// ---------- Component ----------

interface StageSoundboardProps {
  isVisible: boolean;
  onClose: () => void;
}

export function StageSoundboard({ isVisible, onClose }: StageSoundboardProps) {
  const { walletAddress } = useAuth();
  const [volume, setVolume] = useState(70);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [customSounds, setCustomSounds] = useState<CustomSound[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const howlRef = useRef<Howl | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load custom sounds on mount
  useEffect(() => {
    if (walletAddress) {
      loadCustomSounds();
    }
  }, [walletAddress]);

  const loadCustomSounds = async () => {
    if (!walletAddress) return;
    const folder = walletAddress.toLowerCase();
    const { data, error } = await supabase.storage
      .from('soundboard-sounds')
      .list(folder, { limit: MAX_CUSTOM_SOUNDS, sortBy: { column: 'created_at', order: 'asc' } });

    if (error || !data) return;

    const sounds: CustomSound[] = data
      .filter(f => f.name !== '.emptyFolderPlaceholder')
      .map(f => {
        const path = `${folder}/${f.name}`;
        const { data: urlData } = supabase.storage.from('soundboard-sounds').getPublicUrl(path);
        const label = f.name.replace(/\.[^.]+$/, '').replace(/-/g, ' ').replace(/_/g, ' ');
        return { name: label, url: urlData.publicUrl, path };
      });

    setCustomSounds(sounds);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !walletAddress) return;

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (!ACCEPTED_AUDIO_TYPES.includes(file.type)) {
      toast.error('Only audio files (MP3, WAV, OGG, M4A) are supported');
      return;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error(`File must be under ${MAX_FILE_SIZE_MB}MB`);
      return;
    }

    if (customSounds.length >= MAX_CUSTOM_SOUNDS) {
      toast.error(`Max ${MAX_CUSTOM_SOUNDS} custom sounds. Delete one first.`);
      return;
    }

    setIsUploading(true);
    const folder = walletAddress.toLowerCase();
    const ext = file.name.split('.').pop() || 'mp3';
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
    const path = `${folder}/${Date.now()}-${safeName}`;

    const { error } = await supabase.storage
      .from('soundboard-sounds')
      .upload(path, file, { contentType: file.type, upsert: false });

    setIsUploading(false);

    if (error) {
      toast.error('Upload failed');
      return;
    }

    toast.success('Sound uploaded!');
    await loadCustomSounds();
  };

  const handleDelete = async (sound: CustomSound) => {
    const { error } = await supabase.storage
      .from('soundboard-sounds')
      .remove([sound.path]);

    if (error) {
      toast.error('Failed to delete');
      return;
    }

    setCustomSounds(prev => prev.filter(s => s.path !== sound.path));
  };

  // ---------- Stop helper ----------

  const stopCurrentSound = useCallback(() => {
    if (howlRef.current) {
      howlRef.current.stop();
      howlRef.current.unload();
      howlRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setPlayingId(null);
  }, []);

  // ---------- Audio playback ----------

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const playCustomSound = useCallback((sound: CustomSound) => {
    const soundId = `custom-${sound.path}`;
    if (playingId === soundId) { stopCurrentSound(); return; }
    if (playingId) stopCurrentSound();
    setPlayingId(soundId);

    if (howlRef.current) {
      howlRef.current.unload();
    }

    howlRef.current = new Howl({
      src: [sound.url],
      volume: volume / 100,
      onend: () => setPlayingId(null),
      onloaderror: () => {
        toast.error('Failed to load sound');
        setPlayingId(null);
      },
      onplayerror: () => {
        toast.error('Failed to play sound');
        setPlayingId(null);
      }
    });

    howlRef.current.play();
  }, [playingId, volume, stopCurrentSound]);

  const playApplause = useCallback((ctx: AudioContext, gainNode: GainNode, duration: number) => {
    const bufferSize = ctx.sampleRate * (duration / 1000);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const envelope = Math.min(1, i / (ctx.sampleRate * 0.1)) * Math.min(1, (bufferSize - i) / (ctx.sampleRate * 0.3));
      data[i] = (Math.random() * 2 - 1) * envelope * 0.5;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000;
    filter.Q.value = 0.5;
    source.connect(filter);
    filter.connect(gainNode);
    source.start();
  }, []);

  const playCrickets = useCallback((ctx: AudioContext, gainNode: GainNode, duration: number) => {
    const endTime = ctx.currentTime + duration / 1000;
    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator();
      const chirpGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 3800 + Math.random() * 400;
      const startOffset = (i * 0.3) + Math.random() * 0.1;
      const chirpDuration = 0.08;
      chirpGain.gain.setValueAtTime(0, ctx.currentTime);
      chirpGain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + startOffset);
      chirpGain.gain.linearRampToValueAtTime(0, ctx.currentTime + startOffset + chirpDuration);
      const repeatStart = startOffset + 0.15;
      chirpGain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + repeatStart);
      chirpGain.gain.linearRampToValueAtTime(0, ctx.currentTime + repeatStart + chirpDuration);
      osc.connect(chirpGain);
      chirpGain.connect(gainNode);
      osc.start(ctx.currentTime);
      osc.stop(endTime);
    }
  }, []);

  const playCountdown = useCallback((ctx: AudioContext, gainNode: GainNode) => {
    [0, 1, 2, 3].forEach((i) => {
      const osc = ctx.createOscillator();
      const beepGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 3 ? 880 : 440;
      const start = ctx.currentTime + i * 0.8;
      beepGain.gain.setValueAtTime(0, start);
      beepGain.gain.linearRampToValueAtTime(0.5, start + 0.02);
      beepGain.gain.linearRampToValueAtTime(0, start + (i === 3 ? 0.6 : 0.3));
      osc.connect(beepGain);
      beepGain.connect(gainNode);
      osc.start(start);
      osc.stop(start + 0.8);
    });
  }, []);

  // Map of built-in effects that use real audio files instead of synthesis
  const AUDIO_FILE_EFFECTS: Record<string, string> = {
    airhorn: '/sounds/airhorn.wav',
    applause: '/sounds/applause.wav',
    cricket: '/sounds/crickets.wav',
    drumroll: '/sounds/drumroll.wav',
    lol: '/sounds/lol.wav',
    'ooh-ahh': '/sounds/ooh-ahh.wav',
    'ooh-man': '/sounds/ooh-man.wav',
    'ohh-girl': '/sounds/ohh-girl.ogg',
    'ba-dum-tish': '/sounds/ba-dum-tish.wav',
    spooky: '/sounds/spooky.wav',
    'magic-spell': '/sounds/magic-spell.m4a',
  };

  const playBuiltIn = useCallback((effect: BuiltInEffect) => {
    if (playingId === effect.id) { stopCurrentSound(); return; }
    if (playingId) stopCurrentSound();

    // If this effect has a real audio file, play it via Howler
    const audioFile = AUDIO_FILE_EFFECTS[effect.id];
    if (audioFile) {
      setPlayingId(effect.id);
      if (howlRef.current) howlRef.current.unload();
      howlRef.current = new Howl({
        src: [audioFile],
        volume: volume / 100,
        onend: () => setPlayingId(null),
        onloaderror: () => { setPlayingId(null); },
        onplayerror: () => { setPlayingId(null); },
      });
      howlRef.current.play();
      return;
    }

    // Otherwise use synthesized audio
    const ctx = getAudioContext();
    const gainNode = ctx.createGain();
    gainNode.gain.value = volume / 100;
    gainNode.connect(ctx.destination);
    setPlayingId(effect.id);

    if (effect.id === 'cricket') {
      playCrickets(ctx, gainNode, effect.duration);
    } else if (effect.id === 'countdown') {
      playCountdown(ctx, gainNode);
    } else {
      const osc = ctx.createOscillator();
      osc.type = effect.type;
      osc.frequency.value = effect.frequency;
      const envGain = ctx.createGain();
      envGain.gain.setValueAtTime(0, ctx.currentTime);
      envGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.02);
      if (effect.id === 'airhorn') {
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(700, ctx.currentTime + 0.1);
        envGain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + effect.duration / 1000);
      } else if (effect.id === 'drumroll') {
        for (let i = 0; i < 30; i++) {
          const t = ctx.currentTime + i * 0.05;
          envGain.gain.linearRampToValueAtTime(0.5, t);
          envGain.gain.linearRampToValueAtTime(0.1, t + 0.025);
        }
      } else {
        envGain.gain.linearRampToValueAtTime(0, ctx.currentTime + effect.duration / 1000);
      }
      osc.connect(envGain);
      envGain.connect(gainNode);
      osc.start();
      osc.stop(ctx.currentTime + effect.duration / 1000);
    }

    timeoutRef.current = setTimeout(() => setPlayingId(null), effect.duration);
  }, [playingId, volume, getAudioContext, playCrickets, playCountdown, stopCurrentSound]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
      }
      if (howlRef.current) howlRef.current.unload();
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div className="space-y-3 p-3 bg-white/5 rounded-xl border border-white/10 animate-in slide-in-from-bottom-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <Music className="w-4 h-4" />
          Soundboard
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCustom(!showCustom)}
            className={cn(
              "h-6 px-2 text-[10px] rounded-lg",
              showCustom
                ? "bg-white/15 text-white"
                : "text-white/50 hover:text-white hover:bg-white/10"
            )}
          >
            {showCustom ? 'Built-in' : 'My Sounds'}
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className="w-6 h-6 text-white/50 hover:text-white hover:bg-white/10 rounded-lg"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Volume Control */}
      <div className="flex items-center gap-2">
        <VolumeX className="w-3 h-3 text-white/40 shrink-0" />
        <Slider
          value={[volume]}
          onValueChange={([v]) => setVolume(v)}
          max={100}
          min={0}
          step={5}
          className="flex-1"
        />
        <Volume2 className="w-3 h-3 text-white/40 shrink-0" />
        <span className="text-xs text-white/40 w-8 text-right">{volume}%</span>
      </div>

      {/* Built-in Sounds Grid */}
      {!showCustom && (
        <div className="grid grid-cols-4 gap-2">
          {BUILT_IN_EFFECTS.map((effect) => (
            <button
              key={effect.id}
              onClick={() => playBuiltIn(effect)}
              disabled={false}
              className={cn(
                "flex flex-col items-center gap-1 p-2 rounded-xl text-center transition-all",
                "border border-white/10 hover:border-white/20",
                playingId === effect.id
                  ? "bg-white/20 border-white/30 scale-95"
                  : "bg-white/5 hover:bg-white/10",
                playingId !== null && playingId !== effect.id && "opacity-40"
              )}
            >
              <div className={cn(
                "text-white/70",
                playingId === effect.id && "text-white animate-pulse"
              )}>
                {effect.icon}
              </div>
              <span className="text-[10px] text-white/50 leading-tight">{effect.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Custom Sounds */}
      {showCustom && (
        <div className="space-y-2">
          {/* Upload Button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || customSounds.length >= MAX_CUSTOM_SOUNDS}
            className={cn(
              "w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed transition-all",
              "border-white/20 text-white/50 hover:text-white hover:border-white/30 hover:bg-white/5",
              (isUploading || customSounds.length >= MAX_CUSTOM_SOUNDS) && "opacity-40 cursor-not-allowed"
            )}
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            <span className="text-xs">
              {isUploading ? 'Uploading...' : `Upload Sound (${customSounds.length}/${MAX_CUSTOM_SOUNDS})`}
            </span>
          </button>

          {/* Custom sounds grid */}
          {customSounds.length === 0 ? (
            <p className="text-center text-xs text-white/30 py-3">
              No custom sounds yet. Upload MP3, WAV, or OGG files (max {MAX_FILE_SIZE_MB}MB).
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {customSounds.map((sound) => {
                const soundId = `custom-${sound.path}`;
                return (
                  <div key={sound.path} className="relative group">
                    <button
                      onClick={() => playCustomSound(sound)}
                      disabled={false}
                      className={cn(
                        "w-full flex flex-col items-center gap-1 p-2 rounded-xl text-center transition-all",
                        "border border-white/10 hover:border-white/20",
                        playingId === soundId
                          ? "bg-white/20 border-white/30 scale-95"
                          : "bg-white/5 hover:bg-white/10",
                        playingId !== null && playingId !== soundId && "opacity-40"
                      )}
                    >
                      <div className={cn(
                        "text-white/70",
                        playingId === soundId && "text-white animate-pulse"
                      )}>
                        <FileAudio className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] text-white/50 leading-tight truncate w-full">
                        {sound.name}
                      </span>
                    </button>
                    {/* Delete button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(sound); }}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full items-center justify-center hidden group-hover:flex"
                    >
                      <Trash2 className="w-2.5 h-2.5 text-white" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
