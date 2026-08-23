/**
 * Share Entity Drawer
 * ===================
 * One share sheet for everything in DeHub: copy the link, send it in a DM, or
 * post it to the feed. Every route lands as a card rather than a URL, because
 * the link goes through the same resolver the surfaces read.
 *
 * Written because sharing had grown a different shape per surface. A post had
 * a full sheet with "send in a message"; an event had copy-link and post-to-feed
 * but no DM; a community had copy and post; a store or a shop item had no share
 * affordance at all — the only way to send somebody an item was to copy the
 * address bar. Anything that has a link now gets the same three actions.
 */

import { useState, Suspense, lazy, type ReactNode } from 'react';
import { Link2, MessageSquarePlus, Repeat2, Send, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useGlobalDropZone } from '@/hooks/use-global-drop-zone';
import { parseDehubLink, dehubLinkLabel } from '@/lib/dehub-links';

const ShareToDmModal = lazy(() =>
  import('@/components/app/modals/ShareToDmModal').then((m) => ({ default: m.ShareToDmModal }))
);

interface ShareEntityDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absolute URL of the thing being shared — build it with `dehubLinkFor`. */
  url: string;
  /** Title for the OS share sheet, when the device has one. */
  shareTitle?: string;
  /**
   * Category slug to pre-select in the composer, when the thing being shared
   * belongs to one (a community's own feed, for instance).
   */
  postCategory?: string;
  /**
   * One-tap repost: puts the thing into the poster's own feed with no composer.
   * Offered where a repost makes sense on its own — a stage link posted to the
   * feed renders as the full interactive card, so there is nothing to write.
   * Sits directly above "Share to feed", which is its quote-post counterpart:
   * same destination, but you add your words.
   */
  repost?: {
    detail?: string;
    onRepost: () => Promise<void> | void;
  };
}

function ShareAction({
  icon,
  label,
  detail,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-colors text-left"
    >
      <div className="p-2 rounded-xl bg-white/[0.06]">{icon}</div>
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-zinc-500">{detail}</p>
      </div>
    </button>
  );
}

export function ShareEntityDrawer({
  open,
  onOpenChange,
  url,
  shareTitle,
  postCategory,
  repost,
}: ShareEntityDrawerProps) {
  const { openPostModal } = useGlobalDropZone();
  const [dmOpen, setDmOpen] = useState(false);
  const [reposting, setReposting] = useState(false);

  const link = parseDehubLink(url);
  const noun = link ? dehubLinkLabel(link.kind) : 'link';

  // navigator.share is the right primitive on a phone and absent on most
  // desktops; offered as an extra rather than as a replacement, so the explicit
  // in-app routes stay reachable everywhere.
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    toast.success('Link copied');
    onOpenChange(false);
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title: shareTitle, url });
      onOpenChange(false);
    } catch {
      // Dismissing the OS sheet rejects; nothing to report.
    }
  };

  const handleRepost = async () => {
    if (!repost || reposting) return;
    setReposting(true);
    try {
      await repost.onRepost();
      onOpenChange(false);
    } finally {
      setReposting(false);
    }
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent glass className="max-h-[60vh]" data-no-navigate>
          <DrawerHeader className="sr-only">
            <DrawerTitle>Share</DrawerTitle>
          </DrawerHeader>
          <div className="p-4 space-y-2">
            <ShareAction
              icon={<Link2 className="w-5 h-5 text-zinc-300" />}
              label="Copy link"
              detail={`Copy the ${noun} link to your clipboard`}
              onClick={handleCopy}
            />
            <ShareAction
              icon={<Send className="w-5 h-5 text-zinc-300" />}
              label="Send in a message"
              detail="Share it directly with someone"
              onClick={() => {
                onOpenChange(false);
                // The sheet animates out first; opening both at once leaves the
                // outgoing drawer's scrim over the new one.
                setTimeout(() => setDmOpen(true), 250);
              }}
            />
            {repost && (
              <ShareAction
                icon={<Repeat2 className={reposting ? 'w-5 h-5 text-zinc-300 animate-pulse' : 'w-5 h-5 text-zinc-300'} />}
                label="Repost"
                detail={repost.detail ?? 'Send it to your followers as-is'}
                onClick={handleRepost}
              />
            )}
            <ShareAction
              icon={<MessageSquarePlus className="w-5 h-5 text-zinc-300" />}
              label="Share to feed"
              detail="Write a post with it attached"
              onClick={() => {
                onOpenChange(false);
                setTimeout(() => openPostModal(url, postCategory), 250);
              }}
            />
            {canNativeShare && (
              <ShareAction
                icon={<Share2 className="w-5 h-5 text-zinc-300" />}
                label="Share elsewhere"
                detail="Open your device's share sheet"
                onClick={handleNativeShare}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {dmOpen && (
        <Suspense fallback={null}>
          <ShareToDmModal open={dmOpen} onOpenChange={setDmOpen} url={url} />
        </Suspense>
      )}
    </>
  );
}
