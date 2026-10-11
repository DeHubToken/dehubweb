import { createPayments, type PaymentServices } from './payments.ts';
import { createHandler } from './handler.ts';
const wallet = `0x${'1'.repeat(40)}`, hash = `0x${'2'.repeat(64)}`;
const body = { operation: 'payment_charge', key: `maboroshi:${'a'.repeat(32)}:prepare`, wallet, tx_hash: hash, amount_micros: 1000000 };
function assert(value: unknown): asserts value { if (!value) throw Error('Assertion failed'); }
function fixture() {
  const calls: unknown[][] = [];
  let receipt: any = { wallet_address: wallet, purpose: 'job' };
  const services: PaymentServices = {
    receipt: async () => ({ data: receipt }),
    record: async value => { receipt = value; calls.push(['record', value]); return {}; },
    verify: async (...args) => { calls.push(['verify', ...args]); return { ok: true, hash, chain: 'Base', dhb: 1500 }; },
    spend: async (...args) => { calls.push(['spend', ...args]); return {}; },
    refund: async (...args) => { calls.push(['refund', ...args]); return { data: true }; },
  };
  return { services, calls, setReceipt: (value: any) => { receipt = value; } };
}
Deno.test('existing unspent receipt uses the shared atomic ledger with the exact stage and amount', async () => {
  const f = fixture();
  const result = await createPayments(f.services)(body);
  assert(result.status === 200 && (await result.json()).debited === true);
  assert(JSON.stringify(f.calls) === JSON.stringify([['spend', body.key, wallet, hash, 1000]]));
});
Deno.test('new transfers are chain-verified and bank the entire verified value', async () => {
  const f = fixture(); f.setReceipt(null);
  assert((await createPayments(f.services)(body)).status === 200);
  assert(f.calls[0][0] === 'verify' && (f.calls[1][1] as any).remaining_dhb === 1500);
});
Deno.test('foreign receipts, voice-session receipts, invalid amounts and unverified transfers cannot spend', async () => {
  const f = fixture(); const pay = createPayments(f.services);
  f.setReceipt({ wallet_address: 'other', purpose: 'job' }); assert((await pay(body)).status === 403);
  f.setReceipt({ wallet_address: wallet, purpose: 'voice' }); assert((await pay(body)).status === 409);
  for (const amount of [0, -1, 1.1, 100000001]) assert((await pay({ ...body, amount_micros: amount })).status === 400);
  f.setReceipt(null); f.services.verify = async () => ({ ok: false, reason: 'not mined' });
  assert((await pay(body)).status === 402 && f.calls.length === 0);
});
Deno.test('uncertain or exhausted ledger results never report a debit and refunds require acknowledgement', async () => {
  const f = fixture(); const pay = createPayments(f.services);
  f.services.spend = async () => ({ error: { message: 'PAYMENT_EXHAUSTED' } });
  assert((await pay(body)).status === 402);
  f.services.spend = async () => { throw Error('connection lost'); }; assert((await pay(body)).status === 503);
  f.services.refund = async () => ({ data: false }); assert((await pay({ ...body, operation: 'payment_refund' })).status === 503);
});
Deno.test('the private credential gate also protects charge and refund operations', async () => {
  let calls = 0;
  const handler = createHandler(() => 'a-long-private-credential-value', fetch, async () => { calls++; return Response.json({}); });
  for (const operation of ['payment_charge', 'payment_refund']) {
    const result = await handler(new Request('https://example.test', { method: 'POST', body: JSON.stringify({ ...body, operation }) }));
    assert(result.status === 401);
  }
  assert(calls === 0);
});
