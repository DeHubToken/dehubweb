import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
/**
 * MusicConfirmDialog
 * ==================
 * Pre-generation confirm for music requests.
 * Auto-detects title, lyrics, style, voice gender from the user prompt.
 * Lets user review/edit before confirming.
 * Includes AI lyrics generation via the AI gateway.
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
  const { t: _copy } = _useCopy();
  const [title, setTitle] = useSurfaceDraft("components/app/assistant/MusicConfirmDialog.tsx:title", '');
  const [lyrics, setLyrics] = useSurfaceDraft("components/app/assistant/MusicConfirmDialog.tsx:lyrics", '');
  const [style, setStyle] = useSurfaceDraft("components/app/assistant/MusicConfirmDialog.tsx:style", '');
  const [voiceGender, setVoiceGender] = useState<'male' | 'female' | 'auto'>('auto');
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);

  useEffect(() => {
    if (!open || !userPrompt) return;
    setTitle.initialize(extractTitle(userPrompt));
    setLyrics.initialize(extractLyrics(userPrompt));
    setStyle.initialize(extractStyle(userPrompt));
    setVoiceGender(detectVoiceGender(userPrompt));
  }, [open, userPrompt, setLyrics, setStyle, setTitle]);

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
        toast.success(_copy("copy.ae55fa4ea56b", { defaultValue: "Lyrics generated!" }));
      }
    } catch (err: any) {
      console.error('Lyrics generation error:', err);
      toast.error(err?.message || 'Failed to generate lyrics');
    } finally {
      setIsGeneratingLyrics(false);
    }
  }, [title, style, voiceGender, lyrics, userPrompt, setLyrics, _copy]);

  const genderOptions: { value: 'male' | 'female' | 'auto'; label: string; emoji: string }[] = [
    { value: 'auto', label: _copy("copy.0286249762f7", { defaultValue: "Auto" }), emoji: '🎤' },
    { value: 'male', label: _copy("copy.03f8c1273e3d", { defaultValue: "Male" }), emoji: '🧑' },
    { value: 'female', label: _copy("copy.e8cca808ae5a", { defaultValue: "Female" }), emoji: '👩' },
  ];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass className="border-t border-white/10">
        <DrawerHeader className="border-b border-white/10 pb-3">
          <DrawerTitle className="text-white flex items-center gap-2 text-base">{_copy("copy.c9f2f9f8a5ab", { defaultValue: "🎵 Create a Song" })}</DrawerTitle>
          <p className="text-white/40 text-xs mt-1">{_copy("copy.3f41cd7ad606", { defaultValue: "Review and customize before generating" })}</p>
        </DrawerHeader>

        <div className="p-4 space-y-4 max-h-[65vh] overflow-y-auto">
          {/* Song Title */}
          <div>
            <label className="text-xs font-medium text-white/60 mb-1.5 block">{_copy("copy.5184bc4beb07", { defaultValue: "Song Title" })}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={_copy("copy.e5b06b1da4c0", { defaultValue: "Leave blank for AI to decide" })}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors"
            />
          </div>

          {/* Song Style */}
          <div>
            <label className="text-xs font-medium text-white/60 mb-1.5 block">{_copy("copy.ae9f83d725f5", { defaultValue: "Style / Genre" })}</label>
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
            <label className="text-xs font-medium text-white/60 mb-1.5 block">{_copy("copy.87bf2bc08589", { defaultValue: "Voice" })}</label>
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
            <label className="text-xs font-medium text-white/60 mb-1.5 block">{_copy("copy.e9f96afd5448", { defaultValue: "Lyrics " })}<span className="text-white/25">{_copy("copy.37c4c0a62315", { defaultValue: "(optional — AI writes if blank)" })}</span>
            </label>
            <div className="relative">
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder={_copy("copy.431bc73eb60b", { defaultValue: "[verse]\nYour lyrics here...\n\n[chorus]\nChorus lyrics..." })}
                rows={5}
                className="w-full px-3 py-2.5 pb-10 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors resize-none"
              />
              <button
                onClick={handleGenerateLyrics}
                disabled={isGeneratingLyrics}
                className={cn(
                  'absolute bottom-[15.3px] right-2 px-3 py-1 rounded-lg text-[11px] font-semibold border transition-all',
                  
                  isGeneratingLyrics
                    ? 'border-white/10 bg-white/5 text-white/30 cursor-not-allowed'
                    : 'border-white/20 bg-white/10 text-white hover:bg-white/15 hover:border-white/30 active:scale-95'
                )}
              >
                {isGeneratingLyrics ? (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />{_copy("copy.8343b1273ba1", { defaultValue: "Writing..." })}</span>
                ) : (
                  _copy("copy.98b4adfad956", { defaultValue: "✨ Enhance Lyrics" })
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
          >{_copy("copy.19766ed6ccb2", { defaultValue: "Cancel" })}</button>
          <LiquidGlassBubble2
            label={_copy("copy.bac1555a01a0", { defaultValue: "Continue to Payment" })}
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
