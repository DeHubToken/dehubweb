import { translateCopy as _translateCopy } from '@/i18n/copy';

export const CARD_PAYMENT_BLOCKED_MESSAGE = 'Stripe has blocked this payment';

export function rejectCardPayment(): never {
  throw new Error(_translateCopy("copy.79c5fb479405", { defaultValue: "Stripe has blocked this payment" }));
}
