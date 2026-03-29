/**
 * StageSoundboard - Host soundboard for Stages
 * Uses Howler.js to play sound effects into the audio stream
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Howl } from 'howler';
import { 
  Music, Volume2, VolumeX, X,
  Megaphone, PartyPopper, Drum, Bug,
  ThumbsUp, ThumbsDown, AlertTriangle, Timer
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

interface SoundEffect {
  id: string;
  label: string;
  icon: React.ReactNode;
  frequency: number; // Hz for generated tone
  type: OscillatorType;
  duration: number; // ms
  pattern?: number[]; // for multi-tone patterns (freq pairs)
}

const SOUND_EFFECTS: SoundEffect[] = [
  { id: 'airhorn', label: 'Air Horn', icon: <Megaphone className="w-4 h-4" />, frequency: 600, type: 'sawtooth', duration: 800 },
  { id: 'applause', label: 'Applause', icon: <PartyPopper className="w-4 h-4" />, frequency: 0, type: 'sawtooth', duration: 2000 },
  { id: 'drumroll', label: 'Drum Roll', icon: <Drum className="w-4 h-4" />, frequency: 150, type: 'triangle', duration: 1500 },
  { id: 'buzzer', label: 'Buzzer', icon: <AlertTriangle className="w-4 h-4" />, frequency: 200, type: 'square', duration: 500 },
  { id: 'ding', label: 'Ding', icon: <ThumbsUp className="w-4 h-4" />, frequency: 880, type: 'sine', duration: 300 },
  { id: 'boo', label: 'Boo', icon: <ThumbsDown className="w-4 h-4" />, frequency: 100, type: 'sawtooth', duration: 600 },
  { id: 'cricket', label: 'Crickets', icon: <Bug className="w-4 h-4" />, frequency: 4000, type: 'sine', duration: 2000 },
  { id: 'countdown', label: 'Countdown', icon: <Timer className="w-4 h-4" />, frequency: 440, type: 'sine', duration: 3000 },
];

interface StageSoundboardProps {
  isVisible: boolean;
  onClose: () => void;
}

export function StageSoundboard({ isVisible, onClose }: StageSoundboardProps) {
  const [volume, setVolume] = useState(70);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const playApplause = useCallback((ctx: AudioContext, gainNode: GainNode, duration: number) => {
    // White noise burst that sounds like applause
    const bufferSize = ctx.sampleRate * (duration / 1000);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      const envelope = Math.min(1, i / (ctx.sampleRate * 0.1)) * 
                       Math.min(1, (bufferSize - i) / (ctx.sampleRate * 0.3));
      data[i] = (Math.random() * 2 - 1) * envelope * 0.5;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    
    // Band-pass filter for more realistic sound
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000;
    filter.Q.value = 0.5;
    
    source.connect(filter);
    filter.connect(gainNode);
    source.start();
    
    return source;
  }, []);

  const playCrickets = useCallback((ctx: AudioContext, gainNode: GainNode, duration: number) => {
    const endTime = ctx.currentTime + duration / 1000;
    const oscillators: OscillatorNode[] = [];
    
    // Multiple chirps
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
      
      // Repeat pattern
      const repeatStart = startOffset + 0.15;
      chirpGain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + repeatStart);
      chirpGain.gain.linearRampToValueAtTime(0, ctx.currentTime + repeatStart + chirpDuration);
      
      osc.connect(chirpGain);
      chirpGain.connect(gainNode);
      osc.start(ctx.currentTime);
      osc.stop(endTime);
      oscillators.push(osc);
    }
    
    return oscillators;
  }, []);

  const playCountdown = useCallback((ctx: AudioContext, gainNode: GainNode) => {
    const oscillators: OscillatorNode[] = [];
    
    // 3 beeps + 1 higher beep
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
      oscillators.push(osc);
    });
    
    return oscillators;
  }, []);

  const playSound = useCallback((effect: SoundEffect) => {
    if (playingId) return; // Prevent overlapping

    const ctx = getAudioContext();
    const gainNode = ctx.createGain();
    gainNode.gain.value = volume / 100;
    gainNode.connect(ctx.destination);

    setPlayingId(effect.id);

    if (effect.id === 'applause') {
      playApplause(ctx, gainNode, effect.duration);
    } else if (effect.id === 'cricket') {
      playCrickets(ctx, gainNode, effect.duration);
    } else if (effect.id === 'countdown') {
      playCountdown(ctx, gainNode);
    } else {
      // Standard oscillator-based sounds
      const osc = ctx.createOscillator();
      osc.type = effect.type;
      osc.frequency.value = effect.frequency;

      const envGain = ctx.createGain();
      envGain.gain.setValueAtTime(0, ctx.currentTime);
      envGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.02);

      if (effect.id === 'airhorn') {
        // Slide up for airhorn effect
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(700, ctx.currentTime + 0.1);
        envGain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + effect.duration / 1000);
      } else if (effect.id === 'drumroll') {
        // Rapid amplitude modulation
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

    timeoutRef.current = setTimeout(() => {
      setPlayingId(null);
    }, effect.duration);
  }, [playingId, volume, getAudioContext, playApplause, playCrickets, playCountdown]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
      }
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
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose}
          className="w-6 h-6 text-white/50 hover:text-white hover:bg-white/10 rounded-lg"
        >
          <X className="w-3 h-3" />
        </Button>
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

      {/* Sound Buttons Grid */}
      <div className="grid grid-cols-4 gap-2">
        {SOUND_EFFECTS.map((effect) => (
          <button
            key={effect.id}
            onClick={() => playSound(effect)}
            disabled={playingId !== null && playingId !== effect.id}
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
    </div>
  );
}
