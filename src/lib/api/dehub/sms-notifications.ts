/**
 * Text notifications — credit, number and prices
 * ==============================================
 * Client for `/api/notification/sms/*` on the DeHub API.
 *
 * This is the only notification channel that costs money, so it is the only one
 * with an API of its own. The switch itself is not here: turning texts on and
 * off is `notificationPreferences.smsEnabled`, written through `update_profile`
 * beside every other notification preference. What lives here is the part with
 * a price on it — the balance, the deposit that fills it, and the phone number
 * the messages go to.
 *
 * Three things about the flow that are not obvious from the call sites:
 *
 * - **The client never prices anything and never credits anything.** `status()`
 *   says what a message costs and where to send DHB; the wallet sends it; and
 *   `claimDeposit()` hands the server a hash it reads off the chain itself.
 *   Nothing the client claims about the amount is trusted.
 * - **`claimDeposit` is safe to repeat, and must be.** It answers
 *   `pending: true` while the receipt catches up, and a hash that has already
 *   been credited is credited exactly once however many times it is sent. So a
 *   dropped response is a retry, never a second payment.
 * - **Verifying the number costs one message.** That is deliberate — it proves
 *   the number is reachable on the same route the notifications will take,
 *   before the reader is promised anything.
 *
 * The bare origin is the base here, so every path carries `/api`.
 */

import { apiCall } from './core';

export interface SmsPriceBand {
  band: string;
  priceDhb: number;
  priceUsd: number;
}

export interface SmsNotificationStatus {
  /** False when the platform has no gateway or treasury — off for everybody. */
  available: boolean;
  /** True once cumulative deposits have cleared the minimum. */
  unlocked: boolean;
  balanceDhb: number;
  balanceUsd: number;
  /** Masked. The full number is never returned, not even to its owner. */
  phone: string | null;
  phoneVerified: boolean;
  /** A verification is in flight for this number, masked. */
  pendingPhone: string | null;
  minDepositDhb: number;
  minDepositUsd: number;
  /** Where to send DHB. Null when the platform has no treasury configured. */
  depositAddress: string | null;
  chains: { chainId: number; tokenAddress: string }[];
  /** Price of one text to the verified number, once there is one. */
  priceDhb: number | null;
  priceUsd: number | null;
  prices: SmsPriceBand[];
  /** Display only. Every figure above is denominated in DHB. */
  dhbUsdPeg: number;
  messagesSent: number;
  messagesRemaining: number | null;
}

export interface SmsQuote {
  band: string;
  priceDhb: number;
  priceUsd: number;
  /** True when we cannot deliver to that country at any price. */
  blocked: boolean;
}

export interface SmsDepositResult {
  credited: boolean;
  /** The chain has not caught up. The hash is still good — ask again. */
  pending?: true;
  amountDhb?: number;
  status: SmsNotificationStatus;
}

export async function getSmsNotificationStatus(): Promise<SmsNotificationStatus> {
  const response = await apiCall<{ result: SmsNotificationStatus }>(
    '/api/notification/sms/status',
    { requiresAuth: true },
  );
  return response.result;
}

/** What a text to this number would cost, before anyone commits to it. */
export async function quoteSmsNumber(phone: string): Promise<SmsQuote> {
  const response = await apiCall<{ result: SmsQuote }>(
    '/api/notification/sms/quote',
    { requiresAuth: true, params: { phone } },
  );
  return response.result;
}

/**
 * Credit a DHB transfer against the balance.
 *
 * Idempotent on the hash. Callers should keep asking while `pending` is true
 * rather than sending a second transfer.
 */
export async function claimSmsDeposit(
  txHash: string,
  chainId: number,
): Promise<SmsDepositResult> {
  const response = await apiCall<{ result: SmsDepositResult }>(
    '/api/notification/sms/deposit',
    { method: 'POST', requiresAuth: true, body: { txHash, chainId } },
  );
  return response.result;
}

/** Text a six-digit code to a number. Costs one message. */
export async function requestSmsPhoneCode(
  phone: string,
): Promise<{ sent: true; priceDhb: number }> {
  const response = await apiCall<{ result: { sent: true; priceDhb: number } }>(
    '/api/notification/sms/phone/request',
    { method: 'POST', requiresAuth: true, body: { phone } },
  );
  return response.result;
}

export async function verifySmsPhoneCode(code: string): Promise<SmsNotificationStatus> {
  const response = await apiCall<{ result: SmsNotificationStatus }>(
    '/api/notification/sms/phone/verify',
    { method: 'POST', requiresAuth: true, body: { code } },
  );
  return response.result;
}

/** Forget the number. Turns the switch off with it; credit is untouched. */
export async function removeSmsPhone(): Promise<SmsNotificationStatus> {
  const response = await apiCall<{ result: SmsNotificationStatus }>(
    '/api/notification/sms/phone',
    { method: 'DELETE', requiresAuth: true },
  );
  return response.result;
}
