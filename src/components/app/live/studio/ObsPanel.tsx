/**
 * Live Studio's OBS controls: where the overlay is drawn, the browser-source
 * link, and whether an OBS page is open on it right now.
 *
 * The one switch here decides who draws the overlay. "In the DeHub app" — each
 * viewer's player draws it, which works from any source and costs the streamer
 * nothing. "In my video" — OBS burns it into the picture, so it is in replays
 * and anywhere the stream is watched, and the app stays out of the way. Both
 * at once means every alert lands twice, which is what the warnings are for.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageSection } from '@/components/app/page-kit/PageKit';
import { SETTINGS_FIELD_CLASS } from '@/components/app/settings/SettingsRow';
import { cn } from '@/lib/utils';
import { rotateOverlayToken } from '@/lib/api/dehub/live-overlay';
import type { CreatorOverlay, OverlayRenderIn } from '@/lib/live-overlay/types';

interface Props {
  token: string;
  renderIn: OverlayRenderIn;
  obsConnected: boolean;
  selectedWidgetId: string | null;
  onRenderIn: (next: OverlayRenderIn) => void;
}

// LiveStudio's myOverlayKey. Restated rather than imported: LiveStudio renders
// this panel, and importing back from it would make the two modules a cycle.
const MY_OVERLAY_KEY = ['my-overlay'] as const;

function CopyField({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('liveStudio.obs.copyFailed'));
    }
  };
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} aria-label={label} className={`${SETTINGS_FIELD_CLASS} font-mono text-xs`} />
      <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={copy} aria-label={t('liveStudio.obs.copy')}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export function ObsPanel({ token, renderIn, obsConnected, selectedWidgetId, onRenderIn }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const url = `${window.location.origin}/overlay/${token}`;

  const rotate = useMutation({
    mutationFn: rotateOverlayToken,
    onSuccess: (next: CreatorOverlay) => {
      queryClient.setQueryData<CreatorOverlay>(MY_OVERLAY_KEY, (prev) => (prev ? { ...prev, token: next.token, obsConnected: false } : next));
      toast.success(t('liveStudio.obs.rotated'));
    },
    onError: () => toast.error(t('liveStudio.obs.rotateFailed')),
  });

  const confirmRotate = () => {
    if (window.confirm(t('liveStudio.obs.rotateConfirm'))) rotate.mutate();
  };

  return (
    <PageSection
      title={t('liveStudio.obs.title')}
      action={
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
            obsConnected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-800 text-zinc-400',
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', obsConnected ? 'bg-emerald-400' : 'bg-zinc-500')} />
          {obsConnected ? t('liveStudio.obs.connected') : t('liveStudio.obs.notConnected')}
        </span>
      }
    >
      <div className="space-y-4">
        <div role="radiogroup" aria-label={t('liveStudio.obs.showIn')} className="space-y-2">
          <p className="text-sm font-medium text-white">{t('liveStudio.obs.showIn')}</p>
          {(['app', 'video'] as const).map((option) => (
            <button
              key={option}
              role="radio"
              aria-checked={renderIn === option}
              onClick={() => onRenderIn(option)}
              className={cn(
                'w-full rounded-xl border px-3 py-2.5 text-left',
                renderIn === option ? 'border-white bg-zinc-800' : 'border-zinc-700 hover:border-zinc-500',
              )}
            >
              <span className="block text-sm font-medium text-white">
                {option === 'app' ? t('liveStudio.obs.inApp') : t('liveStudio.obs.inVideo')}
              </span>
              <span className="mt-0.5 block text-xs text-zinc-400">
                {option === 'app' ? t('liveStudio.obs.inAppHint') : t('liveStudio.obs.inVideoHint')}
              </span>
            </button>
          ))}
        </div>

        {renderIn === 'app' && obsConnected && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            <p>{t('liveStudio.obs.warnDoubles')}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => onRenderIn('video')}>
              {t('liveStudio.obs.switchToVideo')}
            </Button>
          </div>
        )}
        {renderIn === 'video' && !obsConnected && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            {t('liveStudio.obs.warnNoObs')}
          </p>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium text-white">{t('liveStudio.obs.link')}</p>
          <CopyField value={url} label={t('liveStudio.obs.link')} />
          <ol className="list-decimal space-y-1 pl-5 text-xs text-zinc-400">
            <li>{t('liveStudio.obs.step1')}</li>
            <li>{t('liveStudio.obs.step2')}</li>
            <li>{t('liveStudio.obs.step3')}</li>
          </ol>
        </div>

        {selectedWidgetId && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-white">{t('liveStudio.obs.oneWidget')}</p>
            <CopyField value={`${url}?w=${encodeURIComponent(selectedWidgetId)}`} label={t('liveStudio.obs.oneWidget')} />
          </div>
        )}

        <Button variant="outline" size="sm" onClick={confirmRotate} disabled={rotate.isPending}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          {t('liveStudio.obs.rotate')}
        </Button>
      </div>
    </PageSection>
  );
}
