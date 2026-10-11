import { createHandler } from './handler.ts';
import { createPayments } from './payments.ts';
import { serviceClient } from '../_shared/auth.ts';
import { claimDhbPayment } from '../_shared/dhb-transfer.ts';

const payments = createPayments({
  receipt: async hash => await serviceClient().from('ai_payments').select('wallet_address,purpose').eq('tx_hash', hash).maybeSingle(),
  record: async receipt => await serviceClient().from('ai_payments').insert(receipt),
  verify: (hash, wallet, amount) => claimDhbPayment(hash, wallet, amount, 'ai', serviceClient()),
  spend: async (key, wallet, hash, amount) => await serviceClient().rpc('maboroshi_payment_spend', {
    p_key: key, p_wallet: wallet, p_tx_hash: hash, p_dhb: amount,
  }),
  refund: async key => await serviceClient().rpc('maboroshi_payment_refund', { p_key: key }),
});

// Server-to-server only; deliberately no browser CORS access.
Deno.serve(createHandler(name => Deno.env.get(name), fetch, payments));
