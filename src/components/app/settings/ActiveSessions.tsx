/**
 * Active sessions (Settings → Privacy & Security).
 *
 * Ported from mobile's `screens/ActiveSessionsScreen.tsx`. Same `/auth/sessions`
 * endpoints, same device labelling and relative-time rules, so a session listed
 * here matches what the phone shows. Web previously had no way to see or revoke
 * other devices at all.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Smartphone, Globe, Clock, LogOut, RefreshCw } from 'lucide-react';
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
import { fetchSessions, revokeSession, revokeOtherSessions, type Session } from '@/lib/api/dehub';

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function getDeviceLabel(session: Session): string {
  if (session.deviceName) return session.deviceName;
  if (session.platform === 'ios') return 'iPhone';
  if (session.platform === 'android') return 'Android Device';
  return 'Web Browser';
}

function getSubtitle(session: Session): string {
  const parts: string[] = [];
  if (session.platform === 'ios') parts.push('iOS');
  else if (session.platform === 'android') parts.push('Android');
  else parts.push('Web');
  if (session.osVersion) parts[0] += ` ${session.osVersion}`;
  if (session.appVersion) parts.push(`DeHub ${session.appVersion}`);
  return parts.join(' · ');
}

export function ActiveSessions() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<Session | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      setSessions(await fetchSessions());
    } catch {
      toast.error(t('settings.sessionsLoadFailed', 'Failed to load sessions'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(true); }, [load]);

  const handleRevoke = async (session: Session) => {
    setConfirmTarget(null);
    setRevoking(session.deviceId);
    try {
      await revokeSession(session.deviceId);
      setSessions((prev) => prev.filter((s) => s.deviceId !== session.deviceId));
      toast.success(t('settings.sessionRevoked', 'Device signed out'));
    } catch {
      toast.error(t('settings.sessionRevokeFailed', 'Could not sign out that device'));
    } finally {
      setRevoking(null);
    }
  };

  const handleRevokeAll = async () => {
    setConfirmAll(false);
    setRevokingAll(true);
    try {
      const count = await revokeOtherSessions();
      setSessions((prev) => prev.filter((s) => s.current));
      toast.success(
        count === 1
          ? t('settings.sessionsRevokedOne', '1 device signed out')
          : t('settings.sessionsRevokedMany', `${count} devices signed out`),
      );
    } catch {
      toast.error(t('settings.sessionsRevokeAllFailed', 'Could not sign out the other devices'));
    } finally {
      setRevokingAll(false);
    }
  };

  const others = sessions.filter((s) => !s.current);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-zinc-400 text-sm">
          {t('settings.activeSessions', 'Active sessions')}
        </h3>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="text-zinc-500 hover:text-white transition-colors disabled:opacity-50"
          aria-label={t('settings.refresh', 'Refresh')}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <p className="text-zinc-500 text-sm mb-4">
        {t('settings.activeSessionsDesc', 'Devices currently signed in to your account.')}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-zinc-800/50 rounded-xl border border-zinc-700/50 px-4 py-6 text-center">
          <p className="text-zinc-500 text-sm">
            {t('settings.noSessions', 'No active sessions found.')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const isRevoking = revoking === session.deviceId;
            const PlatformIcon =
              session.platform === 'ios' || session.platform === 'android' ? Smartphone : Globe;
            return (
              <div
                key={session.deviceId}
                className="bg-zinc-800/50 rounded-xl border border-zinc-700/50 px-4 py-3.5"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-zinc-700/50 flex items-center justify-center shrink-0">
                    <PlatformIcon className="w-5 h-5 text-zinc-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-semibold truncate">
                        {getDeviceLabel(session)}
                      </span>
                      {session.current && (
                        <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                          {t('settings.thisDevice', 'This device')}
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-500 text-xs mt-0.5 truncate">{getSubtitle(session)}</p>
                  </div>
                  {!session.current && (
                    <button
                      onClick={() => setConfirmTarget(session)}
                      disabled={isRevoking}
                      className="p-2 rounded-xl text-red-500 hover:bg-zinc-700/50 transition-colors disabled:opacity-50 shrink-0"
                      aria-label={t('settings.signOutDevice', 'Sign out device')}
                    >
                      {isRevoking ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <LogOut className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-2.5 text-zinc-500 text-xs">
                  <Clock className="w-3 h-3" />
                  <span>{formatRelativeTime(session.lastActiveAt)}</span>
                  {session.ip && (
                    <>
                      <span className="text-zinc-600">·</span>
                      <span>{session.ip}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {others.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmAll(true)}
          disabled={revokingAll}
          className="mt-4 bg-zinc-800 border-zinc-700 text-red-400 hover:bg-zinc-700 hover:text-red-300 rounded-md"
        >
          {revokingAll && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {t('settings.signOutAllOthers', 'Sign out all other devices')}
        </Button>
      )}

      <AlertDialog open={!!confirmTarget} onOpenChange={(v) => !v && setConfirmTarget(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              {t('settings.signOutDeviceTitle', 'Log out device?')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {t('settings.signOutDeviceDesc', {
                defaultValue:
                  'This will sign out "{{device}}". They\'ll need to log in again.',
                device: confirmTarget ? getDeviceLabel(confirmTarget) : '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
              {t('settings.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmTarget && void handleRevoke(confirmTarget)}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {t('settings.logOut', 'Log Out')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              {t('settings.signOutAllTitle', 'Sign out all other devices?')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {t('settings.signOutAllDesc', {
                defaultValue:
                  'This signs out {{count}} other device(s). This device stays signed in.',
                count: others.length,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
              {t('settings.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleRevokeAll()}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {t('settings.signOutAll', 'Sign out all')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
