/**
 * Bank cash-out through the off-ramp partner (Transak).
 * The partner runs KYC and holds bank details; the `cashout` function only
 * mints a one-time sell session and lists our order references.
 */
import { supabase } from '@/integrations/supabase/client';
import { dehubAuthHeaders, readFunctionError } from '@/lib/ai-invoke';
import { ensureFreshToken } from '@/lib/api/dehub/core';

export interface CashoutNetwork { id: 'base' | 'bsc'; label: string; currency: string }
export interface CashoutConfig { enabled: boolean; min: number; max: number; networks: CashoutNetwork[] }
export interface CashoutOrder {
  id: string;
  partner_order_id: string | null;
  crypto_currency: string;
  network: string;
  crypto_amount: number;
  fiat_currency: string | null;
  fiat_amount: number | null;
  status: string;
  created_at: string;
}

export type CashoutTone = 'done' | 'pending' | 'failed';

export function cashoutTone(status: string): CashoutTone {
  if (status === 'completed') return 'done';
  if (['failed', 'cancelled', 'expired', 'refunded'].includes(status)) return 'failed';
  return 'pending';
}

/** Amount check shared by the input and the submit button. */
export function validCashoutAmount(value: string, cfg: Pick<CashoutConfig, 'min' | 'max'>): boolean {
  if (!/^\d+(\.\d{1,6})?$/.test(value.trim())) return false;
  const amount = Number(value);
  return amount >= cfg.min && amount <= cfg.max;
}

async function call<T>(body: Record<string, unknown>, authed: boolean): Promise<T> {
  if (authed) await ensureFreshToken();
  const { data, error } = await supabase.functions.invoke<T>('cashout', {
    body, headers: authed ? dehubAuthHeaders() : {},
  });
  if (error) throw new Error(await readFunctionError(error, data));
  return data as T;
}

let configPromise: Promise<CashoutConfig> | null = null;
export function getCashoutConfig(): Promise<CashoutConfig> {
  configPromise ??= call<CashoutConfig>({ action: 'config' }, false).catch((err) => {
    configPromise = null;
    throw err;
  });
  return configPromise;
}

export const startCashout = (amount: number, network: CashoutNetwork['id']) =>
  call<{ id: string; url: string }>({ action: 'start', amount, network }, true);

export const cashoutHistory = () =>
  call<{ orders: CashoutOrder[] }>({ action: 'history' }, true).then((r) => r.orders ?? []);
