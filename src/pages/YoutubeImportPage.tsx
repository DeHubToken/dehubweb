/**
 * dehub.io/yt-dlp — import a YouTube video as a DeHub post.
 * ==========================================================
 * Standalone page, not a composer add-on: pasting a URL and confirming
 * ownership is a different action from "make a post" and doesn't belong
 * cluttering the compose action bar.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Youtube } from 'lucide-react';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import dehubLogo from '@/assets/dehub-logo-white.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthPrompt } from '@/components/app/AuthPrompt';
import { importFromYoutube, getYoutubeImportStatus } from '@/lib/api/dehub/youtube-import';

const YOUTUBE_URL_RE = /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i;

export default function YoutubeImportPage() {
  const { isAuthenticated } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const [url, setUrl] = useState('');
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [status, setStatus] = useState<'idle' | 'queued' | 'importing'>('idle');
  const [tokenId, setTokenId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const pollStatus = (jobId: string | number) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await getYoutubeImportStatus(jobId);
        if (res.state === 'completed') {
          if (pollRef.current) clearInterval(pollRef.current);
          toast.success(
            res.result?.duplicate ? 'That video was already imported.' : 'Imported from YouTube!',
          );
          setTokenId(res.result?.createdTokenId ? String(res.result.createdTokenId) : null);
          setStatus('idle');
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

  const handleSubmit = () => {
    if (!YOUTUBE_URL_RE.test(url.trim())) {
      toast.error('Enter a valid youtube.com or youtu.be URL');
      return;
    }
    if (!ownershipConfirmed) {
      toast.error('Please confirm you have the rights to this content');
      return;
    }
    requireAuth(async () => {
      setStatus('queued');
      setTokenId(null);
      try {
        const { jobId } = await importFromYoutube({ url: url.trim(), ownershipConfirmed });
        setStatus('importing');
        toast.message('Import started — this can take a few minutes for longer videos.');
        pollStatus(jobId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not start the import');
        setStatus('idle');
      }
    });
  };

  return (
    <>
      <SEOHead
        title="Import from YouTube — DeHub"
        description="Paste a YouTube link and publish it as a DeHub post."
        url="https://dehub.io/yt-dlp"
      />
      <div className="min-h-screen bg-black text-white">
        <header className="flex items-center justify-between px-4 py-4 sm:px-8">
          <Link to="/" className="flex items-center gap-2">
            <img src={dehubLogo} alt="DeHub logo white" className="h-6 w-auto" />
          </Link>
        </header>

        <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12 sm:px-0">
          <div className="flex items-center gap-2">
            <Youtube className="h-6 w-6" />
            <h1 className="text-xl font-semibold">Import from YouTube</h1>
          </div>
          <p className="text-sm text-white/60">
            Paste a link to a video you already own and we'll publish it as a post on your profile.
          </p>

          <Input
            placeholder="https://youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={status !== 'idle'}
          />

          <label className="flex items-start gap-2 text-sm text-white/60">
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
            <p className="text-xs text-white/60">
              Downloading and publishing — you can leave this page and it'll keep going in the background.
            </p>
          )}

          {tokenId && (
            <Link to="/" className="text-sm underline">
              View your feed
            </Link>
          )}

          <Button
            onClick={handleSubmit}
            disabled={status !== 'idle' || !url.trim() || !ownershipConfirmed}
            className="w-full"
          >
            {status !== 'idle' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {status === 'idle'
              ? isAuthenticated
                ? 'Import'
                : 'Sign in to import'
              : status === 'queued'
                ? 'Starting…'
                : 'Importing…'}
          </Button>
        </main>
      </div>
    </>
  );
}
