type Result = { data?: any; error?: { message?: string; code?: string } | null };
export interface PaymentServices {
  receipt: (hash: string) => Promise<Result>;
  record: (receipt: Record<string, unknown>) => Promise<Result>;
  verify: (hash: string, wallet: string, amount: number) => Promise<
    { ok: true; hash: string; chain: string; dhb: number } | { ok: false; reason: string }>;
  spend: (key: string, wallet: string, hash: string, amount: number) => Promise<Result>;
  refund: (key: string) => Promise<Result>;
}

// Only called after the private worker credential has been checked. The worker
// derives wallet ownership, stage eligibility and price from its saved project.
export function createPayments(services: PaymentServices) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  return async (body: Record<string, unknown>): Promise<Response> => {
    const key = body.key;
    if (typeof key !== 'string' || !/^maboroshi:[a-f0-9]{32}:(prepare|draft|hd)$/.test(key)) return reply({ error: 'Invalid stage' }, 400);
    try {
      if (body.operation === 'payment_refund') {
        const result = await services.refund(key);
        return result.error || result.data !== true ? reply({ error: 'Refund needs reconciliation' }, 503) : reply({ refunded: true });
      }
      const wallet = typeof body.wallet === 'string' ? body.wallet.toLowerCase() : '';
      const hash = typeof body.tx_hash === 'string' ? body.tx_hash.toLowerCase() : '';
      const micros = body.amount_micros;
      if (!/^0x[a-f0-9]{40}$/.test(wallet) || !/^0x[a-f0-9]{64}$/.test(hash)
          || typeof micros !== 'number' || !Number.isSafeInteger(micros) || micros <= 0 || micros > 100_000_000) return reply({ error: 'Invalid payment' }, 400);
      const amount = micros / 1000;
      let found = await services.receipt(hash);
      if (found.error) return reply({ error: 'Could not read payment' }, 503);
      if (!found.data) {
        const verified = await services.verify(hash, wallet, amount);
        if (!verified.ok) return reply({ error: 'Payment is not verified', code: 'PAYMENT_UNVERIFIED' }, 402);
        const inserted = await services.record({ wallet_address: wallet, tx_hash: verified.hash.toLowerCase(),
          chain: verified.chain, paid_dhb: verified.dhb, remaining_dhb: verified.dhb, purpose: 'job' });
        if (inserted.error && inserted.error.code !== '23505') return reply({ error: 'Could not record payment' }, 503);
        // A concurrent insert may belong to another wallet or purpose.
        found = await services.receipt(hash);
        if (found.error || !found.data) return reply({ error: 'Could not confirm receipt' }, 503);
      }
      if (String(found.data.wallet_address).toLowerCase() !== wallet) return reply({ error: 'Payment belongs to another wallet' }, 403);
      if (found.data.purpose !== 'job') return reply({ error: 'Payment is reserved for another use' }, 409);
      const result = await services.spend(key, wallet, hash, amount);
      if (result.error) {
        const reason = result.error.message || '';
        if (reason.includes('PAYMENT_EXHAUSTED')) return reply({ error: 'That payment has been used up. Review payment again.', code: 'PAYMENT_EXHAUSTED' }, 402);
        if (/PAYMENT_BINDING_MISMATCH|PAYMENT_REVERSED/.test(reason)) return reply({ error: 'This stage already has a different or reversed payment' }, 409);
        return reply({ error: 'Payment could not be confirmed. Retry keeps the same reference.' }, 503);
      }
      return reply({ debited: true });
    } catch {
      return reply({ error: 'Payment could not be confirmed. Retry keeps the same reference.' }, 503);
    }
  };
}
