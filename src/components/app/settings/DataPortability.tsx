/**
 * Data Portability — Settings → Privacy → Your data
 * =================================================
 * Export replaces a "coming soon" button that had been sitting there; import
 * is what makes the export worth having. Moving to another account means
 * following the same people again, and a list you cannot act on is not
 * portable data.
 *
 * The import is deliberately two steps. Applying it follows accounts, restores
 * blocks and creates folders as you — side effects on a live account — so the
 * file is read and counted first, and the dialog says exactly what will happen
 * before anything is written.
 *
 * @module components/app/settings/DataPortability
 */

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SettingsRow } from '@/components/app/settings/SettingsRow';
import { useAuth } from '@/contexts/AuthContext';
import {
  applyImport,
  buildExport,
  downloadExport,
  parseExport,
  planImport,
  type ImportPlan,
} from '@/lib/data-portability';

export function DataPortability() {
  const { t } = useTranslation();
  const { user, walletAddress, isAuthenticated } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const address = user?.address || walletAddress || '';

  const handleExport = async () => {
    if (!address) return;
    setIsExporting(true);
    try {
      const data = await buildExport({
        address,
        username: user?.username,
        displayName: (user as { displayName?: string } | null)?.displayName,
      });
      downloadExport(data);
      toast.success(
        t('settings.exportReady', 'Your data is downloading — {{count}} accounts followed, {{saved}} saved posts.', {
          count: data.following.length,
          saved: data.savedPosts.length,
        }),
      );
    } catch (error) {
      console.error('[export]', error);
      toast.error(t('settings.exportFailed', 'Could not build your export. Try again.'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleFile = async (file: File) => {
    setIsPlanning(true);
    try {
      const data = parseExport(await file.text());
      const next = await planImport(data, address);
      setPlan(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'That file could not be read.';
      toast.error(message);
    } finally {
      setIsPlanning(false);
      // Same file twice in a row should still fire onChange.
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleApply = async () => {
    if (!plan) return;
    setIsApplying(true);
    setProgress({ done: 0, total: plan.toFollow.length + plan.toBlock.length + plan.data.bookmarkFolders.length });
    try {
      const result = await applyImport(plan, (done, total) => setProgress({ done, total }));
      toast.success(
        t('settings.importDone', 'Imported: {{followed}} followed, {{folders}} folders, {{items}} posts filed.', {
          followed: result.followed,
          folders: result.foldersCreated,
          items: result.itemsFiled,
        }),
      );
      if (result.followFailed > 0) {
        toast.info(
          t('settings.importPartial', '{{count}} accounts could not be followed — run the import again to retry them.', {
            count: result.followFailed,
          }),
        );
      }
    } catch (error) {
      console.error('[import]', error);
      toast.error(t('settings.importFailed', 'The import stopped early. What had already applied is kept.'));
    } finally {
      setIsApplying(false);
      setProgress(null);
      setPlan(null);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <>
      <SettingsRow
        icon={<Download />}
        title={t('settings.extractData')}
        description={t(
          'settings.extractDataDesc2',
          'Download who you follow, your blocks, saved posts, bookmark folders, follow groups and playback settings as one file.',
        )}
        action={
          <Button
            variant="outline"
            size="sm"
            disabled={isExporting || !address}
            onClick={handleExport}
            className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-xl"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('settings.download')}
          </Button>
        }
      />

      <SettingsRow
        icon={<Upload />}
        title={t('settings.importData', 'Import data')}
        description={t(
          'settings.importDataDesc',
          'Bring an export into this account: follow the same people, restore blocks, folders and groups. You see the numbers before anything is applied.',
        )}
        action={
          <>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={isPlanning || isApplying}
              onClick={() => fileRef.current?.click()}
              className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-xl"
            >
              {isPlanning ? <Loader2 className="w-4 h-4 animate-spin" /> : t('settings.chooseFile', 'Choose file')}
            </Button>
          </>
        }
      />

      <AlertDialog open={!!plan} onOpenChange={(open) => { if (!open && !isApplying) setPlan(null); }}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              {t('settings.importReview', 'Apply this import?')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {plan && (
                <span className="block space-y-1">
                  <span className="block">
                    From {plan.data.account.username || plan.data.account.address.slice(0, 10)}
                    {plan.data.exportedAt ? `, exported ${plan.data.exportedAt.slice(0, 10)}` : ''}.
                  </span>
                  <span className="block">· Follow {plan.toFollow.length} accounts{plan.alreadyFollowing > 0 ? ` (${plan.alreadyFollowing} already followed)` : ''}</span>
                  <span className="block">· Block {plan.toBlock.length} accounts</span>
                  <span className="block">· Create {plan.foldersToCreate.length} bookmark folders, fill {plan.foldersToFill}</span>
                  <span className="block">· Restore {plan.groups} follow groups and your playback settings</span>
                  <span className="block pt-1 text-zinc-500">
                    Following and blocking happen as you, on this account. Nothing is removed.
                  </span>
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {progress && (
            <p className="text-xs text-zinc-500">
              {t('settings.importProgress', 'Applying {{done}} of {{total}}…', progress)}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApplying} className="bg-zinc-800 border-zinc-700 text-white">
              {t('common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isApplying}
              onClick={(e) => { e.preventDefault(); void handleApply(); }}
              className="bg-white/10 border border-white/20 text-white hover:bg-white/20"
            >
              {isApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : t('settings.applyImport', 'Apply')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
