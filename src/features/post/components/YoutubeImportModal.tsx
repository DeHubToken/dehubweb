import { useEffect, useRef, useState } from 'react';
import { Loader2, Youtube } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { importFromYoutube, getYoutubeImportStatus } from '@/lib/api/dehub/youtube-import';

interface YoutubeImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called once the import finishes publishing, so the caller can e.g. refresh a feed. */
  onImported?: (tokenId: string) => void;
}

const YOUTUBE_URL_RE = /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i;

export function YoutubeImportModal({ isOpen, onClose, onImported }: YoutubeImportModalProps) {
  const [url, setUrl] = useState('');
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [status, setStatus] = useState<'idle' | 'queued' | 'importing'>('idle');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const reset = () => {
    setUrl('');
    setOwnershipConfirmed(false);
    setStatus('idle');
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const handleClose = () => {
    if (status === 'importing') return; // let the import keep running in the background
    reset();
    onClose();
  };

  const pollStatus = (jobId: string | number) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await getYoutubeImportStatus(jobId);
        if (res.state === 'completed') {
          if (pollRef.current) clearInterval(pollRef.current);
          toast.success(
            res.result?.duplicate ? 'That video was already imported.' : 'Imported from YouTube!',
          );
          if (res.result?.createdTokenId) onImported?.(String(res.result.createdTokenId));
          reset();
          onClose();
        } else if (res.state === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current);
          toast.error(res.failedReason || 'Import failed');
          setStatus('idle');
        }
      } catch {
        // transient network hiccup — keep polling, the job is unaffected
      }
    }, 5000);
  };

  const handleSubmit = async () => {
    if (!YOUTUBE_URL_RE.test(url.trim())) {
      toast.error('Enter a valid youtube.com or youtu.be URL');
      return;
    }
    if (!ownershipConfirmed) {
      toast.error('Please confirm you have the rights to this content');
      return;
    }
    setStatus('queued');
    try {
      const { jobId } = await importFromYoutube({ url: url.trim(), ownershipConfirmed });
      setStatus('importing');
      toast.message('Import started — this can take a few minutes for longer videos.');
      pollStatus(jobId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the import');
      setStatus('idle');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Youtube className="w-5 h-5" />
            Import from YouTube
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Input
            placeholder="https://youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={status !== 'idle'}
          />

          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={ownershipConfirmed}
              onCheckedChange={(checked) => setOwnershipConfirmed(checked === true)}
              disabled={status !== 'idle'}
              className="mt-0.5"
            />
            <span>
              I own this content, or have the rights holder's permission to publish it on DeHub.
            </span>
          </label>

          {status === 'importing' && (
            <p className="text-xs text-muted-foreground">
              Downloading and publishing — you can close this and it'll keep going in the background.
            </p>
          )}

          <Button
            onClick={handleSubmit}
            disabled={status !== 'idle' || !url.trim() || !ownershipConfirmed}
            className="w-full"
          >
            {status !== 'idle' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {status === 'idle' ? 'Import' : status === 'queued' ? 'Starting…' : 'Importing…'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
