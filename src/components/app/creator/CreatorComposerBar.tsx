/**
 * CreatorComposerBar
 * ==================
 * A floating bottom composer for /creator styled like the mobile bottom
 * nav — a horizontally scrollable row of quick-preset chips above a
 * single textarea with attach / voice-record / send controls. Submitting
 * routes to /app/assistant with the chosen preset and the typed prompt
 * pre-filled via the hash contract (see AssistantPage `applyPreset`).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  Clapperboard,
  ImageIcon,
  Megaphone,
  Mic,
  Music2,
  Paperclip,
  Send,
  Sparkles,
  Square,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Preset = 'chat' | 'image' | 'video' | 'song' | 'poster' | 'edit' | 'skills' | 'voice';

const PRESETS: Array<{ id: Preset; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'chat', label: 'Ask', icon: Bot },
  { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'video', label: 'Video', icon: Clapperboard },
  { id: 'song', label: 'Song', icon: Music2 },
  { id: 'poster', label: 'Poster', icon: Megaphone },
  { id: 'edit', label: 'Edit image', icon: Wand2 },
  { id: 'skills', label: 'Skills', icon: Sparkles },
];

// Web Speech API type helpers — keep loose to stay Safari-friendly.
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function CreatorComposerBar() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [activePreset, setActivePreset] = useState<Preset>('chat');
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const goToAssistant = useCallback(
    (preset: Preset, prompt: string) => {
      const trimmed = prompt.trim();
      const hash = trimmed
        ? `#preset=${preset}&prompt=${encodeURIComponent(trimmed)}`
        : `#preset=${preset}`;
      navigate(`/app/assistant${hash}`);
    },
    [navigate],
  );

  const handleSend = useCallback(() => {
    if (isRecording) stopRecording();
    goToAssistant(activePreset, input);
    setInput('');
  }, [activePreset, input, goToAssistant, isRecording]);

  const startRecording = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      toast.error('Voice input is not supported in this browser');
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = navigator.language || 'en-US';
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e: any) => {
        let text = '';
        for (let i = 0; i < e.results.length; i += 1) {
          text += e.results[i][0].transcript;
        }
        setInput(text);
      };
      rec.onerror = () => setIsRecording(false);
      rec.onend = () => setIsRecording(false);
      rec.start();
      recognitionRef.current = rec;
      setIsRecording(true);
    } catch {
      toast.error('Could not start voice input');
      setIsRecording(false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* noop */
    }
    setIsRecording(false);
  }, []);

  const handleAttach = useCallback((file: File) => {
    // For image edit, hand the file to AssistantPage via sessionStorage and
    // trigger the edit preset (which opens the file picker there); simplest
    // for now is to just route to the assistant with the edit preset and
    // let the user re-attach — Creator page has no upload backend of its
    // own. Keep the interaction predictable and cheap.
    void file;
    goToAssistant('edit', input);
  }, [goToAssistant, input]);

  return (
    <div className="pointer-events-none sticky bottom-0 z-40 mt-2 w-full px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] sm:px-4">
      <div
        className="pointer-events-auto mx-auto max-w-4xl rounded-2xl border border-white/10 bg-black/60 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-[24px]"
      >
        {/* Side-scrolling chip row (mirrors MobileBottomNav layout) */}
        <div className="flex items-center gap-2 overflow-x-auto px-3 pt-2 pb-2 scrollbar-hide [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PRESETS.map((p) => {
            const Icon = p.icon;
            const active = activePreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePreset(p.id)}
                className={cn(
                  'shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                  active
                    ? 'border-white/20 bg-white text-black'
                    : 'border-white/10 bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Composer row */}
        <div className="flex items-end gap-2 px-2 pb-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach image"
            className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/70 hover:bg-white/[0.08] hover:text-white"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleAttach(f);
              e.currentTarget.value = '';
            }}
          />

          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
            className={cn(
              'mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
              isRecording
                ? 'bg-white/10 text-white'
                : 'text-white/70 hover:bg-white/[0.08] hover:text-white',
            )}
          >
            {isRecording ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-4 w-4" />}
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            placeholder={
              isRecording
                ? 'Listening…'
                : activePreset === 'image'
                ? 'Describe the image to generate…'
                : activePreset === 'video'
                ? 'Describe the video to generate…'
                : activePreset === 'song'
                ? 'Describe the song…'
                : activePreset === 'poster'
                ? 'Describe the poster…'
                : activePreset === 'edit'
                ? 'Describe the edit, then attach an image…'
                : activePreset === 'skills'
                ? 'Search or run a skill…'
                : 'Ask DeHub AI anything…'
            }
            className="min-h-[36px] max-h-40 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none"
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() && !isRecording}
            aria-label="Send to assistant"
            className={cn(
              'mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
              input.trim() || isRecording
                ? 'bg-white text-black hover:brightness-95'
                : 'bg-white/[0.08] text-white/40',
            )}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
