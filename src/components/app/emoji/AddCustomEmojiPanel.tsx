/**
 * Add custom emoji, inside the picker.
 *
 * Two ways in:
 *   One emoji — upload an image, or paste anything that points at one: a
 *     Discord `<:name:id>`, a Discord/7TV/BTTV/FFZ link, or any image link
 *     (emoji.gg, Slackmojis, a Slack export). The name is prefilled from the
 *     source when it carries one.
 *   A pack — a Mastodon/Pleroma/Akkoma or Misskey instance, or any JSON emoji
 *     list; every name not already taken is added in one go.
 */

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  EMOJI_UPLOAD_TYPES,
  MAX_EMOJI_UPLOAD_BYTES,
  addCustomEmojis,
  checkShortcode,
  fetchEmojiPack,
  getCustomEmoji,
  normaliseShortcode,
  parseEmojiSource,
  probeImage,
  uploadEmojiImage,
  type EmojiSource,
} from '@/lib/emoji/custom-emoji-import';
import { loadShortcodes } from '@/lib/emoji/shortcodes';

const MAX_PACK = 500;
const PROBLEM_KEY = { invalid: 'invalid', standard: 'shortcodeStandard', taken: 'shortcodeTaken' } as const;

export function AddCustomEmojiPanel({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const [mode, setMode] = useState<'single' | 'pack'>('single');
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [source, setSource] = useState<EmojiSource | null>(null);
  const [name, setName] = useState('');
  const [pack, setPack] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onLink = (value: string) => {
    setLink(value);
    setFile(null);
    const parsed = parseEmojiSource(value);
    setSource(parsed);
    setPreview(parsed?.imageUrl ?? null);
    if (parsed?.name && !name) setName(normaliseShortcode(parsed.name));
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!EMOJI_UPLOAD_TYPES.includes(f.type)) return toast.error(t('emojiPicker.errors.fileType'));
    if (f.size > MAX_EMOJI_UPLOAD_BYTES) return toast.error(t('emojiPicker.errors.fileSize'));
    setFile(f);
    setLink('');
    setSource(null);
    setPreview(URL.createObjectURL(f));
    if (!name) setName(normaliseShortcode(f.name.replace(/\.\w+$/, '')));
  };

  const submitSingle = async () => {
    if (!walletAddress) return toast.error(t('emojiPicker.errors.signIn'));
    const code = normaliseShortcode(name);
    const problem = await checkShortcode(code);
    if (problem) return toast.error(t(`emojiPicker.errors.${PROBLEM_KEY[problem]}`, { name: `:${code}:` }));
    setBusy(true);
    try {
      let imageUrl: string;
      let animated: boolean;
      let src = 'upload';
      let externalId: string | undefined;
      if (file) {
        imageUrl = await uploadEmojiImage(file, walletAddress);
        animated = file.type === 'image/gif';
      } else if (source) {
        if (!(await probeImage(source.imageUrl))) {
          toast.error(t('emojiPicker.errors.badImage'));
          return;
        }
        ({ imageUrl, animated, source: src, externalId } = source);
      } else {
        return;
      }
      await addCustomEmojis([{ shortcode: code, imageUrl, animated, source: src, externalId }], walletAddress);
      toast.success(t('emojiPicker.addedName', { name: `:${code}:` }));
      onDone();
    } catch (err) {
      console.error('[custom-emoji] add failed', err);
      toast.error(t('emojiPicker.errors.addFailed'));
    } finally {
      setBusy(false);
    }
  };

  const submitPack = async () => {
    if (!walletAddress) return toast.error(t('emojiPicker.errors.signIn'));
    setBusy(true);
    try {
      const [items, idx] = await Promise.all([fetchEmojiPack(pack), loadShortcodes().catch(() => null)]);
      if (!items.length) {
        toast.error(t('emojiPicker.errors.packEmpty'));
        return;
      }
      const seen = new Set<string>();
      const fresh = items.filter((i) => {
        if (seen.has(i.shortcode) || getCustomEmoji(i.shortcode) || (idx && i.shortcode in idx)) return false;
        seen.add(i.shortcode);
        return true;
      }).slice(0, MAX_PACK);
      const source = /\/api\/emojis/.test(pack) ? 'misskey' : 'mastodon';
      let added = 0;
      // Batches, so one taken name (a race with someone else) only costs its batch.
      for (let i = 0; i < fresh.length; i += 50) {
        try {
          const rows = await addCustomEmojis(
            fresh.slice(i, i + 50).map((it) => ({ ...it, source })),
            walletAddress,
          );
          added += rows.length;
        } catch (err) {
          console.warn('[custom-emoji] pack batch failed', err);
        }
      }
      toast.success(t('emojiPicker.packAdded', { count: added, skipped: items.length - added }));
      if (added) onDone();
    } catch (err) {
      console.error('[custom-emoji] pack failed', err);
      toast.error(t('emojiPicker.errors.addFailed'));
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full h-8 px-2 rounded-md bg-white/5 border border-white/10 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-white/30';

  return (
    <div className="flex flex-col gap-2 p-1 text-xs text-zinc-300">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onDone} aria-label={t('emojiPicker.back')} className="p-1 rounded hover:bg-white/10">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex rounded-md bg-white/5 p-0.5">
          {(['single', 'pack'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn('px-2.5 py-1 rounded text-[11px]', mode === m ? 'bg-white/15 text-white' : 'text-zinc-400')}
            >
              {t(m === 'single' ? 'emojiPicker.modeSingle' : 'emojiPicker.modePack')}
            </button>
          ))}
        </div>
      </div>

      {mode === 'single' ? (
        <>
          <div className="flex items-center gap-2">
            <div className="w-12 h-12 flex-shrink-0 rounded-md bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
              {preview ? (
                <img src={preview} alt="" referrerPolicy="no-referrer" className="max-w-full max-h-full object-contain" />
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()} aria-label={t('emojiPicker.upload')}>
                  <Upload className="w-4 h-4 text-zinc-500" />
                </button>
              )}
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="h-8 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-[11px]"
              >
                {t('emojiPicker.upload')}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={EMOJI_UPLOAD_TYPES.join(',')}
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </div>
          </div>
          <input
            value={link}
            onChange={(e) => onLink(e.target.value)}
            placeholder={t('emojiPicker.linkPlaceholder')}
            className={input}
          />
          <div className="flex items-center gap-1">
            <span className="text-zinc-500">:</span>
            <input
              value={name}
              onChange={(e) => setName(normaliseShortcode(e.target.value))}
              placeholder={t('emojiPicker.namePlaceholder')}
              className={input}
            />
            <span className="text-zinc-500">:</span>
          </div>
          <p className="text-[10px] text-zinc-500 leading-snug">{t('emojiPicker.singleHint')}</p>
          <button
            type="button"
            disabled={busy || !name || (!file && !source)}
            onClick={submitSingle}
            className="h-8 rounded-md bg-white text-black font-medium disabled:opacity-40 flex items-center justify-center"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t('emojiPicker.add')}
          </button>
        </>
      ) : (
        <>
          <input
            value={pack}
            onChange={(e) => setPack(e.target.value)}
            placeholder={t('emojiPicker.packPlaceholder')}
            className={input}
          />
          <p className="text-[10px] text-zinc-500 leading-snug">{t('emojiPicker.packHint')}</p>
          <button
            type="button"
            disabled={busy || !pack.trim()}
            onClick={submitPack}
            className="h-8 rounded-md bg-white text-black font-medium disabled:opacity-40 flex items-center justify-center"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t('emojiPicker.importPack')}
          </button>
        </>
      )}
    </div>
  );
}
