/**
 * dehub.io/yt-dlp — import a YouTube video as a DeHub post.
 * ==========================================================
 * Lives inside AppLayout (sidebar/nav chrome), same as wallet/profile/etc —
 * this is a signed-in action, not a marketing landing page. Pasting a URL
 * and confirming ownership is a different action from "make a post" though,
 * so it stays off the compose action bar and gets its own page instead.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Youtube, Clipboard } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthPrompt } from '@/components/app/AuthPrompt';
import { importFromYoutube, getYoutubeImportStatus } from '@/lib/api/dehub/youtube-import';

const YOUTUBE_URL_RE = /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i;

/** Two attempts at a theme-token color (`border-primary`, then
 * `border-foreground`) both went invisible on some DeHub theme — this app
 * remaps named colors per theme, so any semantic token can end up close to
 * its own background. Bracket syntax below is a literal, unthemed color:
 * black border, white fill, on every theme, full stop. */
const CHECKBOX_CLASS =
  'mt-0.5 h-5 w-5 shrink-0 rounded border-[2.5px] border-[#000] bg-[#fff] shadow-[0_0_0_1px_rgba(255,255,255,0.6)] data-[state=checked]:bg-[#000] data-[state=checked]:text-[#fff]';

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

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch {
      toast.error('Could not read the clipboard — paste manually instead');
    }
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

      <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Youtube className="w-5 h-5" />
            Import from YouTube
          </h1>
          <p className="text-sm text-zinc-400 max-w-prose">
            Paste a link to a video you already own and we'll publish it as a post on your profile.
          </p>
        </header>

        <section className="rounded-2xl bg-white/5 p-5 flex flex-col gap-4 max-w-md">
          {/* Same look as the sidebar's search box — bg-zinc-900/rounded-xl/no
              border — so this reads as one of the app's real inputs. */}
          <div className="relative">
            <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={status !== 'idle'}
              className="pl-10 pr-20 h-[36px] bg-zinc-900 border-0 rounded-xl text-white placeholder:text-zinc-500 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <button
              type="button"
              onClick={handlePaste}
              disabled={status !== 'idle'}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-300 hover:bg-white/10 disabled:opacity-50"
            >
              <Clipboard className="w-3.5 h-3.5" />
              Paste
            </button>
          </div>

          {/* The whole line toggles the checkbox, not just the tiny box —
              Radix's Checkbox renders a <button>, and wrapping a <button> in
              a <label> does not forward clicks the way a native <input>
              would, so the box itself was the only clickable pixel here. */}
          <div
            role="checkbox"
            aria-checked={ownershipConfirmed}
            tabIndex={status !== 'idle' ? -1 : 0}
            onClick={() => status === 'idle' && setOwnershipConfirmed(v => !v)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && status === 'idle') {
                e.preventDefault();
                setOwnershipConfirmed(v => !v);
              }
            }}
            className="flex items-start gap-2 text-sm text-zinc-400 cursor-pointer select-none"
          >
            <Checkbox
              checked={ownershipConfirmed}
              disabled={status !== 'idle'}
              className={cn(CHECKBOX_CLASS, 'pointer-events-none')}
            />
            <span>
              I own this content, or have the rights holder's permission to publish it on DeHub.
            </span>
          </div>

          {status === 'importing' && (
            <p className="text-xs text-zinc-500">
              Downloading and publishing — you can leave this page and it'll keep going in the background.
            </p>
          )}

          {tokenId && (
            <Link to="/" className="text-sm text-white underline">
              View your feed
            </Link>
          )}

          <Button
            variant="glass"
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
        </section>
      </div>
    </>
  );
}
