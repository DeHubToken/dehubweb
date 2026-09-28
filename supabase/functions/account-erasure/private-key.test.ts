import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { test } from 'node:test';
import { normalizeApplePrivateKey } from './private-key.ts';

test('PEM, escaped newlines and headerless Apple key bodies import and sign', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const body = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  const payload = Buffer.from('Apple key format verification');
  for (const value of [pem, pem.replace(/\n/g, '\\n'), pem.replace(/\n/g, '\\r\\n'), body, ` ${body.match(/.{1,40}/g)!.join('\r\n')} `]) {
    const imported = createPrivateKey(normalizeApplePrivateKey(value));
    assert.deepEqual(createPublicKey(imported).export({ type: 'spki', format: 'der' }), publicKey.export({ type: 'spki', format: 'der' }));
    assert.ok(verify('sha256', payload, publicKey, sign('sha256', payload, imported)));
  }
});

test('empty, partial envelopes and non-base64 values fail without exposing their contents', () => {
  for (const value of ['', '-----BEGIN PRIVATE KEY-----\nAAAA', '//begin\nAAAA\n//end', 'AAAA!', 'AAA']) {
    assert.throws(() => normalizeApplePrivateKey(value), { message: 'Apple private key format is invalid' });
  }
});
