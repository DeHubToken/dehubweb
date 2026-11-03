import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { BYOK_PROVIDERS, byokProvider, classifyKeyStatus, plausibleKey, scrubSecrets } from './byok.ts';

Deno.test('provider lookup ignores prototype names', () => {
  assertEquals(byokProvider('openai')?.id, 'openai');
  assertEquals(byokProvider('constructor'), null);
  assertEquals(byokProvider(undefined), null);
});

Deno.test('every provider tests over https without a custom address', () => {
  for (const p of Object.values(BYOK_PROVIDERS)) {
    assertEquals(new URL(p.test('k'.repeat(40)).url).protocol, 'https:');
  }
});

Deno.test('status meanings', () => {
  assertEquals(classifyKeyStatus(200), 'working');
  assertEquals(classifyKeyStatus(429), 'working');
  assertEquals(classifyKeyStatus(401), 'invalid');
  assertEquals(classifyKeyStatus(403), 'invalid');
  assertEquals(classifyKeyStatus(402), 'no_credit');
  assertEquals(classifyKeyStatus(404), null);
  assertEquals(classifyKeyStatus(404, [404]), 'working');
  assertEquals(classifyKeyStatus(503), null);
});

Deno.test('key checks and scrubbing', () => {
  assertEquals(plausibleKey('sk-abc 123'), false);
  assertEquals(plausibleKey('short'), false);
  assertEquals(plausibleKey('sk-proj-abcdefgh12345678'), true);
  const key = 'sk-proj-abcdefgh12345678';
  assertEquals(scrubSecrets(`bad key ${key} here`, key), 'bad key [key] here');
  assertEquals(scrubSecrets('Incorrect API key provided: sk-proj-zzzzzzzzzzzz'), 'Incorrect API key provided: [key]');
});
