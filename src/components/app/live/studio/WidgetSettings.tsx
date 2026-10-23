/**
 * The settings for whichever widget is selected in Live Studio.
 *
 * Each field writes straight into the widget's settings object, under the same
 * names the widgets read (overlay-widgets.tsx) and the stream API stores.
 */
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SETTINGS_FIELD_CLASS, SETTINGS_LABEL_CLASS } from '@/components/app/settings/SettingsRow';
import { setting, type OverlayKind } from '@/lib/live-overlay/registry';
import type { OverlayWidget } from '@/lib/live-overlay/types';

interface Props {
  widget: OverlayWidget;
  onChange: (settings: Record<string, unknown>) => void;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={SETTINGS_LABEL_CLASS}>
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1.5 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-white">
          {label}
        </label>
        {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

const selectClass = `${SETTINGS_FIELD_CLASS} w-full border px-3 text-sm`;

export function WidgetSettings({ widget, onChange }: Props) {
  const { t } = useTranslation();
  const s = widget.settings || {};
  const set = (key: string, value: unknown) => onChange({ ...s, [key]: value });
  const num = (key: string, raw: string, min: number, max: number) => {
    const n = Number(raw);
    if (Number.isFinite(n)) set(key, Math.min(max, Math.max(min, n)));
  };

  const accentField = (
    <Field label={t('liveStudio.fields.accent')}>
      {(id) => (
        <input
          id={id}
          type="color"
          value={setting(s, 'accent', '#ffffff')}
          onChange={(e) => set('accent', e.target.value)}
          className="h-10 w-16 cursor-pointer rounded-xl border border-zinc-700 bg-zinc-800 p-1"
        />
      )}
    </Field>
  );

  const kind = widget.kind as OverlayKind;
  let body: ReactNode = null;

  switch (kind) {
    case 'tip_alert':
      body = (
        <>
          <Field label={t('liveStudio.fields.style')}>
            {(id) => (
              <select id={id} className={selectClass} value={setting(s, 'style', 'celebration')} onChange={(e) => set('style', e.target.value)}>
                <option value="celebration">{t('liveStudio.fields.celebration')}</option>
                <option value="banner">{t('liveStudio.fields.banner')}</option>
              </select>
            )}
          </Field>
          <Field label={t('liveStudio.fields.minAmount')}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={0}
                value={setting(s, 'minAmount', 0)}
                onChange={(e) => num('minAmount', e.target.value, 0, 1_000_000_000)}
                className={SETTINGS_FIELD_CLASS}
              />
            )}
          </Field>
          <Toggle label={t('liveStudio.fields.showMessage')} checked={setting(s, 'showMessage', true)} onChange={(v) => set('showMessage', v)} />
          <Toggle
            label={t('liveStudio.fields.confirmedOnly')}
            hint={t('liveStudio.fields.confirmedOnlyHint')}
            checked={setting(s, 'confirmedOnly', false)}
            onChange={(v) => set('confirmedOnly', v)}
          />
        </>
      );
      break;

    case 'follow_alert':
    case 'subscribe_alert':
    case 'share_alert':
    case 'join_alert':
      body = (
        <Field label={t('liveStudio.fields.duration')}>
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={2}
              max={20}
              value={Math.round(setting(s, 'durationMs', 5000) / 1000)}
              onChange={(e) => num('durationMs', String(Number(e.target.value) * 1000), 2000, 20000)}
              className={SETTINGS_FIELD_CLASS}
            />
          )}
        </Field>
      );
      break;

    case 'goal_bar':
      body = (
        <>
          <Field label={t('liveStudio.fields.metric')}>
            {(id) => (
              <select id={id} className={selectClass} value={setting(s, 'metric', 'tips')} onChange={(e) => set('metric', e.target.value)}>
                <option value="tips">{t('liveStudio.fields.metricTips')}</option>
                <option value="followers">{t('liveStudio.fields.metricFollowers')}</option>
              </select>
            )}
          </Field>
          <Field label={t('liveStudio.fields.target')}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                value={setting(s, 'target', 1_000_000)}
                onChange={(e) => num('target', e.target.value, 1, 1_000_000_000_000)}
                className={SETTINGS_FIELD_CLASS}
              />
            )}
          </Field>
          <Field label={t('liveStudio.fields.title')}>
            {(id) => (
              <Input id={id} maxLength={60} value={setting(s, 'title', '')} onChange={(e) => set('title', e.target.value)} className={SETTINGS_FIELD_CLASS} />
            )}
          </Field>
          {accentField}
        </>
      );
      break;

    case 'top_supporters':
      body = (
        <>
          <Field label={t('liveStudio.fields.count')}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                max={10}
                value={setting(s, 'count', 3)}
                onChange={(e) => num('count', e.target.value, 1, 10)}
                className={SETTINGS_FIELD_CLASS}
              />
            )}
          </Field>
          <Field label={t('liveStudio.fields.title')}>
            {(id) => (
              <Input
                id={id}
                maxLength={40}
                placeholder={t('liveOverlay.topSupporters')}
                value={setting(s, 'title', '')}
                onChange={(e) => set('title', e.target.value)}
                className={SETTINGS_FIELD_CLASS}
              />
            )}
          </Field>
        </>
      );
      break;

    case 'text':
      body = (
        <>
          <Field label={t('liveStudio.fields.style')}>
            {(id) => (
              <select id={id} className={selectClass} value={setting(s, 'style', 'lower_third')} onChange={(e) => set('style', e.target.value)}>
                <option value="lower_third">{t('liveStudio.fields.lowerThird')}</option>
                <option value="plain">{t('liveStudio.fields.plain')}</option>
              </select>
            )}
          </Field>
          <Field label={t('liveStudio.fields.text')}>
            {(id) => (
              <Input id={id} maxLength={80} value={setting(s, 'text', '')} onChange={(e) => set('text', e.target.value)} className={SETTINGS_FIELD_CLASS} />
            )}
          </Field>
          <Field label={t('liveStudio.fields.subtext')}>
            {(id) => (
              <Input id={id} maxLength={120} value={setting(s, 'subtext', '')} onChange={(e) => set('subtext', e.target.value)} className={SETTINGS_FIELD_CLASS} />
            )}
          </Field>
          {accentField}
        </>
      );
      break;

    case 'frame':
      body = (
        <>
          <Field label={t('liveStudio.fields.style')}>
            {(id) => (
              <select id={id} className={selectClass} value={setting(s, 'style', 'solid')} onChange={(e) => set('style', e.target.value)}>
                <option value="solid">{t('liveStudio.fields.solid')}</option>
                <option value="glow">{t('liveStudio.fields.glow')}</option>
              </select>
            )}
          </Field>
          <Field label={t('liveStudio.fields.thickness')}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                max={80}
                value={setting(s, 'thickness', 6)}
                onChange={(e) => num('thickness', e.target.value, 1, 80)}
                className={SETTINGS_FIELD_CLASS}
              />
            )}
          </Field>
          <Field label={t('liveStudio.fields.radius')}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={0}
                max={300}
                value={setting(s, 'radius', 0)}
                onChange={(e) => num('radius', e.target.value, 0, 300)}
                className={SETTINGS_FIELD_CLASS}
              />
            )}
          </Field>
          {accentField}
        </>
      );
      break;

    case 'streamer_level':
      body = (
        <>
          <Toggle label={t('liveStudio.fields.showStreak')} checked={setting(s, 'showStreak', true)} onChange={(v) => set('showStreak', v)} />
          {accentField}
        </>
      );
      break;

    case 'tip_jar':
      body = (
        <>
          <Field label={t('liveStudio.fields.target')}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                value={setting(s, 'target', 100_000)}
                onChange={(e) => num('target', e.target.value, 1, 1_000_000_000_000)}
                className={SETTINGS_FIELD_CLASS}
              />
            )}
          </Field>
          <Field label={t('liveStudio.fields.title')}>
            {(id) => (
              <Input
                id={id}
                maxLength={40}
                placeholder={t('liveOverlay.tipJar')}
                value={setting(s, 'title', '')}
                onChange={(e) => set('title', e.target.value)}
                className={SETTINGS_FIELD_CLASS}
              />
            )}
          </Field>
          {accentField}
        </>
      );
      break;

    case 'subathon_timer':
      body = (
        <>
          <p className="text-xs text-zinc-500">{t('liveStudio.subathon.widgetHint')}</p>
          <Field label={t('liveStudio.fields.label')}>
            {(id) => (
              <Input
                id={id}
                maxLength={30}
                placeholder={t('liveOverlay.subathon')}
                value={setting(s, 'label', '')}
                onChange={(e) => set('label', e.target.value)}
                className={SETTINGS_FIELD_CLASS}
              />
            )}
          </Field>
          {accentField}
        </>
      );
      break;

    case 'points_board':
      body = (
        <>
          <Field label={t('liveStudio.fields.count')}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                max={10}
                value={setting(s, 'count', 5)}
                onChange={(e) => num('count', e.target.value, 1, 10)}
                className={SETTINGS_FIELD_CLASS}
              />
            )}
          </Field>
          <Field label={t('liveStudio.fields.title')}>
            {(id) => (
              <Input
                id={id}
                maxLength={40}
                placeholder={t('liveOverlay.pointsTitle')}
                value={setting(s, 'title', '')}
                onChange={(e) => set('title', e.target.value)}
                className={SETTINGS_FIELD_CLASS}
              />
            )}
          </Field>
        </>
      );
      break;

    case 'stream_timer':
      body = (
        <>
          <Field label={t('liveStudio.fields.label')}>
            {(id) => (
              <Input id={id} maxLength={30} value={setting(s, 'label', '')} onChange={(e) => set('label', e.target.value)} className={SETTINGS_FIELD_CLASS} />
            )}
          </Field>
          {accentField}
        </>
      );
      break;

    case 'reaction_counter':
      body = accentField;
      break;

    case 'event_feed':
    case 'chat_box':
      body = (
        <>
          <Field label={t('liveStudio.fields.lines')}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                max={kind === 'chat_box' ? 12 : 8}
                value={setting(s, 'count', kind === 'chat_box' ? 6 : 4)}
                onChange={(e) => num('count', e.target.value, 1, kind === 'chat_box' ? 12 : 8)}
                className={SETTINGS_FIELD_CLASS}
              />
            )}
          </Field>
          {kind === 'event_feed' ? (
            <Field label={t('liveStudio.fields.title')}>
              {(id) => (
                <Input id={id} maxLength={40} value={setting(s, 'title', '')} onChange={(e) => set('title', e.target.value)} className={SETTINGS_FIELD_CLASS} />
              )}
            </Field>
          ) : (
            <Toggle label={t('liveStudio.fields.showAvatars')} checked={setting(s, 'showAvatars', true)} onChange={(v) => set('showAvatars', v)} />
          )}
        </>
      );
      break;

    case 'ticker':
      body = (
        <>
          <Field label={t('liveStudio.fields.text')}>
            {(id) => (
              <Input id={id} maxLength={200} value={setting(s, 'text', '')} onChange={(e) => set('text', e.target.value)} className={SETTINGS_FIELD_CLASS} />
            )}
          </Field>
          <Field label={t('liveStudio.fields.speed')}>
            {(id) => (
              <select id={id} className={selectClass} value={setting(s, 'speed', 'normal')} onChange={(e) => set('speed', e.target.value)}>
                <option value="slow">{t('liveStudio.fields.slow')}</option>
                <option value="normal">{t('liveStudio.fields.normal')}</option>
                <option value="fast">{t('liveStudio.fields.fast')}</option>
              </select>
            )}
          </Field>
          {accentField}
        </>
      );
      break;

    case 'poll':
      body = (
        <>
          <p className="text-xs text-zinc-500">{t('liveStudio.polls.widgetHint', { command: '!vote' })}</p>
          {accentField}
        </>
      );
      break;

    default:
      body = null;
  }

  if (!body) return <p className="text-sm text-zinc-500">{t('liveStudio.noSettings')}</p>;
  return <div className="space-y-4">{body}</div>;
}
