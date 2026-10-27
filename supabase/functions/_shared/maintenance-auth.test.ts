import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { maintenanceGate } from './maintenance-auth.ts';
const token = '9999999999.' + 'a'.repeat(64);
Deno.test('rejects unsigned, malformed and non-POST maintenance before touching data', async () => {
  for (const req of [new Request('https://example.test'), new Request('https://example.test', { method: 'POST' }), new Request('https://example.test', { method: 'POST', headers: { 'x-maintenance-token': 'invalid' } })]) {
    let calls = 0;
    const response = await maintenanceGate(req, async () => { calls++; return true; });
    assertEquals(calls, 0);
    assertEquals(response?.status, req.method === 'POST' ? 401 : 405);
  }
});
Deno.test('accepts only a successful server verification and fails closed on outage', async () => {
  const req = new Request('https://example.test', { method: 'POST', headers: { 'x-maintenance-token': token } });
  assertEquals(await maintenanceGate(req, async received => received === token), null);
  assertEquals((await maintenanceGate(req, async () => false))?.status, 401);
  assertEquals((await maintenanceGate(req, async () => { throw new Error('unavailable'); }))?.status, 503);
});
