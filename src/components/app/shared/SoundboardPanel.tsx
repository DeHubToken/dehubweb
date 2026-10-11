import { translateCopy as _translateCopy } from '@/i18n/copy';
import { useTranslation as _useCopy } from 'react-i18next';
/**
 * SoundboardPanel — the pads, the uploads and the volume slider, with no
 * opinion about where the sound goes.
 *
 * Both surfaces that use it mix a clip into the SAME audio destination their
 * voice already publishes, which is why listeners hear it even while the host
 * is muted: Stages injects into the Agora track (see StageSoundboard), the
 * livestream broadcaster injects into the WHIP track's effect graph. All this
 * component knows is `playClip`.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Music, Volume2, VolumeX, X, Upload, Trash2, Loader2,
  Megaphone, PartyPopper, Drum, Bug, Laugh, Sparkles, User, Ghost, Wand2, Hand,
  ThumbsUp, ThumbsDown, AlertTriangle, Timer, FileAudio,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppState } from '@/components/app/AppState';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { walletScopedClient } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';
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
  { id: 'airhorn', get label() { return _translateCopy("copy.f54b39e033b3", { defaultValue: "Air Horn" }); }, icon: <Megaphone className="w-4 h-4" />, frequency: 600, type: 'sawtooth', duration: 800 },
  { id: 'applause', get label() { return _translateCopy("copy.fea1eae3041c", { defaultValue: "Applause" }); }, icon: <PartyPopper className="w-4 h-4" />, frequency: 0, type: 'sawtooth', duration: 2000 },
  { id: 'drumroll', get label() { return _translateCopy("copy.6d63c3b074d5", { defaultValue: "Drum Roll" }); }, icon: <Drum className="w-4 h-4" />, frequency: 150, type: 'triangle', duration: 1500 },
  { id: 'buzzer', get label() { return _translateCopy("copy.f4f65ad617fc", { defaultValue: "Buzzer" }); }, icon: <AlertTriangle className="w-4 h-4" />, frequency: 200, type: 'square', duration: 500 },
  { id: 'ding', get label() { return _translateCopy("copy.df786320d86f", { defaultValue: "Ding" }); }, icon: <ThumbsUp className="w-4 h-4" />, frequency: 880, type: 'sine', duration: 300 },
  { id: 'boo', get label() { return _translateCopy("copy.bf66f3e41e47", { defaultValue: "Boo" }); }, icon: <ThumbsDown className="w-4 h-4" />, frequency: 100, type: 'sawtooth', duration: 600 },
  { id: 'cricket', get label() { return _translateCopy("copy.511a943d6125", { defaultValue: "Crickets" }); }, icon: <Bug className="w-4 h-4" />, frequency: 4000, type: 'sine', duration: 2000 },
  { id: 'countdown', get label() { return _translateCopy("copy.a9b7f3f14fe3", { defaultValue: "Countdown" }); }, icon: <Timer className="w-4 h-4" />, frequency: 440, type: 'sine', duration: 3000 },
  { id: 'lol', get label() { return _translateCopy("copy.6e0290d62f6d", { defaultValue: "LOL" }); }, icon: <Laugh className="w-4 h-4" />, frequency: 0, type: 'sine', duration: 2000 },
  { id: 'ooh-ahh', get label() { return _translateCopy("copy.021aaa052282", { defaultValue: "Ooh Ahh" }); }, icon: <Sparkles className="w-4 h-4" />, frequency: 0, type: 'sine', duration: 3000 },
  { id: 'ooh-man', get label() { return _translateCopy("copy.f3404466f096", { defaultValue: "Ooh (Man)" }); }, icon: <User className="w-4 h-4" />, frequency: 0, type: 'sine', duration: 1000 },
  { id: 'ohh-girl', get label() { return _translateCopy("copy.ab7b9519e1a2", { defaultValue: "Ohh (Girl)" }); }, icon: <User className="w-4 h-4" />, frequency: 0, type: 'sine', duration: 1500 },
  { id: 'ba-dum-tish', get label() { return _translateCopy("copy.d65768d34aa0", { defaultValue: "Ba Dum Tish" }); }, icon: <Drum className="w-4 h-4" />, frequency: 0, type: 'sine', duration: 2000 },
  { id: 'spooky', get label() { return _translateCopy("copy.07339b14c9a0", { defaultValue: "Spooky" }); }, icon: <Ghost className="w-4 h-4" />, frequency: 0, type: 'sine', duration: 2000 },
  { id: 'magic-spell', get label() { return _translateCopy("copy.d9bdbfaed8c9", { defaultValue: "Magic Spell" }); }, icon: <Wand2 className="w-4 h-4" />, frequency: 0, type: 'sine', duration: 2000 },
  { id: 'shhh', get label() { return _translateCopy("copy.f334cda47039", { defaultValue: "Shhh" }); }, icon: <Hand className="w-4 h-4" />, frequency: 0, type: 'sine', duration: 2000 },
];

const AUDIO_FILE_EFFECTS: Record<string, string> = {
  airhorn: '/sounds/airhorn.wav',
  applause: '/sounds/applause.wav',
  cricket: '/sounds/crickets.mp3',
  drumroll: '/sounds/drumroll.wav',
  lol: '/sounds/lol.mp3',
  'ooh-ahh': '/sounds/ooh-ahh.mp3',
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

export interface SoundboardPanelProps {
  isVisible: boolean;
  onClose: () => void;
  /**
   * Mixes a clip into the outgoing audio. Rejecting is how a surface says
   * "not connected" — the pad clears and `errorMessage` is shown.
   */
  playClip: (blob: Blob, meta: { id: string; label: string }) => Promise<void>;
  /** Cuts whatever is currently playing. */
  stopClip: () => void;
  /** What to tell the host when playClip rejects; surfaces fail differently. */
  errorMessage?: string;
}

export function SoundboardPanel({
  isVisible,
  onClose,
  playClip,
  stopClip,
  errorMessage = 'Could not play that sound',
}: SoundboardPanelProps) {
  const { t: _copy } = _useCopy();
  const { walletAddress } = useAuth();
  const [volume, setVolume] = useState(70);
  const [playingId, setPlayingId] = useState<string | null>(null);
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
      // `id: null` is how Supabase lists a nested folder rather than a file.
      // The host's stage radio clips live in `<wallet>/music/`, and without
      // this that folder renders as a pad whose URL leads nowhere — and eats
      // one of the eight slots.
      .filter(f => f.id !== null && f.name !== '.emptyFolderPlaceholder')
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
      toast.error(_copy("copy.dfdabf593cb3", { defaultValue: "Only audio files (MP3, WAV, OGG, M4A) are supported" }));
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
      toast.error(_copy("copy.6efc5d27f30b", { defaultValue: "Upload failed" }));
      return;
    }

    toast.success(_copy("copy.776713aa2680", { defaultValue: "Sound uploaded!" }));
    await loadCustomSounds();
  };

  const handleDelete = async (sound: CustomSound) => {
    if (!walletAddress) return;
    // Storage has no per-call header, so the delete goes through a client
    // pinned to this wallet for the bucket's delete policy to check.
    const { error } = await walletScopedClient(walletAddress).storage
      .from('soundboard-sounds')
      .remove([sound.path]);

    if (error) {
      toast.error(_copy("copy.f625b14e1b2c", { defaultValue: "Failed to delete" }));
      return;
    }

    setCustomSounds(prev => prev.filter(s => s.path !== sound.path));
  };

  // Light up the pressed pad immediately (before any fetch/decode) so the board
  // feels instant, then cut to the new clip. Injection itself stops whatever
  // was already playing, so tapping another pad jumps straight to it — DJ-deck.
  const playBlob = useCallback(async (blob: Blob, id: string, label?: string) => {
    try {
      await playClip(blob, { id, label: label || id });
    } catch (err) {
      console.error('[Soundboard]', err);
      toast.error(errorMessage);
    } finally {
      // Only clear if this pad is still the active one — a pad tapped mid-play
      // has already claimed playingId and must not be cleared by the old clip.
      setPlayingId((cur) => (cur === id ? null : cur));
    }
  }, [playClip, errorMessage]);

  const stopSound = useCallback(() => {
    stopClip();
    setPlayingId(null);
  }, [stopClip]);

  const playBuiltIn = useCallback(async (effect: BuiltInEffect) => {
    setPlayingId(effect.id);

    const path = AUDIO_FILE_EFFECTS[effect.id];
    if (path) {
      try {
        const res = await fetch(`${window.location.origin}${path}`);
        if (!res.ok) throw new Error('Sound file missing');
        await playBlob(await res.blob(), effect.id, effect.label);
      } catch {
        setPlayingId((cur) => (cur === effect.id ? null : cur));
        toast.error(_copy("copy.d31e3e3d7010", { defaultValue: "Sound file not found" }));
      }
      return;
    }

    const synthBlob = await synthBuiltInToWavBlob(effect.id, volume);
    if (synthBlob) {
      await playBlob(synthBlob, effect.id, effect.label);
      return;
    }

    setPlayingId((cur) => (cur === effect.id ? null : cur));
    toast.error(_copy("copy.095b8cb02d69", { defaultValue: "Sound not available" }));
  }, [playBlob, volume, _copy]);

  const playCustomSound = useCallback(async (sound: CustomSound) => {
    const soundId = `custom-${sound.path}`;
    setPlayingId(soundId);
    try {
      const res = await fetch(sound.url);
      if (!res.ok) throw new Error('fetch');
      await playBlob(await res.blob(), soundId, sound.name);
    } catch {
      setPlayingId((cur) => (cur === soundId ? null : cur));
      toast.error(_copy("copy.b36b7ab19ada", { defaultValue: "Failed to load sound" }));
    }
  }, [playBlob, _copy]);

  if (!isVisible) return null;

  return (
    <div className="space-y-3 p-3 bg-white/5 rounded-xl border border-white/10 animate-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <Music className="w-4 h-4" />{_copy("copy.07ff885c843a", { defaultValue: "Soundboard" })}</h3>
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
            {showCustom ? _copy("copy.1f43948106d1", { defaultValue: "Built-in" }) : _copy("copy.fb57e7863d72", { defaultValue: "My Sounds" })}
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
          {BUILT_IN_EFFECTS.map((effect) => {
            const isPlaying = playingId === effect.id;
            return (
              <div key={effect.id} className="relative">
                <button
                  type="button"
                  onClick={() => playBuiltIn(effect)}
                  className={cn(
                    'w-full flex flex-col items-center gap-1 p-2 rounded-xl text-center transition-all duration-100',
                    'border border-white/10 hover:border-white/20 active:scale-95',
                    isPlaying
                      ? 'bg-black/40 border-white/30 scale-95'
                      : 'bg-white/10 hover:bg-white/15'
                  )}
                >
                  <div className={cn('text-white/70', isPlaying && 'text-white animate-pulse')}>
                    {effect.icon}
                  </div>
                  <span className="text-[10px] text-white/60 leading-tight">{effect.label}</span>
                </button>
                {isPlaying && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); stopSound(); }}
                    aria-label={_copy("copy.774442f41e85", { defaultValue: "Stop {{value1}}", value1: effect.label })}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-600 rounded-md flex items-center justify-center shadow-lg ring-2 ring-black/30"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                )}
              </div>
            );
          })}
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
              {isUploading ? _copy("copy.72cb29c90ccd", { defaultValue: "Uploading..." }) : _copy("copy.1cae8c565861", { defaultValue: "Upload Sound ({{value1}}/{{value2}})", value1: customSounds.length, value2: MAX_CUSTOM_SOUNDS })}
            </span>
          </button>

          {customSounds.length === 0 ? (
            <AppState
              icon="audio"
              title={_copy("copy.8a1543aa7550", { defaultValue: "No custom sounds yet" })}
              description={_copy("copy.af1f0acbd565", { defaultValue: "Upload MP3, WAV, or OGG files up to {{value1}}MB.", value1: MAX_FILE_SIZE_MB })}
              size="compact"
            />
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {customSounds.map((sound) => {
                const soundId = `custom-${sound.path}`;
                const isPlaying = playingId === soundId;
                return (
                  <div key={sound.path} className="relative group">
                    <button
                      type="button"
                      onClick={() => playCustomSound(sound)}
                      className={cn(
                        'w-full flex flex-col items-center gap-1 p-2 rounded-xl text-center transition-all duration-100',
                        'border border-white/10 hover:border-white/20 active:scale-95',
                        isPlaying
                          ? 'bg-white/20 border-white/30 scale-95'
                          : 'bg-white/5 hover:bg-white/10'
                      )}
                    >
                      <div className={cn('text-white/70', isPlaying && 'text-white animate-pulse')}>
                        <FileAudio className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] text-white/50 leading-tight truncate w-full">
                        {sound.name}
                      </span>
                    </button>
                    {isPlaying ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); stopSound(); }}
                        aria-label={_copy("copy.774442f41e85", { defaultValue: "Stop {{value1}}", value1: sound.name })}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-600 rounded-md flex items-center justify-center shadow-lg ring-2 ring-black/30"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDelete(sound); }}
                        aria-label={_copy("copy.264fa40661cb", { defaultValue: "Delete {{value1}}", value1: sound.name })}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded items-center justify-center hidden group-hover:flex"
                      >
                        <Trash2 className="w-2.5 h-2.5 text-white" />
                      </button>
                    )}
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
