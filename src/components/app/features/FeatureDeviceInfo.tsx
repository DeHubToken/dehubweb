import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useFeatureDeviceInfo } from '@/hooks/use-feature-requests';
import { cn } from '@/lib/utils';

/** Field order and labels for the owner's view. Unknown keys follow at the end. */
const FIELDS: [key: string, label: string][] = [
  ['source', 'Sent from'],
  ['app_version', 'App version'],
  ['build', 'Build'],
  ['update', 'OTA update'],
  ['update_published', 'OTA published'],
  ['runtime', 'Runtime'],
  ['channel', 'Channel'],
  ['os', 'OS'],
  ['device', 'Device'],
  ['browser', 'Browser'],
  ['mobile', 'Phone or tablet'],
  ['installed_app', 'Installed web app'],
  ['screen', 'Screen'],
  ['viewport', 'Window'],
  ['pixel_ratio', 'Pixel ratio'],
  ['font_scale', 'Font scale'],
  ['theme', 'Theme'],
  ['dark_mode', 'System dark mode'],
  ['reduced_motion', 'Reduce motion'],
  ['language', 'Language'],
  ['browser_language', 'Device language'],
  ['timezone', 'Timezone'],
  ['page', 'Page'],
  ['connection', 'Connection'],
  ['online', 'Online'],
  ['memory_gb', 'Memory (GB)'],
  ['cpu_cores', 'CPU cores'],
  ['touch', 'Touch screen'],
  ['username', 'Username'],
  ['wallet', 'Wallet'],
  ['captured_at', 'Captured'],
  ['user_agent', 'User agent'],
];
const LABELS = new Map(FIELDS);

function show(value: unknown): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Collapsed "Device info" row on a request card. Rendered for the board owners
 * only, and only on requests that came with a snapshot.
 */
export function FeatureDeviceInfo({ featureId }: { featureId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useFeatureDeviceInfo(featureId, open);

  const rows = data
    ? [
        ...FIELDS.map(([key]) => key).filter(key => key in data),
        ...Object.keys(data).filter(key => !LABELS.has(key) && key !== 'recent_errors'),
      ]
        .map(key => [LABELS.get(key) ?? key, show(data[key])] as const)
        .filter(([, value]) => value)
    : [];
  const errors = Array.isArray(data?.recent_errors) ? (data!.recent_errors as { at?: string; message?: string }[]) : [];

  return (
    <div data-feature-device-info className="rounded-lg border border-white/10 bg-white/[0.03] text-xs">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-zinc-300 hover:text-white"
      >
        <span className={cn('inline-block transition-transform', open && 'rotate-90')} aria-hidden>›</span>
        <span className="font-medium">{t('features.deviceInfo', 'Device info')}</span>
        <span className="ml-auto text-[10px] text-zinc-500">{t('features.deviceInfoOwners', 'Only board owners see this')}</span>
      </button>
      {open && (
        <div className="border-t border-white/10 px-2.5 py-2">
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
          ) : error ? (
            <p className="text-red-400">{t('features.deviceInfoError', "Couldn't load device info")}</p>
          ) : !data ? (
            <p className="text-zinc-500">{t('features.deviceInfoNone', 'No device info for this request')}</p>
          ) : (
            <>
              <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-1">
                {rows.map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-zinc-500">{label}</dt>
                    <dd className="min-w-0 break-words text-zinc-200 select-all">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-zinc-500">{t('features.deviceInfoErrors', 'Recent errors')}</p>
              {errors.length === 0 ? (
                <p className="text-zinc-400">{t('features.deviceInfoNoErrors', 'None')}</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {errors.map((e, i) => (
                    <li key={i} className="break-words font-mono text-[11px] text-amber-300/90">
                      {e.at ? `${e.at.slice(11, 19)} ` : ''}{e.message}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
