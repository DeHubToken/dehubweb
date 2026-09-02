/**
 * Folders over the generation library.
 * ====================================
 * A chip row that filters "Your generations" by folder, and a picker on a
 * result that files it. Folder membership syncs to the account when signed
 * in and stays on the device otherwise, like the library itself.
 */
import { useState } from 'react';
import { Check, FolderPlus, Folder as FolderIcon, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useCreatorFolderStore } from '@/store/creatorFolderStore';
import { cn } from '@/lib/utils';

export function FolderBar() {
  const { t } = useTranslation();
  const folders = useCreatorFolderStore((s) => s.folders);
  const selected = useCreatorFolderStore((s) => s.selectedFolderId);
  const itemFolderMap = useCreatorFolderStore((s) => s.itemFolderMap);
  const selectFolder = useCreatorFolderStore((s) => s.selectFolder);
  const createFolder = useCreatorFolderStore((s) => s.createFolder);
  const renameFolder = useCreatorFolderStore((s) => s.renameFolder);
  const deleteFolder = useCreatorFolderStore((s) => s.deleteFolder);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const countFor = (id: string) => Object.values(itemFolderMap).filter((ids) => ids.includes(id)).length;

  const create = async () => {
    const name = window.prompt(t('creatorFlow.foldersNewPrompt'))?.trim();
    if (!name) return;
    const f = await createFolder(name);
    selectFolder(f.id);
  };

  const commitRename = () => {
    if (renaming && draft.trim()) void renameFolder(renaming, draft.trim().slice(0, 80));
    setRenaming(null);
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => selectFolder(null)}
        className={cn('h-7 rounded-full border px-3 text-[11px] font-medium transition', selected === null ? 'border-white/40 bg-white/20 text-white' : 'border-white/10 bg-white/5 text-white/60 hover:border-white/25 hover:text-white')}
      >
        {t('creatorFlow.foldersAll')}
      </button>
      {folders.map((f) => (
        <div key={f.id} className={cn('group flex h-7 items-center rounded-full border transition', selected === f.id ? 'border-white/40 bg-white/20 text-white' : 'border-white/10 bg-white/5 text-white/60 hover:border-white/25 hover:text-white')}>
          {renaming === f.id ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenaming(null);
              }}
              className="w-28 bg-transparent px-3 text-[11px] text-white outline-none"
            />
          ) : (
            <button type="button" onClick={() => selectFolder(f.id)} className="flex items-center gap-1.5 pl-3 pr-1 text-[11px] font-medium">
              <FolderIcon size={11} />
              {f.name}
              <span className="text-[10px] tabular-nums opacity-60">{countFor(f.id)}</span>
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={t('creatorFlow.flowOptions')} className="mr-1 flex h-5 w-5 items-center justify-center rounded-full opacity-0 transition hover:bg-white/10 group-hover:opacity-100 data-[state=open]:opacity-100">
                <MoreHorizontal size={12} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="border-white/10 bg-zinc-950/95 text-white backdrop-blur-xl">
              <DropdownMenuItem onSelect={() => { setRenaming(f.id); setDraft(f.name); }}><Pencil size={13} className="mr-2" /> {t('creatorFlow.foldersRename')}</DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem onSelect={() => { if (window.confirm(t('creatorFlow.foldersDeleteConfirm', { name: f.name }))) void deleteFolder(f.id); }}><Trash2 size={13} className="mr-2" /> {t('creatorFlow.foldersDelete')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
      <button
        type="button"
        onClick={() => void create()}
        title={t('creatorFlow.foldersNew')}
        aria-label={t('creatorFlow.foldersNew')}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:border-white/25 hover:text-white"
      >
        <FolderPlus size={13} />
      </button>
    </div>
  );
}

export function FolderPicker({ itemId }: { itemId: string }) {
  const { t } = useTranslation();
  const folders = useCreatorFolderStore((s) => s.folders);
  const memberOf = useCreatorFolderStore((s) => s.itemFolderMap[itemId] ?? []);
  const assign = useCreatorFolderStore((s) => s.assignItemsToFolder);
  const unassign = useCreatorFolderStore((s) => s.removeItemsFromFolder);
  const createFolder = useCreatorFolderStore((s) => s.createFolder);

  const createAndFile = async () => {
    const name = window.prompt(t('creatorFlow.foldersNewPrompt'))?.trim();
    if (!name) return;
    const f = await createFolder(name);
    await assign([itemId], f.id);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2.5 text-[13px] font-medium text-white/85 transition hover:border-white/30 hover:bg-white/[0.12] hover:text-white"
        >
          <FolderIcon className="h-4 w-4" />
          {memberOf.length > 0 ? t('creatorFlow.foldersInFolder', { count: memberOf.length }) : t('creatorFlow.foldersAddTo')}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px] border-white/10 bg-zinc-950/95 text-white backdrop-blur-xl">
        {folders.length === 0 && <p className="px-2 py-1.5 text-[12px] text-zinc-400">{t('creatorFlow.foldersEmpty')}</p>}
        {folders.map((f) => {
          const on = memberOf.includes(f.id);
          return (
            <DropdownMenuItem key={f.id} onSelect={(e) => { e.preventDefault(); void (on ? unassign([itemId], f.id) : assign([itemId], f.id)); }}>
              <span className={cn('mr-2 flex h-4 w-4 items-center justify-center rounded border', on ? 'border-white bg-white text-black' : 'border-white/30')}>{on && <Check size={11} />}</span>
              {f.name}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem onSelect={() => void createAndFile()}><FolderPlus size={13} className="mr-2" /> {t('creatorFlow.foldersNew')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
