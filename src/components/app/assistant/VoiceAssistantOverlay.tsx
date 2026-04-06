/**
 * Voice Assistant Overlay
 * =======================
 * Visual indicator for active voice mode — shows status, waveform animation, and controls.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Loader2, Volume2, X } from 'lucide-react';
import type { VoiceStatus } from '@/hooks/use-voice-assistant';

interface VoiceAssistantOverlayProps {
  isActive: boolean;
  status: VoiceStatus;
  recordingDuration: number;
  onStop: () => void;
  onStopSpeaking: () => void;
  remainingCredits?: number;
}

const STATUS_LABELS: Record<VoiceStatus, string> = {
  idle: '',
  listening: 'Listening...',
  transcribing: 'Transcribing...',
  thinking: 'Thinking...',
  speaking: 'Speaking...',
  error: 'Error',
};

function PulsingWaveform({ status }: { status: VoiceStatus }) {
  const isListening = status === 'listening';
  const isSpeaking = status === 'speaking';
  const barCount = 5;

  return (
    <div className="flex items-center gap-1 h-8">
      {Array.from({ length: barCount }).map((_, i) => (
        <motion.div
          key={i}
          className={`w-1 rounded-full ${
            isListening ? 'bg-red-400' : isSpeaking ? 'bg-cyan-400' : 'bg-white/30'
          }`}
          animate={
            isListening || isSpeaking
              ? {
                  height: [8, 24 + Math.random() * 8, 8],
                }
              : { height: 8 }
          }
          transition={
            isListening || isSpeaking
              ? {
                  duration: 0.4 + Math.random() * 0.3,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: i * 0.08,
                }
              : { duration: 0.3 }
          }
        />
      ))}
    </div>
  );
}

export function VoiceAssistantOverlay({
  isActive,
  status,
  recordingDuration,
  onStop,
  onStopSpeaking,
  remainingCredits,
}: VoiceAssistantOverlayProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-24 md:bottom-28 lg:bottom-20 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-gradient-to-br from-white/15 via-white/10 to-white/5 backdrop-blur-2xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
            {/* Status indicator */}
            <div className="flex items-center gap-2">
              {status === 'listening' && (
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              )}
              {(status === 'transcribing' || status === 'thinking') && (
                <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
              )}
              {status === 'speaking' && (
                <Volume2 className="w-4 h-4 text-cyan-400 animate-pulse" />
              )}
            </div>

            {/* Waveform */}
            <PulsingWaveform status={status} />

            {/* Status label + duration */}
            <div className="flex flex-col items-start min-w-[80px]">
              <span className="text-xs text-white/80 font-medium">
                {STATUS_LABELS[status] || 'Voice Mode'}
              </span>
              {status === 'listening' && recordingDuration > 0 && (
                <span className="text-[10px] text-white/40 tabular-nums">
                  {formatDuration(recordingDuration)}
                </span>
              )}
            </div>

            {/* Stop speaking button */}
            {status === 'speaking' && (
              <button
                onClick={onStopSpeaking}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                <MicOff className="w-4 h-4 text-white/70" />
              </button>
            )}

            {/* Close voice mode */}
            <button
              onClick={onStop}
              className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 transition-colors"
            >
              <X className="w-4 h-4 text-red-400" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
