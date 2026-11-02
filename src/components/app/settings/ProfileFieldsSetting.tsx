import { Fragment, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Check, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import Plus from '@/components/ui/cut-icons/add';
import Trash from '@/components/ui/cut-icons/delete';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AuthContext } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import type { ProfileField } from '@/lib/api/dehub/profile-fields';
import {
  PROFILE_FIELD_PRESETS,
  fieldLink,
  isLinkPreset,
  normalizeFieldValue,
  presetById,
  presetOf,
  type ProfileFieldPresetId,
} from '@/lib/profile-field-presets';
import { PROFILE_FIELD_ICONS } from '@/components/app/profile/profileFieldIcons';
import { SETTINGS_HEADING_CLASS, SETTINGS_INLINE_ACTION_CLASS } from './SettingsRow';

export const MAX_PROFILE_FIELDS = 4;

export type FieldRow = { key: number; preset: ProfileFieldPresetId; name: string; value: string; verifiedAt?: string | null };

let nextKey = 1;
const rowOf = (field: ProfileField): FieldRow => {
  const preset = presetOf(field.name);
  return {
    key: nextKey++,
    preset,
    name: preset === 'custom' ? field.name || '' : presetById(preset)!.name,
    // Shown without https://, which is put back on save.
    value: isLinkPreset(preset) ? (field.value || '').replace(/^https:\/\//i, '') : field.value || '',
    verifiedAt: field.verifiedAt ?? null,
  };
};

/** What a row saves as, or null when the row is empty and so removed. */
export function rowToField(row: FieldRow): { name: string; value: string } | null {
  const value = normalizeFieldValue(row.preset, row.value);
  if (!value) return null;
  return { name: row.preset === 'custom' ? row.name.trim() : presetById(row.preset)!.name, value };
}

const keyOf = (fields: Array<{ name: string; value: string } | null>) =>
  JSON.stringify(fields.filter(Boolean).map((f) => [f!.name.trim(), f!.value.trim()]));

/**
 * Settings → Profile → Profile fields. Up to four lines on the profile, each
 * picked from a list (Website, Pronouns, …) or given a custom label. Website
 * and the other link kinds show with the profile's social links as an icon.
 * Saved on their own (PUT /profile-fields), because saving is also when the
 * server checks each link for a rel="me" back to this profile.
 */
export function ProfileFieldsSetting() {
  const { t } = useTranslation();
  // Not useAuth: the state gallery renders this without an AuthProvider.
  const auth = useContext(AuthContext);
  const user = auth?.user as (Record<string, unknown> & { profileFields?: ProfileField[]; username?: string; address?: string }) | null | undefined;
  const patchUser = auth?.patchUser;
  const queryClient = useQueryClient();
  const stored: ProfileField[] = Array.isArray(user?.profileFields) ? user.profileFields : [];
  const storedKey = JSON.stringify(stored);
  const [rows, setRows] = useState<FieldRow[]>(() => stored.slice(0, MAX_PROFILE_FIELDS).map(rowOf));
  const [saving, setSaving] = useState(false);

  // Pick up the stored fields once the account has loaded (or after a save).
  useEffect(() => {
    setRows(stored.slice(0, MAX_PROFILE_FIELDS).map(rowOf));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedKey]);

  const dirty = keyOf(rows.map(rowToField)) !== keyOf(stored);
  const username = String(user?.username || user?.address || '').replace(/^@/, '');

  const handleSave = async () => {
    if (rows.some((r) => r.preset === 'custom' && r.value.trim() && !r.name.trim())) {
      toast.error(t('profileFields.needsLabel', 'Give each custom field a label'));
      return;
    }
    setSaving(true);
    try {
      const { saveProfileFields } = await import('@/lib/api/dehub/profile-fields');
      const saved = await saveProfileFields(rows.map(rowToField).filter((f): f is { name: string; value: string } => !!f));
      patchUser?.({ profileFields: saved } as Parameters<NonNullable<typeof patchUser>>[0]);
      setRows(saved.map(rowOf));
      // The profile page reads its own copy of the account; refresh it so the
      // change (or the removal) shows there straight away.
      void queryClient.invalidateQueries({ queryKey: ['dehub-profile'] });
      toast.success(t('profileFields.saved'));
    } catch (error) {
      toast.error((error as Error)?.message || t('profileFields.failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-setting-anchor="profile-fields">
      <h3 className={SETTINGS_HEADING_CLASS}>{t('profileFields.title')}</h3>
      <p className="-mt-2 mb-4 text-xs text-zinc-500">{t('profileFields.descriptionPresets', 'Add a website, pronouns or anything else. Links show with your socials.')}</p>
      <ProfileFieldsEditor rows={rows} onChange={setRows} username={username} />
      {dirty && (
        <Button
          type="button"
          className={cn(SETTINGS_INLINE_ACTION_CLASS, 'mt-4')}
          onClick={() => void handleSave()}
          loading={saving}
        >
          {t('profileFields.save')}
        </Button>
      )}
    </div>
  );
}

/** The rows and the add button, without the account: also rendered on the state gallery. */
export function ProfileFieldsEditor({
  rows,
  onChange,
  username,
}: {
  rows: FieldRow[];
  onChange: (next: FieldRow[] | ((prev: FieldRow[]) => FieldRow[])) => void;
  username: string;
}) {
  const { t } = useTranslation();
  const focusKey = useRef<number | null>(null);
  const inputs = useRef(new Map<number, HTMLInputElement>());

  useEffect(() => {
    if (focusKey.current == null) return;
    inputs.current.get(focusKey.current)?.focus();
    focusKey.current = null;
  });

  const add = (preset: ProfileFieldPresetId) =>
    onChange((prev) => {
      if (prev.length >= MAX_PROFILE_FIELDS) return prev;
      const key = nextKey++;
      focusKey.current = key;
      return [...prev, { key, preset, name: preset === 'custom' ? '' : presetById(preset)!.name, value: '', verifiedAt: null }];
    });

  const patch = (key: number, next: Partial<FieldRow>) =>
    onChange((prev) => prev.map((row) => (row.key === key ? { ...row, ...next, verifiedAt: null } : row)));

  const remove = (key: number) => onChange((prev) => prev.filter((row) => row.key !== key));

  const showHint = rows.some((r) => !r.verifiedAt && fieldLink(normalizeFieldValue(r.preset, r.value)));
  const snippet = `<a rel="me" href="https://dehub.io/${username}">DeHub</a>`;

  return (
    <div>
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((row, index) => (
            <li key={row.key} className="flex items-center gap-2">
              <div className="flex h-11 min-w-0 flex-1 items-center rounded-xl border border-white/10 bg-white/[0.04] transition-colors focus-within:border-white/25">
                <PresetPicker
                  value={row.preset}
                  onPick={(preset) =>
                    patch(row.key, { preset, name: preset === 'custom' ? '' : presetById(preset)!.name })
                  }
                  compact={row.preset === 'custom'}
                  index={index}
                />
                {row.preset === 'custom' && (
                  <input
                    value={row.name}
                    onChange={(e) => patch(row.key, { name: e.target.value.slice(0, 30) })}
                    placeholder={t('profileFields.label')}
                    aria-label={`${t('profileFields.label')} ${index + 1}`}
                    maxLength={30}
                    className="h-full w-24 min-w-0 shrink-0 bg-transparent text-sm font-medium text-white placeholder:text-zinc-500 focus:outline-none sm:w-32"
                  />
                )}
                <span aria-hidden className="h-5 w-px shrink-0 bg-white/10" />
                <input
                  ref={(node) => {
                    if (node) inputs.current.set(row.key, node);
                    else inputs.current.delete(row.key);
                  }}
                  value={row.value}
                  onChange={(e) => patch(row.key, { value: e.target.value.slice(0, 200) })}
                  placeholder={placeholderFor(t, row.preset)}
                  aria-label={`${t('profileFields.content')} ${index + 1}`}
                  maxLength={200}
                  inputMode={isLinkPreset(row.preset) ? 'url' : undefined}
                  autoCapitalize={isLinkPreset(row.preset) ? 'none' : undefined}
                  className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
                />
                {row.verifiedAt && (
                  <span title={t('profileFields.verified')} className="mr-3 shrink-0">
                    <BadgeCheck className="size-4 text-emerald-400" aria-label={t('profileFields.verified')} />
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(row.key)}
                aria-label={`${t('profileFields.remove')} ${index + 1}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-white/5 hover:text-red-400 focus-visible:text-red-400"
              >
                <Trash className="size-[18px]" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows.length < MAX_PROFILE_FIELDS && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex h-10 items-center gap-1.5 rounded-full border border-white/10 pl-3 pr-4 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/5 hover:text-white',
                rows.length > 0 && 'mt-3',
              )}
            >
              <Plus className="size-4" />
              {t('profileFields.add')}
            </button>
          </DropdownMenuTrigger>
          <PresetMenu onPick={add} />
        </DropdownMenu>
      )}
      {showHint && <p className="mt-3 break-all text-xs text-zinc-500">{t('profileFields.verifyHint', { snippet })}</p>}
    </div>
  );
}

function placeholderFor(t: (k: string, d: string) => string, preset: ProfileFieldPresetId): string {
  if (isLinkPreset(preset)) return t('profileFields.placeholderLink', 'yoursite.com');
  if (preset === 'pronouns') return t('profileFields.placeholderPronouns', 'they/them');
  if (preset === 'location') return t('profileFields.placeholderLocation', 'City, country');
  return t('profileFields.content', 'Content');
}

function PresetPicker({
  value,
  onPick,
  compact,
  index,
}: {
  value: ProfileFieldPresetId;
  onPick: (id: ProfileFieldPresetId) => void;
  compact: boolean;
  index: number;
}) {
  const { t } = useTranslation();
  const Icon = PROFILE_FIELD_ICONS[value];
  const label = t(`profileFields.presets.${value}`, presetById(value)?.name ?? 'Custom');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${t('profileFields.type', 'Field type')} ${index + 1}: ${label}`}
          className="flex h-full shrink-0 items-center gap-1.5 rounded-l-xl pl-3 pr-2 text-sm font-medium text-zinc-200 transition-colors hover:text-white"
        >
          <Icon className="size-4 shrink-0" />
          {!compact && <span className="max-w-[6.5rem] truncate">{label}</span>}
          <ChevronDown className="size-3.5 shrink-0 text-zinc-500" />
        </button>
      </DropdownMenuTrigger>
      <PresetMenu onPick={onPick} selected={value} />
    </DropdownMenu>
  );
}

function PresetMenu({ onPick, selected }: { onPick: (id: ProfileFieldPresetId) => void; selected?: ProfileFieldPresetId }) {
  const { t } = useTranslation();
  const items = useMemo(() => [...PROFILE_FIELD_PRESETS.map((p) => p.id), 'custom' as const], []);
  return (
    <DropdownMenuContent align="start" className="z-[80] min-w-[12rem]">
      {items.map((id) => {
        const Icon = PROFILE_FIELD_ICONS[id];
        return (
          <Fragment key={id}>
            {id === 'custom' && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={() => onPick(id)} className="gap-2.5 py-2">
              <Icon className="size-4 shrink-0 text-zinc-400" />
              <span className="flex-1">
                {id === 'custom'
                  ? t('profileFields.presets.customOption', 'Custom label')
                  : t(`profileFields.presets.${id}`, presetById(id)!.name)}
              </span>
              {selected === id && <Check className="size-4 shrink-0 text-zinc-400" />}
            </DropdownMenuItem>
          </Fragment>
        );
      })}
    </DropdownMenuContent>
  );
}
