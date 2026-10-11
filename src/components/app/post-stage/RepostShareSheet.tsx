import { useTranslation as _useCopy } from 'react-i18next';
/**
 * "Repost & share" — the sheet behind the repost tile of the phone post page.
 *
 * One button now does what the share sheet, the repost button and the
 * quotes / reposts tabs used to: two big tiles (Repost or Undo repost, and
 * Quote), a "Share to" row (copy link, X, Telegram, WhatsApp, the system
 * share sheet), then two rows that open the existing quotes list and the
 * reposters list. Those rows read the same queries the comments section's
 * lists use (`post-quotes`, `post-reposters`), so opening the list after the
 * sheet is a cache hit.
 */
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Link2, MoreHorizontal, Quote, Repeat2, Send, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { getPostQuotes, getPostReposters } from '@/lib/api/dehub';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';

interface RepostShareSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId?: string;
  isReposted: boolean;
  onRepost: () => void;
  onUndoRepost: () => void;
  onQuote: () => void;
  shareUrl: string;
  shareTitle?: string;
  onCopyLink: () => void;
  quoteCount: number;
  repostCount: number;
  onViewQuotes: () => void;
  onViewReposts: () => void;
}

interface Face {
  key: string;
  name: string;
  avatar?: string;
}

/** X's mark — lucide has no brand glyphs. */
function XGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
      <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.17h1.7L7.4 4.74H5.58l11.09 14.43Z" />
    </svg>
  );
}

function FaceStack({ faces }: { faces: Face[] }) {
  if (!faces.length) return null;
  return (
    <span className="flex -space-x-1.5" aria-hidden="true">
      {faces.slice(0, 3).map((f) => (
        <span key={f.key} data-stage-face className="flex h-[22px] w-[22px] items-center justify-center overflow-hidden rounded-md text-[10px] font-bold">
          {f.avatar ? <img src={f.avatar} alt="" className="h-full w-full object-cover" /> : f.name.charAt(0).toUpperCase()}
        </span>
      ))}
    </span>
  );
}

export function RepostShareSheet({
  open,
  onOpenChange,
  tokenId,
  isReposted,
  onRepost,
  onUndoRepost,
  onQuote,
  shareUrl,
  shareTitle,
  onCopyLink,
  quoteCount,
  repostCount,
  onViewQuotes,
  onViewReposts,
}: RepostShareSheetProps) {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const enabled = open && !!tokenId && /^\d+$/.test(tokenId);

  const { data: quotesData } = useQuery({
    queryKey: ['post-quotes', tokenId],
    queryFn: () => getPostQuotes(tokenId!),
    enabled,
    staleTime: 60000,
    retry: false,
  });
  const { data: repostersData } = useQuery({
    queryKey: ['post-reposters', tokenId],
    queryFn: () => getPostReposters(tokenId!),
    enabled,
    staleTime: 60000,
  });

  const quoteFaces: Face[] = (quotesData?.result ?? []).map((p) => {
    const name = p.minterDisplayName || p.minterUsername || p.minter || '?';
    return {
      key: String(p.tokenId),
      name,
      avatar: buildAvatarUrl(p.minter || '', extractAvatarPath(p) || extractAvatarPath(p.minterUser)) || undefined,
    };
  });
  const repostFaces: Face[] = (repostersData?.items ?? []).map((u) => {
    const name = u.displayName || u.username || u.address || '?';
    return { key: u.address, name, avatar: buildAvatarUrl(u.address, extractAvatarPath(u)) || undefined };
  });

  const encoded = encodeURIComponent(shareUrl);
  const text = encodeURIComponent(shareTitle || '');
  const openExternal = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    onOpenChange(false);
  };
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const nativeShare = async () => {
    if (!canNativeShare) {
      onCopyLink();
      return;
    }
    try {
      await navigator.share({ title: shareTitle, url: shareUrl });
      onOpenChange(false);
    } catch {
      // Dismissing the system sheet rejects; nothing to report.
    }
  };

  const targets = [
    { key: 'copy', label: t('postStage.copyLink', 'Copy link'), icon: <Link2 className="h-[18px] w-[18px]" />, onClick: onCopyLink },
    { key: 'x', label: 'X', icon: <XGlyph />, onClick: () => openExternal(`https://x.com/intent/post?url=${encoded}&text=${text}`) },
    { key: 'telegram', label: 'Telegram', icon: <Send className="h-[18px] w-[18px]" />, onClick: () => openExternal(`https://t.me/share/url?url=${encoded}&text=${text}`) },
    { key: 'whatsapp', label: _copy("copy.6a40edf1fc87", { defaultValue: "WhatsApp" }), icon: <MessageCircle className="h-[18px] w-[18px]" />, onClick: () => openExternal(`https://wa.me/?text=${text}${text ? '%20' : ''}${encoded}`) },
    { key: 'more', label: t('postStage.more', 'More'), icon: <MoreHorizontal className="h-[18px] w-[18px]" />, onClick: () => { void nativeShare(); } },
  ];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        scrollable
        column
        glass
        data-stage-sheet
        data-no-navigate
        className="px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
      >
        <DrawerHeader className="px-0 pb-2 pt-1 text-left">
          <DrawerTitle data-stage-ink className="text-left text-[17px] font-bold">
            {t('postStage.repostAndShare', 'Repost & share')}
          </DrawerTitle>
        </DrawerHeader>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            data-stage-sheet-tile={isReposted ? 'undo' : 'repost'}
            onClick={isReposted ? onUndoRepost : onRepost}
            className="flex flex-col items-start gap-0.5 rounded-xl px-3.5 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-[15px] font-bold">
              <Repeat2 className="h-5 w-5" />
              {isReposted ? t('postStage.undoRepost', 'Undo repost') : t('postStage.repost', 'Repost')}
            </span>
            <span data-stage-muted className="text-xs">
              {isReposted ? t('postStage.undoRepostHint', 'Take it off your profile') : t('postStage.repostHint', 'Instantly, to your followers')}
            </span>
          </button>
          <button
            type="button"
            data-stage-sheet-tile="quote"
            onClick={onQuote}
            className="flex flex-col items-start gap-0.5 rounded-xl px-3.5 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-[15px] font-bold">
              <Quote className="h-5 w-5" />
              {t('postStage.quote', 'Quote')}
            </span>
            <span data-stage-muted className="text-xs">{t('postStage.quoteHint', 'Add your own words')}</span>
          </button>
        </div>

        <p data-stage-muted className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wider">
          {t('postStage.shareTo', 'Share to')}
        </p>
        <div className="grid grid-cols-5 gap-1">
          {targets.map((tg) => (
            <button
              key={tg.key}
              type="button"
              data-stage-share-target={tg.key}
              onClick={tg.onClick}
              className="flex flex-col items-center gap-1.5"
            >
              <span data-stage-share-icon className="flex h-12 w-12 items-center justify-center rounded-xl">
                {tg.icon}
              </span>
              <span data-stage-muted className="text-[11px]">{tg.label}</span>
            </button>
          ))}
        </div>

        <div data-stage-sheet-list className="mt-4 overflow-hidden rounded-xl">
          <button
            type="button"
            data-stage-view="quotes"
            onClick={onViewQuotes}
            className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
          >
            <Quote className="h-5 w-5 shrink-0" />
            <span className="flex-1 text-[15px] font-semibold">{t('postStage.viewQuotes', 'View quotes')}</span>
            <FaceStack faces={quoteFaces} />
            <span data-stage-muted className="min-w-[1.5rem] text-right text-sm font-semibold tabular-nums">{quoteCount}</span>
            <ChevronRight data-stage-muted className="h-4 w-4 shrink-0" />
          </button>
          <button
            type="button"
            data-stage-view="reposts"
            onClick={onViewReposts}
            className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
          >
            <Repeat2 className="h-5 w-5 shrink-0" />
            <span className="flex-1 text-[15px] font-semibold">{t('postStage.viewReposts', 'View reposts')}</span>
            <FaceStack faces={repostFaces} />
            <span data-stage-muted className="min-w-[1.5rem] text-right text-sm font-semibold tabular-nums">{repostCount}</span>
            <ChevronRight data-stage-muted className="h-4 w-4 shrink-0" />
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
