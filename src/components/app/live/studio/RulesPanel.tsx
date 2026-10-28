/**
 * Live Studio's rules: "when this happens on my stream, do that".
 *
 * Saved separately from the widgets — a rule is not something drawn — and run
 * by the stream API, once, when it happens. A test plays a saved rule's
 * alerts, sounds and read-aloud on the creator's own screens only.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Loader2, Trash2 } from 'lucide-react';
import Plus from "@/components/ui/cut-icons/add";
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PageSection } from '@/components/app/page-kit/PageKit';
import { SETTINGS_FIELD_CLASS, SETTINGS_LABEL_CLASS } from '@/components/app/settings/SettingsRow';
import { cn } from '@/lib/utils';
import { getMyRules, saveMyRules, testRule, type MyRules } from '@/lib/api/dehub/live-overlay';
import {
  blankAction,
  isChatTrigger,
  MAX_ACTIONS,
  MAX_RULES,
  presetRule,
  RULE_ACTION_TYPES,
  RULE_AUDIENCES,
  RULE_PRESETS,
  RULE_SOUNDS,
  RULE_TRIGGERS,
  WHEEL_MAX_SEGMENTS,
  type LiveRule,
  type RuleAction,
  type RuleActionType,
  type RulePreset,
  type RuleTriggerType,
} from '@/lib/live-overlay/rules';

export const myRulesKey = ['my-overlay-rules'] as const;

const selectClass = `${SETTINGS_FIELD_CLASS} w-full border px-3 text-sm`;

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

interface Props {
  /** Whether the overlay has somewhere to show a rule's alert text. */
  hasAlertWidget: boolean;
}

export function RulesPanel({ hasAlertWidget }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery<MyRules>({ queryKey: myRulesKey, queryFn: getMyRules, staleTime: 15_000 });
  const [rules, setRules] = useState<LiveRule[]>([]);
  const [dirty, setDirty] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const loadedVersion = useRef<number | null>(null);

  useEffect(() => {
    if (!data || loadedVersion.current === data.version || (dirty && loadedVersion.current !== null)) return;
    loadedVersion.current = data.version;
    setRules(data.rules);
  }, [data, dirty]);

  const edit = (next: LiveRule[]) => {
    setRules(next);
    setDirty(true);
  };
  const update = (id: string, change: Partial<LiveRule>) => edit(rules.map((r) => (r.id === id ? { ...r, ...change } : r)));

  const add = (preset: RulePreset) => {
    if (rules.length >= MAX_RULES) {
      toast.error(t('liveStudio.rules.limit', { count: MAX_RULES }));
      return;
    }
    const rule = presetRule(preset, rules, {
      name: t(`liveStudio.rules.presets.${preset}`),
      say: t('liveStudio.rules.presetText.readChat'),
      alert: t('liveStudio.rules.presetText.bigTip'),
      chat: preset === 'command' ? t('liveStudio.rules.presetText.command') : t('liveStudio.rules.presetText.thankFollowers'),
    });
    edit([...rules, rule]);
    setOpenId(rule.id);
  };

  const save = useMutation({
    mutationFn: () => saveMyRules(rules),
    onSuccess: (saved) => {
      loadedVersion.current = saved.version;
      queryClient.setQueryData(myRulesKey, saved);
      setRules(saved.rules);
      setDirty(false);
      toast.success(t('liveStudio.rules.saved'));
    },
    // The API names the field it refused; show that rather than a shrug.
    onError: (err: unknown) => toast.error(t('liveStudio.rules.saveFailed'), { description: (err as Error)?.message }),
  });

  const test = useMutation({
    mutationFn: (ruleId: string) => testRule(ruleId),
    onError: () => toast.error(t('liveStudio.rules.testFailed')),
  });

  const needsAlertWidget = !hasAlertWidget && rules.some((r) => r.enabled && r.actions.some((a) => a.type === 'alert'));

  return (
    <PageSection
      title={t('liveStudio.rules.title')}
      action={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="mr-1 h-4 w-4" />
              {t('liveStudio.rules.add')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            {RULE_PRESETS.map((preset) => (
              <DropdownMenuItem key={preset} onSelect={() => add(preset)} className="flex-col items-start gap-0.5">
                <span className="text-sm font-medium">{t(`liveStudio.rules.presets.${preset}`)}</span>
                <span className="text-xs text-zinc-500">{t(`liveStudio.rules.presetHints.${preset}`)}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <p className="mb-3 text-xs text-zinc-500">{t('liveStudio.rules.intro')}</p>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
      ) : isError ? (
        <p className="text-sm text-zinc-400">{t('liveStudio.rules.loadFailed')}</p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-zinc-500">{t('liveStudio.rules.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => (
            <li key={rule.id} className="rounded-xl border border-zinc-800">
              <div className="flex items-center gap-3 px-3 py-2">
                <button
                  onClick={() => setOpenId(openId === rule.id ? null : rule.id)}
                  aria-expanded={openId === rule.id}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-zinc-500 transition-transform', openId === rule.id && 'rotate-180')} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-white">{rule.name || t(`liveStudio.rules.triggers.${rule.trigger.type}`)}</span>
                    <span className="block truncate text-xs text-zinc-500">{summary(rule, t)}</span>
                  </span>
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={dirty || test.isPending}
                  title={dirty ? t('liveStudio.rules.saveToTest') : undefined}
                  onClick={() => test.mutate(rule.id)}
                >
                  {t('liveStudio.rules.test')}
                </Button>
                <Switch checked={rule.enabled} onCheckedChange={(v) => update(rule.id, { enabled: v })} aria-label={t('liveStudio.rules.enabled')} />
                <button
                  onClick={() => edit(rules.filter((r) => r.id !== rule.id))}
                  aria-label={t('liveStudio.rules.remove')}
                  className="rounded-md p-1 text-zinc-500 hover:bg-zinc-700 hover:text-white"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {openId === rule.id && (
                <div className="border-t border-zinc-800 p-3">
                  <RuleEditor rule={rule} onChange={(change) => update(rule.id, change)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {needsAlertWidget && <p className="mt-3 text-xs text-amber-400/90">{t('liveStudio.rules.needsAlertWidget')}</p>}

      <div className="mt-4 flex items-center justify-end gap-3">
        {dirty && <span className="text-xs text-zinc-400">{t('liveStudio.unsaved')}</span>}
        <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? t('liveStudio.saving') : t('liveStudio.rules.save')}
        </Button>
      </div>
    </PageSection>
  );
}

function summary(rule: LiveRule, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const trigger = rule.trigger;
  const when =
    trigger.type === 'tip'
      ? t('liveStudio.rules.summary.tip', { amount: (trigger.minAmount ?? 0).toLocaleString() })
      : trigger.type === 'command'
        ? trigger.command || ''
        : trigger.type === 'keyword'
          ? `“${trigger.keyword || ''}”`
          : t(`liveStudio.rules.triggers.${trigger.type}`);
  const then = rule.actions.map((a) => t(`liveStudio.rules.actionTypes.${a.type}`)).join(', ');
  return `${when} → ${then}`;
}

function RuleEditor({ rule, onChange }: { rule: LiveRule; onChange: (change: Partial<LiveRule>) => void }) {
  const { t } = useTranslation();
  const trig = rule.trigger;
  const chatTrigger = isChatTrigger(trig.type);

  const setTrigger = (type: RuleTriggerType) =>
    onChange({
      trigger:
        type === 'tip'
          ? { type, minAmount: 0 }
          : type === 'command'
            ? { type, command: '!hello' }
            : type === 'keyword'
              ? { type, keyword: '' }
              : { type },
    });

  const setAction = (index: number, next: RuleAction) =>
    onChange({ actions: rule.actions.map((a, i) => (i === index ? next : a)) });
  const addAction = (type: RuleActionType) => onChange({ actions: [...rule.actions, blankAction(type)] });
  const removeAction = (index: number) => onChange({ actions: rule.actions.filter((_, i) => i !== index) });

  return (
    <div className="space-y-4">
      <Field label={t('liveStudio.rules.name')}>
        {(id) => (
          <Input id={id} maxLength={60} value={rule.name} onChange={(e) => onChange({ name: e.target.value })} className={SETTINGS_FIELD_CLASS} />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('liveStudio.rules.when')}>
          {(id) => (
            <select id={id} className={selectClass} value={trig.type} onChange={(e) => setTrigger(e.target.value as RuleTriggerType)}>
              {RULE_TRIGGERS.map((type) => (
                <option key={type} value={type}>
                  {t(`liveStudio.rules.triggers.${type}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
        {trig.type === 'tip' && (
          <Field label={t('liveStudio.rules.minAmount')}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={0}
                value={trig.minAmount ?? 0}
                onChange={(e) => onChange({ trigger: { ...trig, minAmount: Math.max(0, Number(e.target.value) || 0) } })}
                className={SETTINGS_FIELD_CLASS}
              />
            )}
          </Field>
        )}
        {trig.type === 'command' && (
          <Field label={t('liveStudio.rules.command')}>
            {(id) => (
              <Input
                id={id}
                maxLength={31}
                value={trig.command ?? ''}
                onChange={(e) => onChange({ trigger: { ...trig, command: e.target.value.toLowerCase().replace(/[^!a-z0-9_]/g, '') } })}
                className={SETTINGS_FIELD_CLASS}
              />
            )}
          </Field>
        )}
        {trig.type === 'keyword' && (
          <Field label={t('liveStudio.rules.keyword')}>
            {(id) => (
              <Input id={id} maxLength={40} value={trig.keyword ?? ''} onChange={(e) => onChange({ trigger: { ...trig, keyword: e.target.value } })} className={SETTINGS_FIELD_CLASS} />
            )}
          </Field>
        )}
      </div>

      {chatTrigger && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('liveStudio.rules.audience')}>
            {(id) => (
              <select id={id} className={selectClass} value={rule.audience} onChange={(e) => onChange({ audience: e.target.value as LiveRule['audience'] })}>
                {RULE_AUDIENCES.map((a) => (
                  <option key={a} value={a}>
                    {t(`liveStudio.rules.audiences.${a}`)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('liveStudio.rules.blockedWords')} hint={t('liveStudio.rules.blockedWordsHint')}>
            {(id) => (
              <Input
                id={id}
                value={rule.blockedWords.join(', ')}
                onChange={(e) =>
                  onChange({ blockedWords: e.target.value.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean).slice(0, 50) })
                }
                className={SETTINGS_FIELD_CLASS}
              />
            )}
          </Field>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('liveStudio.rules.cooldown')}>
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={0}
              max={3600}
              value={rule.cooldownSec}
              onChange={(e) => onChange({ cooldownSec: Math.min(3600, Math.max(0, Number(e.target.value) || 0)) })}
              className={SETTINGS_FIELD_CLASS}
            />
          )}
        </Field>
        {chatTrigger && (
          <Field label={t('liveStudio.rules.userCooldown')}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={0}
                max={3600}
                value={rule.userCooldownSec}
                onChange={(e) => onChange({ userCooldownSec: Math.min(3600, Math.max(0, Number(e.target.value) || 0)) })}
                className={SETTINGS_FIELD_CLASS}
              />
            )}
          </Field>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className={SETTINGS_LABEL_CLASS}>{t('liveStudio.rules.then')}</span>
          {rule.actions.length < MAX_ACTIONS && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost">
                  <Plus className="mr-1 h-4 w-4" />
                  {t('liveStudio.rules.addAction')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {RULE_ACTION_TYPES.map((type) => (
                  <DropdownMenuItem key={type} onSelect={() => addAction(type)}>
                    {t(`liveStudio.rules.actionTypes.${type}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <ul className="space-y-2">
          {rule.actions.map((action, i) => (
            <li key={i} className="rounded-lg bg-zinc-800/50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{t(`liveStudio.rules.actionTypes.${action.type}`)}</span>
                <button
                  onClick={() => removeAction(i)}
                  aria-label={t('liveStudio.rules.removeAction')}
                  className="rounded-md p-1 text-zinc-500 hover:bg-zinc-700 hover:text-white"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <ActionFields action={action} onChange={(next) => setAction(i, next)} />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-zinc-500">
          {t(rule.trigger.type === 'live' ? 'liveStudio.rules.placeholdersLive' : 'liveStudio.rules.placeholders')}
        </p>
      </div>
    </div>
  );
}

function ActionFields({ action, onChange }: { action: RuleAction; onChange: (next: RuleAction) => void }) {
  const { t } = useTranslation();
  const textField = (label: string, value: string, set: (v: string) => void) => (
    <Field label={label}>
      {(id) => <Input id={id} maxLength={200} value={value} onChange={(e) => set(e.target.value)} className={SETTINGS_FIELD_CLASS} />}
    </Field>
  );

  switch (action.type) {
    case 'alert':
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          {textField(t('liveStudio.rules.alertText'), action.text, (text) => onChange({ ...action, text }))}
          <Field label={t('liveStudio.fields.duration')}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={2}
                max={20}
                value={Math.round(action.durationMs / 1000)}
                onChange={(e) => onChange({ ...action, durationMs: Math.min(20, Math.max(2, Number(e.target.value) || 5)) * 1000 })}
                className={SETTINGS_FIELD_CLASS}
              />
            )}
          </Field>
        </div>
      );
    case 'sound':
      return (
        <Field label={t('liveStudio.rules.sound')}>
          {(id) => (
            <select id={id} className={selectClass} value={action.sound} onChange={(e) => onChange({ ...action, sound: e.target.value })}>
              {RULE_SOUNDS.map((sound) => (
                <option key={sound} value={sound}>
                  {t(`liveStudio.rules.sounds.${sound}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
      );
    case 'say':
      return textField(t('liveStudio.rules.sayText'), action.text, (text) => onChange({ ...action, text }));
    case 'chat':
      return (
        <>
          {textField(t('liveStudio.rules.chatText'), action.text, (text) => onChange({ ...action, text }))}
          <p className="mt-1.5 text-xs text-zinc-500">{t('liveStudio.rules.chatHint')}</p>
        </>
      );
    case 'webhook':
      return (
        <div className="space-y-3">
          <Field label={t('liveStudio.rules.webhookUrl')} hint={t('liveStudio.rules.webhookHint')}>
            {(id) => (
              <Input
                id={id}
                type="url"
                inputMode="url"
                maxLength={500}
                placeholder="https://discord.com/api/webhooks/…"
                value={action.url}
                onChange={(e) => onChange({ ...action, url: e.target.value.trim() })}
                className={SETTINGS_FIELD_CLASS}
              />
            )}
          </Field>
          {textField(t('liveStudio.rules.webhookText'), action.text, (text) => onChange({ ...action, text }))}
        </div>
      );
    case 'wheel':
      return (
        <Field label={t('liveStudio.rules.wheelSegments')} hint={t('liveStudio.rules.wheelHint')}>
          {(id) => (
            <Textarea
              id={id}
              rows={4}
              value={action.segments.join('\n')}
              onChange={(e) => onChange({ ...action, segments: e.target.value.split('\n').slice(0, WHEEL_MAX_SEGMENTS).map((s) => s.slice(0, 30)) })}
              className={SETTINGS_FIELD_CLASS}
            />
          )}
        </Field>
      );
    default:
      return null;
  }
}
