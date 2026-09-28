/**
 * The badge gate and pack chooser shared by every "add to a pack" form.
 *
 * The server decides — the `creator-packs` function reads the caller's badge
 * and refuses past the tier's caps. What lives here only mirrors that so the
 * form can say "you need a badge" or "this pack is full" before a round trip.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  MAX_PACK_UPLOAD_BYTES,
  PackError,
  createPack,
  useInvalidatePacks,
  useOwnedPacks,
  usePackStatus,
  type CreatorPack,
  type PackKind,
} from '@/lib/creator-packs/api';

/** A user-facing message for anything the packs API throws. */
export function packErrorMessage(err: unknown, t: TFunction, kind: PackKind = 'emoji'): string {
  const code = err instanceof PackError ? err.code : undefined;
  switch (code) {
    case 'NO_BADGE':
      return t('creatorPacks.errors.noBadge');
    case 'PACK_LIMIT':
      return t('creatorPacks.errors.packLimit');
    case 'ITEM_LIMIT':
      return t('creatorPacks.errors.itemLimit');
    case 'FILE_TYPE':
      return t('creatorPacks.errors.fileType');
    case 'FILE_SIZE':
      return t('creatorPacks.errors.fileSize', { mb: MAX_PACK_UPLOAD_BYTES[kind] / (1024 * 1024) });
    default:
      return t('creatorPacks.errors.generic');
  }
}

export function PackLocked({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={cn('flex flex-col items-center gap-2 text-center', compact ? 'px-3 py-5' : 'px-6 py-10')}>
      <Lock className="w-5 h-5 text-zinc-400" />
      <p className="text-sm font-medium text-white">{t('creatorPacks.lockedTitle')}</p>
      <p className="text-xs text-zinc-400 max-w-xs leading-snug">{t('creatorPacks.lockedBody')}</p>
      <div className="flex gap-2 mt-1">
        <Link to="/stake" className="h-8 px-3 rounded-md bg-white text-black text-xs font-medium flex items-center">
          {t('creatorPacks.getBadge')}
        </Link>
        <Link to="/packs" className="h-8 px-3 rounded-md border border-white/15 text-xs text-white flex items-center">
          {t('creatorPacks.browse')}
        </Link>
      </div>
    </div>
  );
}

const NEW = '__new__';

/**
 * Which of your packs of `kind` the form adds to, or a new one by name.
 * `ensurePack` creates the new one on submit, so an abandoned form never
 * leaves an empty pack behind.
 */
export function usePackTarget(wallet: string | null | undefined, kind: PackKind) {
  const status = usePackStatus(wallet);
  const owned = useOwnedPacks(wallet);
  const invalidate = useInvalidatePacks();
  const packs = (owned.data ?? []).filter((p) => p.kind === kind);
  const [choice, setChoice] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const limits = status.data?.limits;
  const canCreate = !!limits && packs.length < limits.packs;
  const selected = choice === NEW ? null : packs.find((p) => p.id === choice) ?? (choice ? null : packs[0] ?? null);
  const creating = choice === NEW || (!selected && canCreate);
  const room = limits ? (selected ? Math.max(0, limits.items[kind] - selected.item_count) : limits.items[kind]) : 0;

  const ensurePack = async (): Promise<CreatorPack> => {
    if (selected) return selected;
    const pack = await createPack(kind, newName.trim());
    setChoice(pack.id);
    setNewName('');
    await invalidate();
    return pack;
  };

  return {
    loading: status.isLoading || owned.isLoading,
    locked: !!status.data && status.data.limits.packs === 0,
    limits,
    packs,
    selected,
    creating,
    canCreate,
    room,
    newName,
    setNewName,
    choice: creating ? NEW : selected?.id ?? '',
    setChoice,
    ready: creating ? !!newName.trim() : !!selected && room > 0,
    ensurePack,
    invalidate,
  };
}

export type PackTarget = ReturnType<typeof usePackTarget>;

export function PackTargetField({ target, kind }: { target: PackTarget; kind: PackKind }) {
  const { t } = useTranslation();
  const input =
    'w-full min-w-0 h-8 px-2 rounded-md bg-white/5 border border-white/10 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-white/30';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <select
          value={target.choice}
          onChange={(e) => target.setChoice(e.target.value)}
          aria-label={t('creatorPacks.pack')}
          className={cn(input, 'flex-1')}
        >
          {target.packs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.item_count}/{target.limits?.items[kind] ?? '–'})
            </option>
          ))}
          {target.canCreate && <option value={NEW}>{t('creatorPacks.newPackOption')}</option>}
        </select>
      </div>
      {target.creating && (
        <input
          value={target.newName}
          onChange={(e) => target.setNewName(e.target.value.slice(0, 64))}
          placeholder={t('creatorPacks.packNamePlaceholder')}
          className={input}
        />
      )}
      {!target.creating && target.selected && target.room === 0 && (
        <p className="text-[10px] text-amber-400 leading-snug">{t('creatorPacks.errors.itemLimit')}</p>
      )}
    </div>
  );
}
