/**
 * Creator Flow — make a flow public and copy its link.
 * ====================================================
 * Public means read-only: visitors pan and zoom, and can open a copy in
 * their own editor, but never edit or generate on the owner's flow.
 */
import { useEffect, useState } from 'react';
import { Check, Copy, Globe, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { flowShareUrl, publishFlow } from '@/lib/creator/flow/api';
import { useCreatorFlowStore } from '@/store/creatorFlowStore';

interface Props {
  flowId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whether the flow can be published right now (signed in and synced). */
  canPublish: boolean;
  onSyncNow: () => void | Promise<void>;
}

export default function ShareModal({ flowId, open, onOpenChange, canPublish, onSyncNow }: Props) {
  const { t } = useTranslation();
  const flow = useCreatorFlowStore((s) => s.flows.find((f) => f.id === flowId));
  const setFlowPublic = useCreatorFlowStore((s) => s.setFlowPublic);
  const isPublic = flow?.isPublic ?? false;
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = flowShareUrl(flowId);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  async function toggle() {
    setLoading(true);
    try {
      // The row must exist before it can be flipped public; a flow that has
      // only ever lived in localStorage is written first.
      await onSyncNow();
      const res = await publishFlow(flowId, !isPublic);
      setFlowPublic(flowId, res.isPublic);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('creatorFlow.shareFailed'));
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => toast.error(t('creatorFlow.copyFailed')));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border border-white/10 bg-zinc-950/90 text-white shadow-2xl backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle>{t('creatorFlow.shareTitle')}</DialogTitle>
          <DialogDescription className="text-zinc-400">{t('creatorFlow.shareDescription')}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5">
          <div className="flex items-center gap-3">
            {isPublic ? <Globe className="h-4 w-4 text-white" /> : <Lock className="h-4 w-4 text-zinc-400" />}
            <div>
              <p className="text-[13px] font-medium">{isPublic ? t('creatorFlow.public') : t('creatorFlow.private')}</p>
              <p className="text-[12px] text-zinc-400">{isPublic ? t('creatorFlow.publicHint') : t('creatorFlow.privateHint')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggle}
            disabled={loading || !canPublish}
            className="h-8 shrink-0 rounded-full border border-white/20 bg-white/10 px-3.5 text-[12px] font-medium backdrop-blur-xl transition hover:border-white/40 hover:bg-white/20 disabled:opacity-50"
          >
            {loading ? '…' : isPublic ? t('creatorFlow.makePrivate') : t('creatorFlow.makePublic')}
          </button>
        </div>

        {!canPublish && <p className="text-[12px] text-zinc-400">{t('creatorFlow.signInToShare')}</p>}

        {isPublic && (
          <div className="flex gap-2">
            <div className="flex-1 truncate rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[12px] text-zinc-300">{url}</div>
            <button
              type="button"
              onClick={copy}
              title={copied ? t('creatorFlow.copied') : t('creatorFlow.copyLink')}
              aria-label={copied ? t('creatorFlow.copied') : t('creatorFlow.copyLink')}
              className="flex w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
        )}

        <p className="text-[11px] text-zinc-500">{t('creatorFlow.shareFooter')}</p>
      </DialogContent>
    </Dialog>
  );
}
