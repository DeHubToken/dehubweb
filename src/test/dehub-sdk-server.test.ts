// @vitest-environment node
import { describe, expect, it, vi, beforeAll } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet, type JWK } from 'jose';

// The npm SDK's server helpers (packages/dehub-sdk), checked against tokens
// shaped exactly like miniapp-auth / miniapp-user / webhook tokens.
let jwk: JWK;
let privateKey: CryptoKey;
vi.mock('jose', async (orig) => {
  const real = await orig<typeof import('jose')>();
  return { ...real, createRemoteJWKSet: () => createLocalJWKSet({ keys: [jwk] }) };
});

const sign = (claims: Record<string, unknown>, aud = 'tipjar.example.com') =>
  new SignJWT(claims).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setIssuer('https://dehub.io').setAudience(aud)
    .setSubject('0x' + 'a'.repeat(40)).setIssuedAt().setExpirationTime('1h').sign(privateKey);

beforeAll(async () => {
  const pair = await generateKeyPair('ES256', { extractable: true });
  privateKey = pair.privateKey as CryptoKey;
  jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256' };
});

describe('dehub-sdk/server', () => {
  it('verifies sign-in tokens and refuses event or payment tokens as sign-in', async () => {
    const { verifyDehubToken } = await import('../../packages/dehub-sdk/src/server');
    await expect(verifyDehubToken(await sign({}), { domain: 'tipjar.example.com' })).resolves.toMatchObject({ wallet: '0x' + 'a'.repeat(40) });
    await expect(verifyDehubToken(await sign({ typ: 'event', event: 'ping' }), { domain: 'tipjar.example.com' })).rejects.toThrow();
    await expect(verifyDehubToken(await sign({}, 'other.com'), { domain: 'tipjar.example.com' })).rejects.toThrow();
  });

  it('reads payment receipts', async () => {
    const { verifyDehubPayment } = await import('../../packages/dehub-sdk/src/server');
    const receipt = await sign({ typ: 'payment', amount: 25, token: 'DHB', chainId: 8453, txHash: '0xabc', memo: 'thanks' });
    await expect(verifyDehubPayment(receipt, { domain: 'tipjar.example.com' })).resolves.toMatchObject({ amount: 25, chainId: 8453, txHash: '0xabc', memo: 'thanks' });
  });

  it('checks webhook bodies, including that the event name matches the token', async () => {
    const { verifyDehubWebhook } = await import('../../packages/dehub-sdk/src/server');
    const token = await sign({ typ: 'event', event: 'follow', actor: '0x' + 'b'.repeat(40) });
    await expect(verifyDehubWebhook({ event: 'follow', token }, { domain: 'tipjar.example.com' })).resolves.toMatchObject({ event: 'follow' });
    await expect(verifyDehubWebhook({ event: 'tip', token }, { domain: 'tipjar.example.com' })).rejects.toThrow();
  });
});
