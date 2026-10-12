export const CARD_PAYMENT_BLOCKED_MESSAGE = 'Stripe has blocked this payment';

export function rejectCardPayment(): never {
  throw new Error(CARD_PAYMENT_BLOCKED_MESSAGE);
}
