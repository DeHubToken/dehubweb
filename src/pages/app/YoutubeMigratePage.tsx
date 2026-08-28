/**
 * /app/migrate-youtube — "Migrate all"
 * =====================================
 * Bulk-import a creator's whole YouTube channel as DeHub posts, one paid
 * batch at a time. Connects via OAuth (real ownership proof, unlike the
 * single-video importer's checkbox), quotes the batch in DHB, takes one
 * upfront on-chain payment, then runs the import in the background.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Youtube, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import {
  getYoutubeConnectUrl,
  listChannelVideos,
  quoteMigration,
  settleMigration,
  getMigrationChargeStatus,
  type ChannelVideo,
  type MigrationQuote,
  type MigrationChargeStatus,
} from '@/lib/api/dehub/youtube-migration';

type Stage = 'loading' | 'not-connected' | 'listing' | 'quoting' | 'paying' | 'processing' | 'done';

export default function YoutubeMigratePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [stage, setStage] = useState<Stage>('loading');
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quote, setQuote] = useState<MigrationQuote | null>(null);
  const [charge, setCharge] = useState<MigrationChargeStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadVideos = useCallback(async () => {
    setStage('listing');
    try {
      const { videos: list } = await listChannelVideos();
      setVideos(list);
      setSelected(new Set(list.filter(v => !v.alreadyImported).map(v => v.youtubeVideoId)));
      setStage('listing');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.toLowerCase().includes('connect your youtube channel')) {
        setStage('not-connected');
      } else {
        toast.error(message || 'Could not load your channel');
        setStage('not-connected');
      }
    }
  }, []);

  useEffect(() => {
    if (searchParams.get('error')) toast.error(searchParams.get('error')!);
    loadVideos();
  }, [loadVideos, searchParams]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleConnect = async () => {
    try {
      const { url } = await getYoutubeConnectUrl();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the connection');
    }
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGetQuote = async () => {
    if (!selected.size) {
      toast.error('Select at least one video');
      return;
    }
    setStage('quoting');
    try {
      const q = await quoteMigration([...selected]);
      setQuote(q);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not price this migration');
      setStage('listing');
    }
  };

  const pollCharge = (chargeId: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const status = await getMigrationChargeStatus(chargeId);
        setCharge(status);
        if (status.results.every(r => r.status !== 'pending')) {
          if (pollRef.current) clearInterval(pollRef.current);
          setStage('done');
          const imported = status.results.filter(r => r.status === 'imported').length;
          const failed = status.results.filter(r => r.status === 'failed').length;
          toast.success(
            failed
              ? `Migrated ${imported} video${imported === 1 ? '' : 's'} — ${failed} couldn't import and were credited toward your next migration.`
              : `Migrated ${imported} video${imported === 1 ? '' : 's'}!`,
          );
        }
      } catch {
        // transient — keep polling
      }
    }, 5000);
  };

  const handlePay = async () => {
    if (!quote) return;
    setStage('paying');
    try {
      if (quote.amountDhb === 0) {
        // Fully covered by credit — nothing to sign, just settle.
        await settleMigration(quote.chargeId, '0x0', 0);
      } else {
        if (!quote.recipient) throw new Error('Payments are not configured right now.');
        const { payDhb } = await import('@/lib/dhb-payment');
        toast.loading(`Paying ${quote.amountDhb.toLocaleString()} DHB to migrate ${quote.videoCount} videos`, {
          id: 'migration-pay',
          duration: Infinity,
        });
        const payment = await payDhb(quote.amountDhb, quote.recipient, {
          context: 'YouTube migration',
          expectedSigner: user?.address,
          shortfallMessage: (amount, has) =>
            `This migration costs ${amount.toLocaleString()} DHB and you hold ${has.toLocaleString()}.`,
        });
        toast.dismiss('migration-pay');
        await settleMigration(quote.chargeId, payment.txHash, payment.chainId);
      }
      setStage('processing');
      pollCharge(quote.chargeId);
    } catch (err) {
      toast.dismiss('migration-pay');
      toast.error(err instanceof Error ? err.message : 'Payment failed');
      setStage('listing');
    }
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-10">
      <div className="flex items-center gap-2">
        <Youtube className="h-6 w-6" />
        <h1 className="text-xl font-semibold">Migrate all from YouTube</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Connect your channel, pick what to bring over, and pay once to migrate the whole batch.
      </p>

      {stage === 'loading' && <Loader2 className="h-5 w-5 animate-spin" />}

      {stage === 'not-connected' && (
        <Button onClick={handleConnect} className="w-fit">
          Connect your YouTube channel
        </Button>
      )}

      {(stage === 'listing' || stage === 'quoting') && videos.length > 0 && !quote && (
        <>
          <div className="flex max-h-96 flex-col gap-2 overflow-y-auto rounded-lg border border-border p-2">
            {videos.map(v => (
              <label
                key={v.youtubeVideoId}
                className={`flex items-center gap-3 rounded-md p-2 text-sm ${v.alreadyImported ? 'opacity-50' : ''}`}
              >
                <Checkbox
                  checked={v.alreadyImported || selected.has(v.youtubeVideoId)}
                  disabled={v.alreadyImported}
                  onCheckedChange={() => toggle(v.youtubeVideoId)}
                />
                <span className="truncate">{v.title}</span>
                {v.alreadyImported && <span className="ml-auto shrink-0 text-xs">Imported</span>}
              </label>
            ))}
          </div>
          <Button onClick={handleGetQuote} disabled={stage === 'quoting' || !selected.size} className="w-fit">
            {stage === 'quoting' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Get price for {selected.size} video{selected.size === 1 ? '' : 's'}
          </Button>
        </>
      )}

      {stage === 'listing' && videos.length === 0 && (
        <p className="text-sm text-muted-foreground">No uploads found on your channel.</p>
      )}

      {quote && (stage === 'quoting' || stage === 'paying') && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <p className="text-sm">
            {quote.videoCount} video{quote.videoCount === 1 ? '' : 's'} ×{' '}
            {quote.unitPriceDhb.toLocaleString()} DHB
            {quote.creditAppliedDhb > 0 && (
              <> — {quote.creditAppliedDhb.toLocaleString()} DHB credit applied</>
            )}
          </p>
          <p className="text-lg font-semibold">
            {quote.amountDhb === 0 ? 'Free (covered by credit)' : `${quote.amountDhb.toLocaleString()} DHB`}
          </p>
          <Button onClick={handlePay} disabled={stage === 'paying'}>
            {stage === 'paying' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {quote.amountDhb === 0 ? 'Start migration' : `Pay ${quote.amountDhb.toLocaleString()} DHB`}
          </Button>
        </div>
      )}

      {stage === 'processing' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Migrating — this runs in the background.</p>
          {charge?.results.map(r => (
            <div key={r.youtubeVideoId} className="flex items-center gap-2 text-sm">
              {r.status === 'pending' && <Loader2 className="h-4 w-4 animate-spin" />}
              {r.status === 'imported' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
              {r.status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
              <span className="truncate">{r.youtubeVideoId}</span>
              {r.failedReason && <span className="text-xs text-muted-foreground">{r.failedReason}</span>}
            </div>
          ))}
        </div>
      )}

      {stage === 'done' && (
        <Button variant="outline" onClick={() => navigate('/')}>
          View your feed
        </Button>
      )}
    </div>
  );
}
