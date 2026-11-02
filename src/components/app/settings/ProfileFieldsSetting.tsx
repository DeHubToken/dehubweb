import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import type { ProfileField } from '@/lib/api/dehub/profile-fields';
import { SETTINGS_FIELD_CLASS, SETTINGS_HEADING_CLASS, SETTINGS_INLINE_ACTION_CLASS } from './SettingsRow';

const ROWS = 4;
const blank = (): ProfileField => ({ name: '', value: '' });

/**
 * Settings → Profile → Profile fields. Up to four label/value rows shown
 * under the bio. Starts with one row; "+" adds more. Saved on their own (PUT /profile-fields), because saving is also when
 * the server checks each link for a rel="me" back to this profile.
 */
export function ProfileFieldsSetting() {
  const { t } = useTranslation();
  const { user, patchUser } = useAuth() as any;
  const stored: ProfileField[] = Array.isArray(user?.profileFields) ? user.profileFields : [];
  const [rows, setRows] = useState<ProfileField[]>(() => padRows(stored));
  const [saving, setSaving] = useState(false);
  const storedKey = JSON.stringify(stored);

  // Pick up the stored fields once the account has loaded (or after a save).
  useEffect(() => {
    setRows(padRows(stored));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedKey]);

  const username = String(user?.username || user?.address || '').replace(/^@/, '');
  const snippet = `<a rel="me" href="https://dehub.io/${username}">DeHub</a>`;

  const addRow = () => setRows((prev) => (prev.length < ROWS ? [...prev, blank()] : prev));
  const removeRow = (index: number) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : [blank()]));

  const update = (index: number, key: 'name' | 'value', text: string) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: text, verifiedAt: null } : row)));

  const handleSave = async () => {
    setSaving(true);
    try {
      const { saveProfileFields } = await import('@/lib/api/dehub/profile-fields');
      const saved = await saveProfileFields(
        rows.filter((row) => row.name.trim() || row.value.trim()).map(({ name, value }) => ({ name, value })),
      );
      patchUser?.({ profileFields: saved });
      setRows(padRows(saved));
      toast.success(t('profileFields.saved'));
    } catch (error: any) {
      toast.error(error?.message || t('profileFields.failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-setting-anchor="profile-fields">
      <h3 className={SETTINGS_HEADING_CLASS}>{t('profileFields.title')}</h3>
      <p className="-mt-2 mb-4 text-xs text-zinc-500">{t('profileFields.description')}</p>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="flex gap-2">
            <Input
              value={row.name}
              onChange={(e) => update(index, 'name', e.target.value.slice(0, 30))}
              placeholder={t('profileFields.label')}
              aria-label={`${t('profileFields.label')} ${index + 1}`}
              maxLength={30}
              className={cn(SETTINGS_FIELD_CLASS, 'w-32 shrink-0 sm:w-40')}
            />
            <div className="relative min-w-0 flex-1">
              <Input
                value={row.value}
                onChange={(e) => update(index, 'value', e.target.value.slice(0, 200))}
                placeholder={t('profileFields.content')}
                aria-label={`${t('profileFields.content')} ${index + 1}`}
                maxLength={200}
                className={cn(SETTINGS_FIELD_CLASS, row.verifiedAt && 'pr-9')}
              />
              {row.verifiedAt && (
                <span title={t('profileFields.verified')} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <BadgeCheck className="size-4 text-emerald-400" aria-label={t('profileFields.verified')} />
                </span>
              )}
            </div>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(index)}
                aria-label={`${t('profileFields.remove')} ${index + 1}`}
                className="flex h-10 w-8 shrink-0 items-center justify-center text-zinc-500 hover:text-white"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      {rows.length < ROWS && (
        <button
          type="button"
          onClick={addRow}
          aria-label={t('profileFields.add')}
          className="mt-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-zinc-300 hover:bg-white/5 hover:text-white"
        >
          <Plus className="size-4" />
        </button>
      )}
      <p className="mt-3 text-xs text-zinc-500 break-all">{t('profileFields.verifyHint', { snippet })}</p>
      <Button
        type="button"
        variant="outline"
        className={cn(SETTINGS_INLINE_ACTION_CLASS, 'mt-3')}
        onClick={() => void handleSave()}
        loading={saving}
      >
        {t('profileFields.save')}
      </Button>
    </div>
  );
}

function padRows(fields: ProfileField[]): ProfileField[] {
  const rows: ProfileField[] = fields.slice(0, ROWS).map((f) => ({ name: f.name || '', value: f.value || '', verifiedAt: f.verifiedAt ?? null }));
  if (rows.length === 0) rows.push(blank());
  return rows;
}
