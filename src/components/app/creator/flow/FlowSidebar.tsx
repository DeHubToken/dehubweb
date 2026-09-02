/**
 * Creator Flow — the flows list.
 * ==============================
 * Every flow the creator has, the one that is open, sync state, and a way to start
 * a fresh canvas or the UGC starter.
 */
import { useState } from 'react';
import { Check, Cloud, CloudOff, Copy, Globe, Loader2, MoreHorizontal, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { removeFlow } from '@/lib/creator/flow/api';
import { makeUgcTemplate } from '@/lib/creator/flow/templates';
import type { SyncStatus } from '@/lib/creator/flow/useFlowSync';
import { useCreatorFlowStore } from '@/store/creatorFlowStore';
import { cn } from '@/lib/utils';

interface Props {
  syncStatus: SyncStatus;
  lastSyncedAt: Date | null;
  signedIn: boolean;
  onSignIn: () => void;
  collapsed: boolean;
  onToggle: () => void;
}

function timeAgo(date: Date, t: (k: string, o?: Record<string, unknown>) => string): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 10) return t('creatorFlow.justNow');
  if (s < 60) return t('creatorFlow.secondsAgo', { count: s });
  const m = Math.floor(s / 60);
  if (m < 60) return t('creatorFlow.minutesAgo', { count: m });
  const h = Math.floor(m / 60);
  return t('creatorFlow.hoursAgo', { count: h });
}

export default function FlowSidebar({ syncStatus, lastSyncedAt, signedIn, onSignIn, collapsed, onToggle }: Props) {
  const { t } = useTranslation();
  const flows = useCreatorFlowStore((s) => s.flows);
  const activeFlowId = useCreatorFlowStore((s) => s.activeFlowId);
  const createFlow = useCreatorFlowStore((s) => s.createFlow);
  const switchFlow = useCreatorFlowStore((s) => s.switchFlow);
  const renameFlow = useCreatorFlowStore((s) => s.renameFlow);
  const deleteFlow = useCreatorFlowStore((s) => s.deleteFlow);
  const duplicateFlow = useCreatorFlowStore((s) => s.duplicateFlow);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const commitRename = () => {
    if (renaming && draft.trim()) renameFlow(renaming, draft.trim().slice(0, 80));
    setRenaming(null);
  };

  const handleDelete = (id: string) => {
    const flow = flows.find((f) => f.id === id);
    if (!flow) return;
    if (flow.nodes.length > 0 && !window.confirm(t('creatorFlow.deleteFlowConfirm', { name: flow.name }))) return;
    deleteFlow(id);
    if (signedIn) removeFlow(id).catch(() => undefined);
  };

  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center gap-2 border-r border-white/10 bg-zinc-950/80 py-3 backdrop-blur-xl">
        <button type="button" onClick={onToggle} title={t('creatorFlow.showFlows')} aria-label={t('creatorFlow.showFlows')} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white">
          <MoreHorizontal size={16} />
        </button>
        <button type="button" onClick={() => createFlow()} title={t('creatorFlow.newFlow')} aria-label={t('creatorFlow.newFlow')} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white hover:bg-white/20">
          <Plus size={15} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r border-white/10 bg-zinc-950/80 backdrop-blur-xl">
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">{t('creatorFlow.flows')}</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => createFlow()} title={t('creatorFlow.newFlow')} aria-label={t('creatorFlow.newFlow')} className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white transition hover:bg-white/20">
            <Plus size={14} />
          </button>
          <button type="button" onClick={onToggle} title={t('creatorFlow.hideFlows')} aria-label={t('creatorFlow.hideFlows')} className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white">
            <X size={14} />
          </button>
        </div>
      </div>

      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2">
        {flows.map((f) => {
          const active = f.id === activeFlowId;
          return (
            <li key={f.id} className={cn('group flex items-center gap-1 rounded-lg', active ? 'bg-white/10' : 'hover:bg-white/5')}>
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
                  className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-[13px] text-white outline-none"
                />
              ) : (
                <button type="button" onClick={() => switchFlow(f.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left">
                  {f.isPublic && <Globe size={11} className="shrink-0 text-white/60" />}
                  <span className={cn('truncate text-[13px]', active ? 'text-white' : 'text-white/70')}>{f.name}</span>
                  <span className="ml-auto shrink-0 text-[10px] tabular-nums text-white/30">{f.nodes.length}</span>
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label={t('creatorFlow.flowOptions')} className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/40 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100 data-[state=open]:opacity-100">
                    <MoreHorizontal size={13} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="border-white/10 bg-zinc-950/95 text-white backdrop-blur-xl">
                  <DropdownMenuItem onSelect={() => { setRenaming(f.id); setDraft(f.name); }}><Pencil size={13} className="mr-2" /> {t('creatorFlow.rename')}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => duplicateFlow(f.id)}><Copy size={13} className="mr-2" /> {t('creatorFlow.duplicate')}</DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem onSelect={() => handleDelete(f.id)}><Trash2 size={13} className="mr-2" /> {t('creatorFlow.delete')}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-white/10 p-2">
        <button
          type="button"
          onClick={() => createFlow(t('creatorFlow.ugcStarterName'), makeUgcTemplate())}
          className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-left text-[12px] text-white/80 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
        >
          <Sparkles size={13} />
          <span className="min-w-0">
            <span className="block font-medium">{t('creatorFlow.ugcStarter')}</span>
            <span className="block truncate text-[10.5px] text-white/45">{t('creatorFlow.ugcStarterHint')}</span>
          </span>
        </button>
      </div>

      <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2 text-[11px] text-white/45">
        {signedIn ? (
          <>
            {syncStatus === 'syncing' ? <Loader2 size={12} className="animate-spin" /> : syncStatus === 'error' ? <CloudOff size={12} /> : syncStatus === 'synced' ? <Check size={12} /> : <Cloud size={12} />}
            <span className="truncate">
              {syncStatus === 'syncing' ? t('creatorFlow.syncing') : syncStatus === 'error' ? t('creatorFlow.syncError') : lastSyncedAt ? t('creatorFlow.savedAgo', { when: timeAgo(lastSyncedAt, t) }) : t('creatorFlow.savedToAccount')}
            </span>
          </>
        ) : (
          <button type="button" onClick={onSignIn} className="flex items-center gap-2 text-left text-white/60 hover:text-white">
            <CloudOff size={12} />
            <span>{t('creatorFlow.guestModeHint')}</span>
          </button>
        )}
      </div>
    </aside>
  );
}
