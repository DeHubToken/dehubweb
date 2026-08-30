import { toast } from 'sonner';
import { isWalletLockedError, parseTxError } from '@/lib/contracts/aa-utils';

/**
 * Toast a transaction failure — unless nothing failed.
 *
 * Every signing surface (tips, DM fees, entry gates, paid content, staking,
 * subscriptions, sends) used to end its catch block with its own
 * `toast.error(parseTxError(e) || 'X failed')`. That is correct for a revert,
 * a paused token or an empty balance. It was wrong for the single most common
 * case: the built-in wallet locks itself, signing stops to ask for the
 * password, and the user watched a "failed" toast slide in *underneath the
 * password sheet that was waiting for them*. Several stopped there, believing
 * the payment had broken.
 *
 * A locked wallet is already handled — AuthProvider opens the unlock sheet and
 * raises one toast that explains it and links to the frequency setting. So
 * here the only correct thing to do is nothing.
 *
 * Returns whether a toast was shown, for callers that also want to skip other
 * failure-only side effects.
 */
export function toastTxError(
  error: unknown,
  fallback: string,
  options?: { id?: string; context?: string; description?: string; duration?: number },
): boolean {
  if (isWalletLockedError(error)) return false;
  const { context, ...toastOptions } = options ?? {};
  toast.error(parseTxError(error, context ?? 'transaction') || fallback, toastOptions);
  return true;
}
