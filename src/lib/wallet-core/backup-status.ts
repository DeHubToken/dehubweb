// Whether the person has saved their wallet backup (12 words or private key).
// Shared with the app through public.wallet_backup_status, so saving on one
// device stops the reminders everywhere. Holds no secret. Every call is best
// effort: a failure means "unknown", and unknown shows no reminder.
import { supabase } from "@/integrations/supabase/client";

export interface BackupStatus {
  backedUpAt: string | null;
  remindersDismissed: number;
  lastDismissedAt: string | null;
  /** When the current wallet was first saved, for the reminder delay. */
  walletCreatedAt: string | null;
  /** The current wallet's address as stored in user_wallets (the owner key, not the Safe). */
  walletAddress: string | null;
}

/** Reminders stop for good after this many "Not now" taps. */
export const MAX_BACKUP_REMINDERS = 3;
const FIRST_REMINDER_AFTER_MS = 2 * 24 * 60 * 60 * 1000;
const BETWEEN_REMINDERS_MS = 3 * 24 * 60 * 60 * 1000;

// Not in the generated Database types yet — cast through the untyped client.
function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase as any;
}

export async function getBackupStatus(userId: string): Promise<BackupStatus | null> {
  try {
    const [statusRes, walletRes] = await Promise.all([
      db().from("wallet_backup_status")
        .select("eth_address, backed_up_at, reminders_dismissed, last_dismissed_at")
        .eq("user_id", userId).maybeSingle(),
      db().from("user_wallets").select("eth_address, created_at").eq("user_id", userId).maybeSingle(),
    ]);
    if (statusRes.error) throw statusRes.error;
    if (walletRes.error) throw walletRes.error;
    const ethAddress: string | null = walletRes.data?.eth_address ?? null;
    if (!ethAddress) return null;
    const row = statusRes.data;
    // A row for another address belongs to a wallet this account replaced.
    const current = row && String(row.eth_address).toLowerCase() === ethAddress.toLowerCase() ? row : null;
    return {
      backedUpAt: current?.backed_up_at ?? null,
      remindersDismissed: current?.reminders_dismissed ?? 0,
      lastDismissedAt: current?.last_dismissed_at ?? null,
      walletCreatedAt: walletRes.data?.created_at ?? null,
      walletAddress: ethAddress,
    };
  } catch (err) {
    console.warn("[WalletBackup] Could not read backup status:", err);
    return null;
  }
}

export async function markBackedUp(userId: string, ethAddress: string): Promise<void> {
  try {
    const now = new Date().toISOString();
    const { error } = await db().from("wallet_backup_status").upsert({
      user_id: userId,
      eth_address: ethAddress.toLowerCase(),
      backed_up_at: now,
      reminders_dismissed: 0,
      last_dismissed_at: null,
      updated_at: now,
    }, { onConflict: "user_id" });
    if (error) throw error;
  } catch (err) {
    console.warn("[WalletBackup] Could not record the backup:", err);
  }
}

export async function dismissBackupReminder(userId: string, current: BackupStatus): Promise<void> {
  const ethAddress = current.walletAddress;
  if (!ethAddress) return;
  try {
    const now = new Date().toISOString();
    const { error } = await db().from("wallet_backup_status").upsert({
      user_id: userId,
      eth_address: ethAddress.toLowerCase(),
      backed_up_at: null,
      reminders_dismissed: current.remindersDismissed + 1,
      last_dismissed_at: now,
      updated_at: now,
    }, { onConflict: "user_id" });
    if (error) throw error;
  } catch (err) {
    console.warn("[WalletBackup] Could not record the dismissal:", err);
  }
}

/**
 * Quiet by design: nothing in the first 2 days, then at most one reminder
 * every 3 days, and never again after 3 "Not now" taps or once backed up.
 */
export function shouldRemindBackup(status: BackupStatus | null, now: number = Date.now()): boolean {
  if (!status || status.backedUpAt) return false;
  if (status.remindersDismissed >= MAX_BACKUP_REMINDERS) return false;
  const created = status.walletCreatedAt ? Date.parse(status.walletCreatedAt) : NaN;
  if (Number.isNaN(created) || now - created < FIRST_REMINDER_AFTER_MS) return false;
  if (status.lastDismissedAt && now - Date.parse(status.lastDismissedAt) < BETWEEN_REMINDERS_MS) return false;
  return true;
}
