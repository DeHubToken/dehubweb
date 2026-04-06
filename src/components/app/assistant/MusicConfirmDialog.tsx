/**
 * MusicConfirmDialog
 * ==================
 * Pre-generation confirm for music requests.
 * Auto-detects title, lyrics, style, voice gender from the user prompt.
 * Lets user review/edit before confirming.
 * Includes AI lyrics generation via Lovable AI.
 */

import { useState, useEffect, useCallback } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface MusicParams {
  title: string;
  lyrics: string;
  style: string;
  voiceGender: 'male' | 'female' | 'auto';
}

interface MusicConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userPrompt: string;
  onConfirm: (params: MusicParams) => void;
}

// ─── Smart auto-detection from user prompt ───

function extractTitle(prompt: string): string {
  const titleMatch = prompt.match(/(?:called|titled|named)\s+["']?([^"'\n,.]+)["']?/i);
  if (titleMatch) return titleMatch[1].trim();
  const labelMatch = prompt.match(/title\s*[:\-]\s*["']?([^"'\n,.]+)["']?/i);
  if (labelMatch) return labelMatch[1].trim();
  return '';
}

function extractLyrics(prompt: string): string {
  const lyricsMatch = prompt.match(/(?:lyrics?\s*(?:are|is)?\s*[:\-]\s*)([\s\S]+)/i);
  if (lyricsMatch) return lyricsMatch[1].trim();
  const quotedMatch = prompt.match(/"([^"]{20,})"/);
  if (quotedMatch) return quotedMatch[1].trim();
  return '';
}

function extractStyle(prompt: string): string {
  const styleMatch = prompt.match(/(?:style|genre|vibe|mood)\s*[:\-]\s*["']?([^"'\n,.]+)["']?/i);
  if (styleMatch) return styleMatch[1].trim();
  const genres = ['pop', 'rock', 'hip hop', 'hip-hop', 'rap', 'jazz', 'classical', 'r&b', 'country', 'electronic', 'edm', 'lo-fi', 'lofi', 'reggae', 'metal', 'punk', 'soul', 'funk', 'blues', 'indie', 'folk', 'trap', 'drill', 'afrobeat', 'latin', 'k-pop', 'anime', 'ambient', 'chill', 'upbeat', 'sad', 'romantic', 'dark', 'energetic', 'acoustic', 'synthwave', 'house', 'techno'];
  const lower = prompt.toLowerCase();
  const found = genres.filter(g => lower.includes(g));
  if (found.length > 0) return found.join(', ');
  return '';
}

function detectVoiceGender(prompt: string): 'male' | 'female' | 'auto' {
  const lower = prompt.toLowerCase();
  if (/\b(female|woman|girl|soprano|alto)\b/.test(lower)) return 'female';
  if (/\b(male|man|boy|baritone|tenor|bass)\b/.test(lower)) return 'male';
  return 'auto';
}

export function MusicConfirmDialog({ open, onOpenChange, userPrompt, onConfirm }: MusicConfirmDialogProps) {
  const [title, setTitle] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [style, setStyle] = useState('');
  const [voiceGender, setVoiceGender] = useState<'male' | 'female' | 'auto'>('auto');
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);

  useEffect(() => {
    if (!open || !userPrompt) return;
    setTitle(extractTitle(userPrompt));
    setLyrics(extractLyrics(userPrompt));
    setStyle(extractStyle(userPrompt));
    setVoiceGender(detectVoiceGender(userPrompt));
  }, [open, userPrompt]);

  const handleConfirm = useCallback(() => {
    onConfirm({ title, lyrics, style, voiceGender });
  }, [title, lyrics, style, voiceGender, onConfirm]);

  const handleGenerateLyrics = useCallback(async () => {
    setIsGeneratingLyrics(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-lyrics', {
        body: {
          title,
          style,
          voiceGender,
          existingLyrics: lyrics,
          userPrompt,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.lyrics) {
        setLyrics(data.lyrics);
        toast.success('Lyrics generated!');
      }
    } catch (err: any) {
      console.error('Lyrics generation error:', err);
      toast.error(err?.message || 'Failed to generate lyrics');
    } finally {
      setIsGeneratingLyrics(false);
    }
  }, [title, style, voiceGender, lyrics, userPrompt]);

  const genderOptions: { value: 'male' | 'female' | 'auto'; label: string; emoji: string }[] = [
    { value: 'auto', label: 'Auto', emoji: '🎤' },
    { value: 'male', label: 'Male', emoji: '🧑' },
    { value: 'female', label: 'Female', emoji: '👩' },
  ];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass className="border-t border-white/10">
        <DrawerHeader className="border-b border-white/10 pb-3">
          <DrawerTitle className="text-white flex items-center gap-2 text-base">
            🎵 Create a Song
          </DrawerTitle>
          <p className="text-white/40 text-xs mt-1">Review and customize before generating</p>
        </DrawerHeader>

        <div className="p-4 space-y-4 max-h-[65vh] overflow-y-auto">
          {/* Song Title */}
          <div>
            <label className="text-xs font-medium text-white/60 mb-1.5 block">Song Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Leave blank for AI to decide"
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors"
            />
          </div>

          {/* Song Style */}
          <div>
            <label className="text-xs font-medium text-white/60 mb-1.5 block">Style / Genre</label>
            <input
              type="text"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="e.g. upbeat pop, chill lo-fi, dark trap"
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors"
            />
          </div>

          {/* Voice Gender */}
          <div>
            <label className="text-xs font-medium text-white/60 mb-1.5 block">Voice</label>
            <div className="flex gap-2">
              {genderOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setVoiceGender(opt.value)}
                  className={cn(
                    'flex-1 py-2 px-3 rounded-xl text-xs font-medium border transition-colors',
                    voiceGender === opt.value
                      ? 'border-white/30 bg-white/10 text-white'
                      : 'border-white/5 bg-white/[0.02] text-white/40 hover:text-white/60 hover:bg-white/5'
                  )}
                >
                  {opt.emoji} {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lyrics */}
          <div>
            <label className="text-xs font-medium text-white/60 mb-1.5 block">
              Lyrics <span className="text-white/25">(optional — AI writes if blank)</span>
            </label>
            <div className="relative">
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder={"[verse]\nYour lyrics here...\n\n[chorus]\nChorus lyrics..."}
                rows={5}
                className="w-full px-3 py-2.5 pb-10 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors resize-none"
              />
              <button
                onClick={handleGenerateLyrics}
                disabled={isGeneratingLyrics}
                className={cn(
                  'absolute bottom-[11px] right-2 px-3 py-1 rounded-lg text-[11px] font-semibold border transition-all',
                  'absolute bottom-2 right-2 px-3 py-1 rounded-lg text-[11px] font-semibold border transition-all',
                  isGeneratingLyrics
                    ? 'border-white/10 bg-white/5 text-white/30 cursor-not-allowed'
                    : 'border-white/20 bg-white/10 text-white hover:bg-white/15 hover:border-white/30 active:scale-95'
                )}
              >
                {isGeneratingLyrics ? (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
                    Writing...
                  </span>
                ) : (
                  '✨ Enhance Lyrics'
                )}
              </button>
            </div>
          </div>

        </div>

        {/* Actions */}
        <div className="p-4 pt-2 flex gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-white/60 hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <LiquidGlassBubble2
            label="Continue to Payment"
            onClick={handleConfirm}
            width="auto"
            height="40px"
            className="flex-1 [&>div]:!py-2 [&>div]:!px-4 [&_span]:!text-sm [&_span]:!font-semibold"
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
