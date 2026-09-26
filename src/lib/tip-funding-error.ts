/**
 * Errors from paying in DHB with another token, carried as a translation key
 * so the sheet shows them in the reader's language. The English message is the
 * fallback and what lands in logs.
 *
 * Kept apart from lib/tip-funding so the toast wrapper and eager surfaces can
 * recognise these without importing the wallet stack.
 */
import type { TFunction } from 'i18next';

export type FundingErrorKey =
  | 'noRoute'
  | 'lowLiquidity'
  | 'dpayNoAmount'
  | 'dpayDelayed'
  | 'noBridgeRoute'
  | 'bridgeCancelled'
  | 'bridgeSlow'
  | 'txFailed'
  | 'noToken'
  | 'notEnoughOnBase'
  | 'notEnoughWithFees'
  | 'notEnough'
  | 'noGasForFee'
  | 'priceMoved'
  | 'usdcPending'
  | 'dhbPending';

export class FundingError extends Error {
  constructor(
    readonly key: FundingErrorKey,
    message: string,
    readonly vars: Record<string, string | number> = {},
  ) {
    super(message);
    this.name = 'FundingError';
  }
}

/** What to show for an error thrown while funding a payment. */
export function fundingErrorText(t: TFunction, error: unknown): string {
  if (error instanceof FundingError) {
    return t(`tipFunding.${error.key}`, { ...error.vars, defaultValue: error.message });
  }
  return error instanceof Error ? error.message : String(error);
}
