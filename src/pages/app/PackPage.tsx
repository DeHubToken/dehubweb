import { useSurfaceDraft } from '@/hooks/use-surface-draft';
/**
 * One pack — /packs/:slug
 *
 * The share link for a pack, like Telegram's addstickers links: anyone can
 * look, anyone signed in can add it to their picker. The owner also edits it
 * here — upload or paste items, remove them, rename, delete. Item caps come
 * from the owner's badge tier and are enforced by the creator-packs function.
 */

import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Link2, Loader2, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { DeHubPageLoader } from '@/components/app/DeHubLoader';
import { useAuth } from '@/contexts/AuthContext';
import {
  PACK_UPLOAD_TYPES,
  addPackItems,
  deletePack,
  fetchPackBySlug,
  packKeys,
  removePackItem,
  renamePack,
  savePack,
  unsavePack,
  uploadPackImage,
  useInvalidatePacks,
  usePackItems,
  usePackStatus,
  useSavedPacks,
  type NewPackItem,
  type PackKind,
} from '@/lib/creator-packs/api';
import { normaliseShortcode, parseEmojiSource, probeImage } from '@/lib/emoji/custom-emoji-import';
import { PackCover } from '@/components/app/packs/PackPickerParts';
import { packErrorMessage } from '@/components/app/packs/PackGate';
import { IslandAction, PageBody, PageEmpty, PageIsland } from '@/components/app/page-kit/PageKit';

const KIND_LABEL: Record<PackKind, string> = {
  emoji: 'creatorPacks.kind.emoji',
  sticker: 'creatorPacks.kind.sticker',
  gif: 'creatorPacks.kind.gif',
};

function shortAddress(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function PackPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { walletAddress, isAuthenticated, openLoginModal } = useAuth();
  const invalidate = useInvalidatePacks();

  const { data: pack, isLoading } = useQuery({
    queryKey: packKeys.slug(slug),
    queryFn: () => fetchPackBySlug(slug),
    enabled: !!slug,
  });
  const items = usePackItems(pack ? [pack] : undefined);
  const saved = useSavedPacks(walletAddress);
  const isOwner = !!pack && !!walletAddress && pack.owner === walletAddress.toLowerCase();
  const status = usePackStatus(isOwner ? walletAddress : null);
  const isSaved = !!pack && (saved.data ?? []).some((p) => p.id === pack.id);

  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [link, setLink] = useSurfaceDraft("pages/app/PackPage.tsx:link", '');
  const [label, setLabel] = useSurfaceDraft("pages/app/PackPage.tsx:label", '');
  const fileRef = useRef<HTMLInputElement>(null);

  if (isLoading) return <DeHubPageLoader />;
  if (!pack) {
    return (
      <div className="min-h-screen">
        <SEOHead title={t('creatorPacks.notFound')} noindex />
        <PageIsland className="max-w-2xl mx-auto" back onBack={() => navigate('/packs')} title={t('creatorPacks.title')} />
        <PageBody measure className="mx-auto">
          <PageEmpty
            title={t('creatorPacks.notFound')}
            action={
              <Link to="/packs" data-kit-button="quiet">{t('creatorPacks.browse')}</Link>
            }
          />
        </PageBody>
      </div>
    );
  }

  const list = items.data?.[pack.id] ?? [];
  const cap = status.data?.limits.items[pack.kind];
  const room = cap === undefined ? Infinity : Math.max(0, cap - list.length);
  const shareUrl = `https://dehub.io/packs/${pack.slug}`;
  const kindLabel = t(KIND_LABEL[pack.kind]);
  const description = t('creatorPacks.seoPackDescription', { name: pack.name, kind: kindLabel, count: pack.item_count });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error('[creator-packs]', err);
      toast.error(packErrorMessage(err, t, pack.kind));
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    await invalidate();
  };

  const toggleSave = () => {
    if (!walletAddress) return openLoginModal();
    return run(async () => {
      if (isSaved) {
        await unsavePack(walletAddress, pack.id);
        toast.success(t('creatorPacks.removedFromPicker'));
      } else {
        await savePack(walletAddress, pack.id);
        toast.success(t('creatorPacks.addedToPicker'));
      }
      await refresh();
    });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(t('creatorPacks.linkCopied'));
    } catch {
      toast.error(t('creatorPacks.errors.generic'));
    }
  };

  const nameFor = (raw: string, i: number) =>
    normaliseShortcode(label && i === 0 ? label : raw) || `${normaliseShortcode(pack.name) || 'emoji'}_${list.length + i + 1}`;

  const submit = (entries: NewPackItem[]) =>
    run(async () => {
      const { added, skipped } = await addPackItems(pack.id, entries);
      await refresh();
      toast.success(t('creatorPacks.itemsAdded', { count: added, skipped }));
      setLink('');
      setLabel('');
    });

  const onFiles = (files: FileList | null) => {
    if (!files?.length || !walletAddress) return;
    const chosen = Array.from(files).slice(0, Math.min(room, 50));
    void run(async () => {
      const entries: NewPackItem[] = [];
      for (const [i, f] of chosen.entries()) {
        const imageUrl = await uploadPackImage(f, walletAddress, pack.kind);
        entries.push({
          imageUrl,
          animated: f.type === 'image/gif',
          shortcode: pack.kind === 'emoji' ? nameFor(f.name.replace(/\.\w+$/, ''), i) : undefined,
          emoji: pack.kind === 'sticker' ? label.trim() || undefined : undefined,
        });
      }
      const { added, skipped } = await addPackItems(pack.id, entries);
      await refresh();
      toast.success(t('creatorPacks.itemsAdded', { count: added, skipped }));
      setLabel('');
    });
  };

  const onLink = async () => {
    const parsed = parseEmojiSource(link);
    if (!parsed) return toast.error(t('emojiPicker.errors.badImage'));
    if (!(await probeImage(parsed.imageUrl))) return toast.error(t('emojiPicker.errors.badImage'));
    await submit([
      {
        imageUrl: parsed.imageUrl,
        animated: parsed.animated,
        shortcode: pack.kind === 'emoji' ? nameFor(parsed.name ?? '', 0) : undefined,
        emoji: pack.kind === 'sticker' ? label.trim() || undefined : undefined,
      },
    ]);
  };

  const input =
    'h-9 px-2 rounded-md bg-white/5 border border-white/10 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-white/30';

  return (
    <div className="min-h-screen">
      <SEOHead
        title={`${pack.name} — ${kindLabel} — DeHub`}
        description={description}
        image={pack.cover_url ?? undefined}
        url={shareUrl}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'ImageGallery',
          name: pack.name,
          description,
          url: shareUrl,
          ...(pack.cover_url ? { image: pack.cover_url } : {}),
          numberOfItems: pack.item_count,
          dateCreated: pack.created_at,
        }}
      />
      <PageIsland
        className="max-w-2xl mx-auto"
        back
        onBack={() => navigate('/packs')}
        icon={
          <span className="block h-8 w-8 rounded-md bg-white/5 overflow-hidden p-0.5">
            <PackCover pack={pack} className="w-full h-full" />
          </span>
        }
        title={pack.name}
        subtitle={
          <>
            {kindLabel} · {t('creatorPacks.itemCount', { count: pack.item_count })} · {t('creatorPacks.saveCount', { count: pack.save_count })} · {t('creatorPacks.by', { owner: shortAddress(pack.owner) })}
          </>
        }
        actions={
          isOwner && editingName === null ? (
            <IslandAction label={t('creatorPacks.rename')} onClick={() => setEditingName(pack.name)}>
              <Pencil className="h-[18px] w-[18px]" />
            </IslandAction>
          ) : undefined
        }
      >
        {editingName !== null ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={editingName}
              onChange={(e) => setEditingName(e.target.value.slice(0, 64))}
              className={cn(input, 'flex-1 min-w-0')}
            />
            <button
              type="button"
              aria-label={t('creatorPacks.save')}
              disabled={busy || !editingName.trim()}
              onClick={() =>
                run(async () => {
                  await renamePack(pack.id, editingName.trim());
                  setEditingName(null);
                  await refresh();
                })
              }
              className="p-2 rounded-md hover:bg-white/10 text-white"
            >
              <Check className="w-4 h-4" />
            </button>
            <button type="button" aria-label={t('emojiPicker.back')} onClick={() => setEditingName(null)} className="p-2 rounded-md hover:bg-white/10 text-zinc-400">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : null}
      </PageIsland>

      <PageBody measure className="mx-auto">
      <div data-kit-section className="flex flex-wrap gap-2">
        {!isOwner && (
          <button
            type="button"
            disabled={busy}
            onClick={toggleSave}
            className={cn(
              'h-9 px-4 rounded-md text-sm font-medium disabled:opacity-40',
              isSaved ? 'border border-white/15 text-white' : 'bg-white text-black',
            )}
          >
            {isAuthenticated
              ? isSaved ? t('creatorPacks.removeFromPicker') : t('creatorPacks.addToPicker')
              : t('creatorPacks.signInToAdd')}
          </button>
        )}
        <button type="button" onClick={copyLink} className="h-9 px-3 rounded-md border border-white/15 text-sm text-white flex items-center gap-1.5">
          <Link2 className="w-4 h-4" />
          {t('creatorPacks.copyLink')}
        </button>
        {isOwner && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(t('creatorPacks.deleteConfirm', { name: pack.name }))) return;
              void run(async () => {
                await deletePack(pack.id);
                await refresh();
                navigate('/packs');
              });
            }}
            className="h-9 px-3 rounded-md border border-red-500/40 text-sm text-red-400 flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            {t('creatorPacks.deletePack')}
          </button>
        )}
      </div>

      {isOwner && (
        <div data-kit-section className="flex flex-col gap-2 border border-white/[0.12] bg-white/[0.03] p-3">
          <p className="text-sm font-medium text-white">
            {t('creatorPacks.addItems')}
            {cap !== undefined && <span className="text-zinc-500 font-normal"> · {list.length}/{cap}</span>}
          </p>
          {room === 0 ? (
            <p className="text-xs text-amber-400">{t('creatorPacks.errors.itemLimit')}</p>
          ) : (
            <>
              {pack.kind !== 'gif' && (
                <input
                  value={label}
                  onChange={(e) => setLabel(pack.kind === 'emoji' ? normaliseShortcode(e.target.value) : e.target.value.slice(0, 16))}
                  placeholder={t(pack.kind === 'emoji' ? 'creatorPacks.shortcodePlaceholder' : 'creatorPacks.stickerEmojiPlaceholder')}
                  className={input}
                />
              )}
              <div className="flex gap-2">
                <input
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder={t('creatorPacks.linkPlaceholder')}
                  className={cn(input, 'flex-1 min-w-0')}
                />
                <button
                  type="button"
                  disabled={busy || !link.trim()}
                  onClick={onLink}
                  aria-label={t('creatorPacks.addFromLink')}
                  className="h-9 px-3 rounded-md bg-white text-black text-sm disabled:opacity-40"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="h-9 rounded-md border border-white/15 text-sm text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {t('creatorPacks.uploadFiles')}
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={PACK_UPLOAD_TYPES.join(',')}
                className="hidden"
                onChange={(e) => {
                  onFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <p className="text-[11px] text-zinc-500 leading-snug">
                {t(pack.kind === 'gif' ? 'creatorPacks.uploadHintGif' : 'creatorPacks.uploadHint')}
              </p>
            </>
          )}
        </div>
      )}

      {items.isLoading ? (
        <Loader2 className="block w-5 h-5 animate-spin text-zinc-500 mx-auto" />
      ) : list.length ? (
        <div data-kit-section className={cn('grid gap-2', pack.kind === 'gif' ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-4 sm:grid-cols-6')}>
          {list.map((it) => (
            <div key={it.id} className="group relative flex flex-col items-center gap-1">
              <div className={cn('w-full rounded-lg bg-white/[0.04] overflow-hidden', pack.kind === 'gif' ? 'aspect-video' : 'aspect-square p-1.5')}>
                <img
                  src={it.image_url}
                  alt={it.shortcode ? `:${it.shortcode}:` : it.emoji ?? ''}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className={cn('w-full h-full', pack.kind === 'gif' ? 'object-cover' : 'object-contain')}
                />
              </div>
              {(it.shortcode || it.emoji) && (
                <span className="text-[10px] text-zinc-400 truncate max-w-full">{it.shortcode ? `:${it.shortcode}:` : it.emoji}</span>
              )}
              {isOwner && (
                <button
                  type="button"
                  aria-label={t('creatorPacks.removeItem')}
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await removePackItem(pack.id, it.id);
                      await refresh();
                    })
                  }
                  className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 focus:opacity-100"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p data-kit-section className="text-xs text-zinc-500 text-center py-6">{t('creatorPacks.packEmpty')}</p>
      )}
      </PageBody>
    </div>
  );
}
