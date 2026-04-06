/**
 * StageSoundboard — host soundboard for Stages
 * All sounds are injected into the Agora channel via injectAudio (same as TTS)
 * so listeners hear them even when the host is muted or on mobile (no speaker loopback).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Music, Volume2, VolumeX, X, Upload, Trash2, Loader2,
  Megaphone, PartyPopper, Drum, Bug, Laugh, Sparkles, User, Ghost, Wand2, Hand,
  ThumbsUp, ThumbsDown, AlertTriangle, Timer, FileAudio,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useStage } from '@/contexts/StageContext';
import { toast } from 'sonner';
import { synthBuiltInToWavBlob } from '@/lib/stage-built-in-synth';

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
  { id: 'shhh', label: 'Shhh', icon: <Hand className="w-4 h-4" />, frequency: 0, type: 'sine', duration: 2000 },
];

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
  shhh: '/sounds/shhh.m4a',
};

interface CustomSound {
  name: string;
  url: string;
  path: string;
}

const MAX_CUSTOM_SOUNDS = 8;
const MAX_FILE_SIZE_MB = 2;
const ACCEPTED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/x-m4a'];

interface StageSoundboardProps {
  isVisible: boolean;
  onClose: () => void;
}

export function StageSoundboard({ isVisible, onClose }: StageSoundboardProps) {
  const { walletAddress } = useAuth();
  const { injectAudio } = useStage();
  const [volume, setVolume] = useState(70);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isInjecting, setIsInjecting] = useState(false);
  const [customSounds, setCustomSounds] = useState<CustomSound[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (walletAddress) loadCustomSounds();
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

  const playBlobOnStage = useCallback(async (blob: Blob, id: string) => {
    setIsInjecting(true);
    setPlayingId(id);
    try {
      await injectAudio(blob);
    } catch (err) {
      console.error('[Soundboard]', err);
      toast.error('Could not play on stage — stay connected as host');
    } finally {
      setIsInjecting(false);
      setPlayingId(null);
    }
  }, [injectAudio]);

  const playBuiltIn = useCallback(async (effect: BuiltInEffect) => {
    if (isInjecting) return;

    const path = AUDIO_FILE_EFFECTS[effect.id];
    if (path) {
      try {
        const res = await fetch(`${window.location.origin}${path}`);
        if (!res.ok) throw new Error('Sound file missing');
        await playBlobOnStage(await res.blob(), effect.id);
      } catch {
        toast.error('Sound file not found');
      }
      return;
    }

    const synthBlob = await synthBuiltInToWavBlob(effect.id, volume);
    if (synthBlob) {
      await playBlobOnStage(synthBlob, effect.id);
      return;
    }

    toast.error('Sound not available');
  }, [isInjecting, playBlobOnStage, volume]);

  const playCustomSound = useCallback(async (sound: CustomSound) => {
    if (isInjecting) return;
    const soundId = `custom-${sound.path}`;
    try {
      const res = await fetch(sound.url);
      if (!res.ok) throw new Error('fetch');
      await playBlobOnStage(await res.blob(), soundId);
    } catch {
      toast.error('Failed to load sound');
    }
  }, [isInjecting, playBlobOnStage]);

  if (!isVisible) return null;

  return (
    <div className="space-y-3 p-3 bg-white/5 rounded-xl border border-white/10 animate-in slide-in-from-bottom-2 duration-200">
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
              'h-6 px-2 text-[10px] rounded-lg',
              showCustom
                ? 'bg-white/15 text-white'
                : 'text-white/50 hover:text-white hover:bg-white/10'
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

      {!showCustom && (
        <div className="grid grid-cols-4 gap-2">
          {BUILT_IN_EFFECTS.map((effect) => (
            <button
              key={effect.id}
              type="button"
              onClick={() => playBuiltIn(effect)}
              disabled={isInjecting}
              className={cn(
                'flex flex-col items-center gap-1 p-2 rounded-xl text-center transition-all',
                'border border-white/10 hover:border-white/20',
                playingId === effect.id
                  ? 'bg-black/40 border-white/30 scale-95'
                  : 'bg-white/10 hover:bg-white/15',
                isInjecting && playingId !== effect.id && 'opacity-40'
              )}
            >
              <div className={cn('text-white/70', playingId === effect.id && 'text-white animate-pulse')}>
                {effect.icon}
              </div>
              <span className="text-[10px] text-white/60 leading-tight">{effect.label}</span>
            </button>
          ))}
        </div>
      )}

      {showCustom && (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || customSounds.length >= MAX_CUSTOM_SOUNDS}
            className={cn(
              'w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed transition-all',
              'border-white/20 text-white/50 hover:text-white hover:border-white/30 hover:bg-white/5',
              (isUploading || customSounds.length >= MAX_CUSTOM_SOUNDS) && 'opacity-40 cursor-not-allowed'
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
                      type="button"
                      onClick={() => playCustomSound(sound)}
                      disabled={isInjecting}
                      className={cn(
                        'w-full flex flex-col items-center gap-1 p-2 rounded-xl text-center transition-all',
                        'border border-white/10 hover:border-white/20',
                        playingId === soundId
                          ? 'bg-white/20 border-white/30 scale-95'
                          : 'bg-white/5 hover:bg-white/10',
                        isInjecting && playingId !== soundId && 'opacity-40'
                      )}
                    >
                      <div className={cn('text-white/70', playingId === soundId && 'text-white animate-pulse')}>
                        <FileAudio className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] text-white/50 leading-tight truncate w-full">
                        {sound.name}
                      </span>
                    </button>
                    <button
                      type="button"
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
