/**
 * Quiet nudge to save the wallet backup, on the Wallet page only. Shows no
 * earlier than 2 days after the wallet was made, at most every 3 days, and
 * never again after 3 "Not now" taps or once the backup is saved on any
 * device (see lib/wallet-core/backup-status).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import {
  dismissBackupReminder,
  getBackupStatus,
  shouldRemindBackup,
  type BackupStatus,
} from '@/lib/wallet-core/backup-status';

export function BackupReminderBanner() {
  const { supabaseUserId } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!supabaseUserId) return;
    let cancelled = false;
    getBackupStatus(supabaseUserId).then((s) => { if (!cancelled) setStatus(s); });
    return () => { cancelled = true; };
  }, [supabaseUserId]);

  if (hidden || !supabaseUserId || !shouldRemindBackup(status)) return null;

  return (
    <BackupReminderCard
      onBackUp={() => navigate('/app/settings?highlight=wallet-recovery&backup=1')}
      onLater={() => {
        setHidden(true);
        if (status) void dismissBackupReminder(supabaseUserId, status);
      }}
    />
  );
}

/** The banner itself, without the status plumbing (also shown in the state gallery). */
export function BackupReminderCard({ onBackUp, onLater }: { onBackUp: () => void; onLater: () => void }) {
  const { t } = useTranslation();
  return (
    <div data-page-bento className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 mb-4 flex items-start gap-3">
      <ShieldCheck className="w-5 h-5 mt-0.5 text-white shrink-0" />
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <p className="text-white font-medium text-sm">{t('walletBackup.reminderTitle', 'Back up your wallet')}</p>
          <p className="text-zinc-400 text-sm">
            {t('walletBackup.reminderBody', '12 words that bring it back if you lose your phone or password.')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={onBackUp}
            className="h-9 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
          >
            {t('walletBackup.reminderAction', 'Back up')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onLater}
            className="h-9 bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-xl"
          >
            {t('walletBackup.reminderLater', 'Not now')}
          </Button>
        </div>
      </div>
    </div>
  );
}
