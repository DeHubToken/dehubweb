import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(resolve(__dirname, '../pages/app/DaoPage.tsx'), 'utf8');

describe('DAO contribution wallet flow', () => {
  it('opens the unlock sheet before attempting a transfer from a locked wallet', () => {
    expect(page).toContain('const walletLocked = useWalletLocked()');
    expect(page).toMatch(/if \(walletLocked\) \{\s*queueAfterUnlock\(parsed\);/);
    expect(page).toContain('window.requestAnimationFrame(() => requestWalletUnlock())');
  });

  it('resumes the pending amount after unlock and disarms it after cancellation', () => {
    expect(page).toContain('sendContribution(value)');
    expect(page).toMatch(/if \(walletLocked\) \{\s*onOpenChange\(true\);\s*return;/);
    expect(page).toContain('setPendingAfterUnlock(null)');
  });

  it('does not present wallet unlock as a failed DAO transfer', () => {
    expect(page).toContain('if (isWalletLockedError(err))');
    expect(page).toContain("toastTxError(err, t('dao.sendFailed')");
    expect(page).not.toContain("toast.error(t('dao.sendFailed')");
  });
});
