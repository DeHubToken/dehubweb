/**
 * Quick controls: the switches a creator reaches for mid-stream. Each one
 * holds for everyone at once — every viewer's app and the OBS page — and
 * stays as set until it is flipped back.
 */
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { PageSection } from '@/components/app/page-kit/PageKit';
import { setMyControls } from '@/lib/api/dehub/live-overlay';
import { parseControls, type CreatorOverlay, type OverlayControls } from '@/lib/live-overlay/types';

const SWITCHES: Array<keyof OverlayControls> = ['alertsPaused', 'soundsMuted', 'readAloudMuted'];

export function QuickControls({ overlay, queryKey }: { overlay: CreatorOverlay; queryKey: readonly unknown[] }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const controls = parseControls(overlay.controls);

  const flip = useMutation({
    mutationFn: (change: Partial<OverlayControls>) => setMyControls(change),
    onMutate: (change) => {
      const previous = queryClient.getQueryData<CreatorOverlay>(queryKey);
      queryClient.setQueryData<CreatorOverlay>(queryKey, (prev) => (prev ? { ...prev, controls: { ...controls, ...change } } : prev));
      return { previous };
    },
    onSuccess: (saved) => queryClient.setQueryData<CreatorOverlay>(queryKey, (prev) => (prev ? { ...prev, controls: saved.controls, version: saved.version } : saved)),
    onError: (_err, _change, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error(t('liveStudio.controls.failed'));
    },
  });

  return (
    <PageSection title={t('liveStudio.controls.title')}>
      <p className="mb-3 text-xs text-zinc-500">{t('liveStudio.controls.intro')}</p>
      <ul className="space-y-3">
        {SWITCHES.map((key) => (
          <li key={key} className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">{t(`liveStudio.controls.${key}`)}</p>
              <p className="text-xs text-zinc-500">{t(`liveStudio.controls.${key}Hint`)}</p>
            </div>
            <Switch
              checked={controls[key]}
              disabled={flip.isPending}
              onCheckedChange={(on) => flip.mutate({ [key]: on })}
              aria-label={t(`liveStudio.controls.${key}`)}
            />
          </li>
        ))}
      </ul>
    </PageSection>
  );
}
