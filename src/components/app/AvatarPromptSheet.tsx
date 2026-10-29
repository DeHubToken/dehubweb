import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Camera from '@/components/ui/cut-icons/camera';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';

interface AvatarPromptSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Display name or username, for the letter tile and the greeting. */
  name: string;
  /** Uploads the picked picture. Rejects with the message to show. */
  onSave: (file: File, preview: string) => Promise<void>;
}

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Asks an account with no picture to add one: their letter tile with a camera
 * chip, a pick-a-photo button, and Not now. Picking shows the photo in the tile
 * before it is saved, so a wrong pick costs one more tap, not a trip to Settings.
 * Drawer on phone widths, dialog on desktop.
 */
export function AvatarPromptSheet({ open, onOpenChange, name, onSave }: AvatarPromptSheetProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => () => {
    if (preview?.startsWith('blob:')) {
      try { URL.revokeObjectURL(preview); } catch { /* noop */ }
    }
  }, [preview]);

  const letter = (name.trim()[0] || '?').toUpperCase();

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0];
    e.target.value = '';
    if (!next) return;
    if (next.size > MAX_BYTES) {
      toast.error(t('settings.imageTooLarge5'));
      return;
    }
    setFile(next);
    setPreview(URL.createObjectURL(next));
  };

  const save = async () => {
    if (!file || !preview) return;
    setSaving(true);
    try {
      await onSave(file, preview);
      // The preview now backs the avatar everywhere until the CDN copy loads.
      setPreview(null);
      setFile(null);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('avatarPrompt.failed', 'Could not save your photo. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  const title = t('avatarPrompt.title', 'Add a profile photo');
  const body = t('avatarPrompt.body', 'People spot you faster in feeds, comments and chats when you have a face or logo.');

  const content = (
    <div data-avatar-prompt className="flex flex-col items-center gap-5 px-5 pb-6 pt-2 text-center">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={pick} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label={t('avatarPrompt.choose', 'Choose a photo')}
        className="relative mt-2 h-24 w-24 rounded-full"
      >
        {preview ? (
          <img src={preview} alt="" className="h-24 w-24 rounded-full object-cover ring-1 ring-white/20" />
        ) : (
          <span data-avatar-fallback className="flex h-24 w-24 items-center justify-center rounded-full border border-white/15 bg-white/[0.08] text-4xl font-semibold text-white">
            {letter}
          </span>
        )}
        <span data-avatar-prompt-chip className="absolute -bottom-0.5 -right-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white backdrop-blur-xl">
          <Camera className="h-[18px] w-[18px]" />
        </span>
      </button>
      <p className="max-w-xs text-sm text-zinc-400">{body}</p>
      <div className="flex w-full flex-col gap-2">
        {file ? (
          <>
            <Button size="lg" className="w-full rounded-full" loading={saving} disabled={saving} onClick={() => void save()}>
              {t('avatarPrompt.save', 'Use this photo')}
            </Button>
            <Button variant="ghost" className="w-full rounded-full" disabled={saving} onClick={() => inputRef.current?.click()}>
              {t('avatarPrompt.another', 'Choose another')}
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" className="w-full rounded-full" onClick={() => inputRef.current?.click()}>
              <Camera />
              {t('avatarPrompt.choose', 'Choose a photo')}
            </Button>
            <Button variant="ghost" className="w-full rounded-full" onClick={() => onOpenChange(false)}>
              {t('avatarPrompt.notNow', 'Not now')}
            </Button>
          </>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
        <DrawerContent data-avatar-prompt-sheet glass>
          <DrawerTitle className="px-5 pt-5 text-center text-lg font-semibold text-white">{title}</DrawerTitle>
          <DrawerDescription className="sr-only">{body}</DrawerDescription>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent data-avatar-prompt-sheet className="max-w-sm border border-white/10 bg-black/40 shadow-2xl backdrop-blur-2xl">
        <DialogTitle className="pt-2 text-center text-lg font-semibold text-white">{title}</DialogTitle>
        <DialogDescription className="sr-only">{body}</DialogDescription>
        {content}
      </DialogContent>
    </Dialog>
  );
}

export default AvatarPromptSheet;
