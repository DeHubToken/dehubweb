import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCredentials } from './cloudflare-credentials.mjs';

const token = 'example_token-with-safe-characters';
const account = '0123456789abcdef0123456789abcdef';
test('accepts raw secrets and accidental copy wrappers', () => {
  for (const value of [token, ` ${token}\n`, `"${token}"`, `Bearer ${token}`, `"Bearer ${token}"`, `Bearer '${token}'`]) {
    assert.deepEqual(normalizeCredentials(value, ` ${account}\n`), { token, account });
  }
});
test('rejects missing, embedded whitespace and command text without disclosing secrets', () => {
  for (const value of ['', 'private token', 'private\ntoken', 'curl -H Authorization: Bearer private']) {
    assert.throws(() => normalizeCredentials(value, account), error =>
      error.message.startsWith('CLOUDFLARE_APITOKEN') && !error.message.includes('private'));
  }
  assert.throws(() => normalizeCredentials(token, 'wrong-account'), /CLOUDFLARE_ID/);
});
test('recovers line-wrapped tokens only when the compact token has the expected shape', () => {
  const wrapped = 'Abcdefghij0123456789\n_Klmnopqrs9876543210';
  assert.equal(normalizeCredentials(wrapped, account).token, wrapped.replace(/\s/g, ''));
  assert.throws(() => normalizeCredentials('two ordinary words', account), /CLOUDFLARE_APITOKEN/);
});
