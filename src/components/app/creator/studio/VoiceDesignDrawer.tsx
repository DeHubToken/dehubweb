/**
 * Voice design.
 * =============
 * Describe a voice in words, hear three takes, keep the one that is right.
 *
 * Not a generation job, which is why it lives here rather than going through
 * the queue: nothing is produced until a take is saved, the three previews are
 * disposable, and what it finally yields is a voice on the account rather than
 * a clip in the library. Putting it in the results feed would have filled the
 * grid with auditions nobody wanted to keep.
 *
 * The custom_voices row is written from here for the same reason
 * VoiceTrainingDrawer writes its own: that table is reached with the wallet
 * header from the browser, and the edge function has no wallet-scoped client.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Play, Sparkles, Square } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';
import { useCustomVoices } from '@/hooks/use-custom-voices';
import {
  designVoice,
  saveDesignedVoice,
  type DesignedVoicePreview,
} from '@/lib/creator/generationEngine';

/** The provider needs enough of a description to have something to work from. */
const MIN_DESCRIPTION_CHARS = 20;

interface VoiceDesignDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The composer's text box, which is the voice description in this mode. */
  description: string;
  onSaved: (voiceId: string) => void;
}

export function VoiceDesignDrawer({
  open,
  onOpenChange,
  description,
  onSaved,
}: VoiceDesignDrawerProps) {
  const [previews, setPreviews] = useState<DesignedVoicePreview[]>([]);
  const [designing, setDesigning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [name, setName] = useState('');
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { walletAddress } = useAuth();
  const { refetch } = useCustomVoices();

  /**
   * Previews are object URLs over decoded audio, so they leak until revoked.
   * Every run replaces the previous three, and closing throws them all away.
   */
  const releasePreviews = useCallback((list: DesignedVoicePreview[]) => {
    for (const p of list) {
      try {
        URL.revokeObjectURL(p.url);
      } catch {
        /* already revoked */
      }
    }
  }, []);

  useEffect(() => {
    if (open) return;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(null);
    setPreviews((current) => {
      releasePreviews(current);
      return [];
    });
    setSelected(null);
    setName('');
  }, [open, releasePreviews]);

  // Unmounting mid-audition must not leak the three blobs either.
  useEffect(
    () => () => {
      audioRef.current?.pause();
      releasePreviews(previews);
    },
    [previews, releasePreviews],
  );

  const run = useCallback(async () => {
    const trimmed = description.trim();
    if (trimmed.length < MIN_DESCRIPTION_CHARS) {
      toast.error(t('creator.voiceDescribeMin', { count: MIN_DESCRIPTION_CHARS }));
      return;
    }
    setDesigning(true);
    try {
      const next = await designVoice(trimmed);
      if (!next.length) throw new Error(t('creator.voiceNoneReturned'));
      setPreviews((current) => {
        releasePreviews(current);
        return next;
      });
      setSelected(next[0]?.generatedVoiceId ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('creator.voiceDesignFailed'));
    } finally {
      setDesigning(false);
    }
  }, [description, releasePreviews, t]);

  const play = useCallback(
    (preview: DesignedVoicePreview) => {
      audioRef.current?.pause();
      if (playing === preview.generatedVoiceId) {
        setPlaying(null);
        return;
      }
      const el = new Audio(preview.url);
      audioRef.current = el;
      el.onended = () => setPlaying(null);
      void el.play().catch(() => setPlaying(null));
      setPlaying(preview.generatedVoiceId);
    },
    [playing],
  );

  const save = useCallback(async () => {
    if (!selected) return;
    const trimmedName = name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 50) {
      toast.error(t('creator.voiceNameLength'));
      return;
    }
    if (!walletAddress) {
      toast.error(t('creator.voiceSignInToSave'));
      return;
    }
    setSaving(true);
    try {
      const saved = await saveDesignedVoice(selected, trimmedName, description.trim());

      // Keep the library row even if this insert fails — the voice exists on
      // the account either way, and losing the row is a listing problem, not a
      // reason to tell someone their voice was not created.
      // Address written exactly as VoiceTrainingDrawer writes it — un-normalised.
      // Lower-casing here would produce rows the existing listing does not
      // match, so a designed voice would vanish from a list that still shows
      // every cloned one.
      const { error } = await withWalletHeader(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase.from('custom_voices').insert({
          wallet_address: walletAddress,
          elevenlabs_voice_id: saved.voiceId,
          name: saved.name,
        } as any),
        walletAddress,
      );
      if (error) {
        console.error('[voice-design] could not record the voice locally', error);
        toast.warning(t('creator.voiceCreatedNotListed'));
      } else {
        toast.success(t('creator.voiceSaved', { name: saved.name }));
      }

      await refetch();
      onSaved(saved.voiceId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('creator.voiceSaveFailed'));
    } finally {
      setSaving(false);
    }
  }, [selected, name, walletAddress, description, refetch, onSaved, t]);

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next && saving) return;
        onOpenChange(next);
      }}
    >
      <DrawerContent column glass hideHandle={false} className="max-h-[85vh]">
        <DrawerHeader className="text-left pb-2">
          <DrawerTitle className="flex items-center gap-2 text-white">
            <Sparkles className="h-5 w-5 text-cyan-400" />
            {t('creator.designAVoice')}
          </DrawerTitle>
          <DrawerDescription className="text-zinc-400">
            {t('creator.designAVoiceHint')}
          </DrawerDescription>
        </DrawerHeader>

        <ScrollArea className="flex-1 overflow-y-auto px-4">
          <div className="space-y-3 pb-4">
            <div className="rounded-xl bg-zinc-800/50 p-3">
              <p className="text-xs font-medium text-zinc-400">{t('creator.yourDescription')}</p>
              <p className="mt-1 text-sm leading-relaxed text-white">
                {description.trim() || (
                  <span className="text-zinc-500">
                    {t('creator.typeDescriptionFirst')}
                  </span>
                )}
              </p>
            </div>

            {previews.map((preview, i) => {
              const active = selected === preview.generatedVoiceId;
              return (
                <button
                  key={preview.generatedVoiceId}
                  type="button"
                  onClick={() => setSelected(preview.generatedVoiceId)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl p-3 text-left transition',
                    active ? 'bg-zinc-700/70 ring-1 ring-white/25' : 'bg-zinc-800/50 hover:bg-zinc-800',
                  )}
                >
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={t(playing === preview.generatedVoiceId ? 'creator.stop' : 'creator.play')}
                    onClick={(e) => {
                      e.stopPropagation();
                      play(preview);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        play(preview);
                      }
                    }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                  >
                    {playing === preview.generatedVoiceId ? (
                      <Square className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">{t('creator.take', { number: i + 1 })}</p>
                    <p className="text-xs text-zinc-500">
                      {preview.durationSecs ? t('creator.seconds', { count: Math.round(preview.durationSecs) }) : t('creator.preview')}
                    </p>
                  </div>
                </button>
              );
            })}

            {!!previews.length && (
              <div>
                <label htmlFor="voice-design-name" className="text-xs font-medium text-zinc-400">
                  {t('creator.nameThisVoice')}
                </label>
                <Input
                  id="voice-design-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={50}
                  placeholder={t('creator.voiceNamePlaceholder')}
                  className="mt-1"
                />
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="grid gap-2 p-4 pt-2">
          <Button
            variant={previews.length ? 'outline' : 'default'}
            onClick={() => void run()}
            disabled={designing || saving}
          >
            {designing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('creator.designing')}
              </>
            ) : previews.length ? (
              t('creator.tryThreeMore')
            ) : (
              t('creator.designThreeVoices')
            )}
          </Button>

          {!!previews.length && (
            <Button onClick={() => void save()} disabled={!selected || saving || designing}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('creator.saving')}
                </>
              ) : (
                t('creator.saveAndUseVoice')
              )}
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
