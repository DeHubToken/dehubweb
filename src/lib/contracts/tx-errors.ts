/**
 * Transaction error wording.
 * ==========================
 * Kept apart from aa-utils so the toast that shows a failed payment does not
 * pull the whole wallet stack (wagmi, viem, web3auth) into every page that
 * might show one. aa-utils re-exports all of it, so existing imports work.
 */

import i18n from 'i18next';
import type { ChainId } from '@/components/app/ChainSelector';
import { CHAIN_CONFIGS } from './dhb-token';
import { userOperationErrorDetail, userOperationValidationMessage } from '@/lib/user-operation-error';
import { translateCopy as _translateCopy } from '@/i18n/copy';

/**
 * Marker on the error thrown when signing stopped to ask for the password.
 * See isWalletLockedError.
 */
export const WALLET_LOCKED_ERROR_CODE = 'WALLET_LOCKED';

/**
 * Marker on the error thrown when signing stopped to ask a signed-in
 * external-wallet session to connect its wallet (the connect sheet is up).
 */
export const WALLET_NOT_CONNECTED_ERROR_CODE = 'WALLET_NOT_CONNECTED';

/**
 * True when signing stopped to ask the session to connect its wallet.
 * parseTxError checks this before the locked case so the two prompts keep
 * their own words.
 */
export function isWalletConnectRequiredError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { code?: unknown; message?: unknown };
  if (e.code === WALLET_NOT_CONNECTED_ERROR_CODE) return true;
  const message = typeof e.message === 'string' ? e.message : String(error);
  return message.toLowerCase().includes('connect the wallet linked');
}

/**
 * True when the only thing wrong is that signing stopped to prompt the user —
 * the unlock sheet for a locked built-in wallet, or the connect sheet for an
 * external-wallet session with no wallet attached.
 *
 * Callers use this to stay QUIET: AuthProvider already opens the unlock sheet
 * and raises one explanatory toast for the whole app (the
 * `dehub:wallet-unlock-required` handler), and ConnectLinkedWalletModal is
 * the same idea for the connect case — so a second "… failed" toast from the
 * surface that triggered it is both wrong and the louder of the two.
 *
 * The string check is the fallback for errors that crossed a boundary which
 * copies the message but drops own properties (a viem re-wrap, a structured
 * clone, a `new Error(String(e))` in an older catch).
 */
export function isWalletLockedError(error: unknown): boolean {
  if (!error) return false;
  if (isWalletConnectRequiredError(error)) return true;
  const e = error as { code?: unknown; message?: unknown };
  if (e.code === WALLET_LOCKED_ERROR_CODE) return true;
  const message = typeof e.message === 'string' ? e.message : String(error);
  return message.toLowerCase().includes('wallet is locked');
}
function tryDecodeHexReason(str: string): string {
  try {
    const matches = str.match(/0x[0-9a-fA-F]+/g);
    if (!matches) return '';
    let decodedConcat = '';
    for (const hex of matches) {
      let cleanHex = hex.slice(2);
      if (cleanHex.startsWith('08c379a0')) {
        cleanHex = cleanHex.slice(8);
      }
      let ascii = '';
      for (let i = 0; i < cleanHex.length; i += 2) {
        const charCode = parseInt(cleanHex.slice(i, i + 2), 16);
        if (charCode >= 32 && charCode <= 126) {
          ascii += String.fromCharCode(charCode);
        }
      }
      decodedConcat += ' ' + ascii;
    }
    return decodedConcat.trim();
  } catch {
    return '';
  }
}

/**
 * Parse transaction error into user-friendly message
 */
export function parseTxError(error: unknown, context: string = 'transaction'): string {
  if ((error as any)?.code === 'TRANSACTION_CONFIRMATION_PENDING') return (error as Error).message;
  if ((error as any)?.code === 'WALLET_ACTION_CANCELLED') return (error as Error).message;
  // Extract message from nested error objects (viem/ethers/provider errors)
  let errorStr = '';
  if (error instanceof Error) {
    errorStr = error.message;
    // viem errors (UserOperationExecutionError etc.) carry the decoded revert reason in
    // .details (e.g. "STF") and .cause — check them too so we don't have to parse hex.
    const e = error as Record<string, any>;
    if (e.details) errorStr += '\n' + e.details;
    if (e.cause?.message) errorStr += '\n' + e.cause.message;
    if (e.cause?.reason) errorStr += '\n' + e.cause.reason;
    if (e.shortMessage) errorStr += '\n' + e.shortMessage;
  } else if (typeof error === 'string') {
    errorStr = error;
  } else if (error && typeof error === 'object') {
    const e = error as Record<string, any>;
    errorStr = e.message || e.shortMessage || e.reason ||
      e.error?.message || e.data?.message || e.details ||
      (() => { try { return JSON.stringify(error).slice(0, 300); } catch { return 'Unknown error'; } })();
  } else {
    errorStr = String(error);
  }

  // Try decoding any hex-encoded revert reasons (such as Pimlico / simulation revert hex)
  const decoded = tryDecodeHexReason(errorStr);
  if (decoded) {
    errorStr += '\nDecoded revert: ' + decoded;
  }

  const lowerError = errorStr.toLowerCase();
  const validationMessage = userOperationValidationMessage(userOperationErrorDetail(error));
  if (validationMessage) return validationMessage;

  // Before every other branch: a signing prompt is not a failed transaction and
  // must never be worded as one. Callers that check isWalletLockedError skip
  // their toast entirely — this is what the ones that don't will print. The
  // connect case goes first: isWalletLockedError covers it too, and reaching
  // the locked wording would tell an external-wallet user to unlock a vault
  // they don't have.
  if (isWalletConnectRequiredError(error)) {
    return 'Connect the wallet linked to this account to continue.';
  }
  if (isWalletLockedError(error) || lowerError.includes('wallet is locked')) {
    return 'Your wallet is locked — unlock it to continue.';
  }
  const unavailableChain = lowerError.match(/no_signer_on_chain:(\d+)/);
  if (unavailableChain) {
    const chain = CHAIN_CONFIGS[Number(unavailableChain[1]) as ChainId]?.name;
    return chain
      ? _translateCopy("copy.455d64d06084", { defaultValue: "{{value1}} transactions are temporarily unavailable. Please try again.", value1: chain })
      : _translateCopy("copy.00140a37bd26", { defaultValue: "Transactions on that network are temporarily unavailable. Please try again." });
  }
  if (lowerError.includes('user rejected') || lowerError.includes('user denied')) {
    return 'Transaction was rejected by user.';
  }
  if (looksLikePausedRevert(lowerError)) {
    return i18n.t('tokenErrors.transactionsPaused');
  }
  if (lowerError.includes('insufficient funds')) {
    return 'Insufficient funds for gas. Please add ETH to your wallet.';
  }
  // STF = SafeTransferFrom failure — ERC20 has no balance or missing approval.
  // Check before paymaster: UserOperationExecutionError includes "paymaster" in its request
  // body even when the real failure is a token transfer. Also check for hex-encoded revert
  // (ABI-encoded Error("STF") contains "535446" — hex of "STF").
  if (lowerError.includes('stf') || lowerError.includes('535446') ||
    lowerError.includes('safetransfer') || lowerError.includes('token transfer failed')) {
    return i18n.t('tokenErrors.transferFailedCheckBalance');
  }
  // DeHub's own sponsorship account, not the reader's wallet.
  //
  // When the Pimlico balance empties, every smart-account user stops being
  // able to post or tip while external-wallet users carry on paying their own
  // gas — so it reads as "it works for me" rather than as an outage. It ran to
  // zero once before and posting was dead for three days.
  //
  // The message this used to fall through to told the reader to add ETH to
  // their wallet. That is not something they can act on: the balance that is
  // empty is ours, adding ETH to their own account changes nothing, and it
  // sends a confused person to a bridge. Say whose problem it is.
  //
  // Checked before the generic paymaster branch below, which matches on
  // "paymaster" and would otherwise swallow it. Pimlico's own wording is
  // "Insufficient Pimlico balance for sponsorship, please top up".
  if (
    (lowerError.includes('pimlico balance') && lowerError.includes('sponsorship')) ||
    lowerError.includes('please top up') ||
    lowerError.includes('insufficient balance for sponsorship')
  ) {
    return i18n.t('errors.sponsorshipUnavailable');
  }
  if (lowerError.includes('aa21') || lowerError.includes('aa25') || lowerError.includes('aa31') ||
    (lowerError.includes('paymaster') && !lowerError.includes('execution reverted'))) {
    return i18n.t('errors.gasSponsorshipFailed');
  }
  // Skip generic 'nonce' check — "nonce" appears in every UserOperation request body and
  // fires a false match. AA25 already covers the real invalid-nonce case above.
  if (lowerError.includes('gas')) {
    return 'Gas estimation failed. The transaction may revert.';
  }
  if (lowerError.includes('already minted') || lowerError.includes('token already exists')) {
    return _translateCopy("copy.965cc4f09367", { defaultValue: "This content has already been minted." });
  }
  if (lowerError.includes('invalid signature') || lowerError.includes('signer should sign')) {
    return _translateCopy("copy.1a68fdbd95af", { defaultValue: "Signature verification failed on-chain." });
  }
  if (lowerError.includes('unable to find matching address') || lowerError.includes('torus keyring') ||
    lowerError.includes('unknown account') ||
    lowerError.includes('session expired') || lowerError.includes('log in again to complete')) {
    return 'Session expired. Please log in again to complete this transaction.';
  }
  if (lowerError.includes('execution reverted')) {
    const match = errorStr.match(/reason="([^"]+)"/);
    if (match) return _translateCopy("copy.0898cae94805", { defaultValue: "Transaction reverted: {{value1}}", value1: match[1] });
    return _translateCopy("copy.62fec567d392", { defaultValue: "Transaction reverted by the contract." });
  }

  if (context === 'approval') {
    return _translateCopy("copy.8c4b27f2f47f", { defaultValue: "Token approval failed. Please try again." });
  }

  return `Failed to ${context}: ${errorStr.slice(0, 100)}`;
}
/**
 * True only for an actual Pausable revert. A bare "paused" substring also hits
 * request bodies, unrelated contracts and paused media, and told people DHB was
 * paused while the token was live. Callers that can await should still confirm
 * with checkDHBPaused before saying so.
 */
export function looksLikePausedRevert(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('pausable: paused') || m.includes('erc20pausable') || m.includes('enforcedpause');
}
