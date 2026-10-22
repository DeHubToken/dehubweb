/**
 * Live Studio's subathon: a countdown that gifts, follows and subscriptions
 * push back, by amounts the creator picks. The stream API holds the end time
 * and adds to it, once per event, however many people are watching.
 */
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageSection } from '@/components/app/page-kit/PageKit';
import { SETTINGS_FIELD_CLASS, SETTINGS_LABEL_CLASS } from '@/components/app/settings/SettingsRow';
import {
  addSubathonTime,
  saveMySubathon,
  startSubathon,
  stopSubathon,
  type MySubathon,
  type SubathonSettings,
} from '@/lib/api/dehub/live-subathon';
import { clockOf } from '../overlay/subathon';

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={SETTINGS_LABEL_CLASS}>
        {label}
      </label>
      {children(id)}
    </div>
  );
}

interface Props {
  subathon: MySubathon | null;
  onChange: (next: MySubathon) => void;
}

const FIELDS: Array<{ key: keyof SubathonSettings; max: number }> = [
  { key: 'secondsPerThousand', max: 600 },
  { key: 'secondsPerFollow', max: 600 },
  { key: 'secondsPerSubscribe', max: 3600 },
  { key: 'capHours', max: 72 },
];

export function SubathonPanel({ subathon, onChange }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<SubathonSettings | null>(null);
  const [minutes, setMinutes] = useState(60);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (subathon && !draft) setDraft({ ...subathon });
  }, [subathon, draft]);
  const running = !!subathon?.running && !!subathon.endsAt && new Date(subathon.endsAt).getTime() > now;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const settings = draft ?? subathon;
  const failed = () => toast.error(t('liveStudio.subathon.failed'));
  const save = useMutation({
    mutationFn: () => saveMySubathon(settings!),
    onSuccess: (s) => {
      onChange(s);
      toast.success(t('liveStudio.subathon.saved'));
    },
    onError: failed,
  });
  const start = useMutation({ mutationFn: () => startSubathon(minutes, settings!), onSuccess: onChange, onError: failed });
  const stop = useMutation({ mutationFn: stopSubathon, onSuccess: onChange, onError: failed });
  const add = useMutation({ mutationFn: (seconds: number) => addSubathonTime(seconds), onSuccess: onChange, onError: failed });
  if (!settings) return null;

  const left = running ? Math.max(0, Math.ceil((new Date(subathon!.endsAt!).getTime() - now) / 1000)) : 0;
  return (
    <PageSection title={t('liveStudio.subathon.title')}>
      <p className="mb-3 text-xs text-zinc-500">{t('liveStudio.subathon.intro')}</p>

      {running && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 p-3">
          <span className="text-2xl font-bold tabular-nums text-white">{clockOf(left)}</span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={add.isPending} onClick={() => add.mutate(300)}>
              {t('liveStudio.subathon.addFive')}
            </Button>
            <Button size="sm" variant="outline" disabled={add.isPending} onClick={() => add.mutate(-300)}>
              {t('liveStudio.subathon.removeFive')}
            </Button>
            <Button size="sm" variant="outline" disabled={stop.isPending} onClick={() => stop.mutate()}>
              {t('liveStudio.subathon.stop')}
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(({ key, max }) => (
          <Field key={key} label={t(`liveStudio.subathon.${key}`)}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={0}
                max={max}
                value={settings[key]}
                onChange={(e) => setDraft({ ...settings, [key]: Math.min(max, Math.max(0, Number(e.target.value) || 0)) })}
                className={SETTINGS_FIELD_CLASS}
              />
            )}
          </Field>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>
          {t('liveStudio.subathon.save')}
        </Button>
        {!running && (
          <>
            <Field label={t('liveStudio.subathon.startMinutes')}>
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={settings.capHours * 60}
                  value={minutes}
                  onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))}
                  className={`${SETTINGS_FIELD_CLASS} w-28`}
                />
              )}
            </Field>
            <Button size="sm" disabled={start.isPending} onClick={() => start.mutate()}>
              {t('liveStudio.subathon.start')}
            </Button>
          </>
        )}
      </div>
    </PageSection>
  );
}
