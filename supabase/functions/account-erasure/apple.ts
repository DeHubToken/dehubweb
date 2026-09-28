import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'https://esm.sh/jose@6.1.0';
import { normalizeApplePrivateKey } from './private-key.ts';

const keys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export async function revokeAppleAuthorization(user: any, code?: string, refreshToken?: string) {
  const identity = user?.identities?.find((entry: any) => entry.provider === 'apple');
  if (!identity) return;
  if (!code && !refreshToken) throw new Error('Sign in with Apple again before deleting this account');
  const team = Deno.env.get('APPLE_TEAM_ID');
  const keyId = Deno.env.get('APPLE_KEY_ID');
  const pem = Deno.env.get('APPLE_PRIVATE_KEY');
  if (!team || !keyId || !pem) throw new Error('Apple account deletion is not configured');
  const clientId = code ? 'io.dehub.mobile' : 'io.dehub.mobile.signin';
  const key = await importPKCS8(normalizeApplePrivateKey(pem), 'ES256');
  const secret = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(team).setSubject(clientId).setAudience('https://appleid.apple.com')
    .setIssuedAt().setExpirationTime('5m').sign(key);
  const body = new URLSearchParams({
    client_id: clientId, client_secret: secret,
    grant_type: code ? 'authorization_code' : 'refresh_token',
    ...(code ? { code } : { refresh_token: refreshToken! }),
  });
  const exchanged = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST', body, signal: AbortSignal.timeout(15000),
  });
  const tokens = await exchanged.json();
  const tokenToRevoke = tokens.refresh_token || refreshToken;
  if (!exchanged.ok || !tokens.id_token || !tokenToRevoke) throw new Error('Apple authorization could not be verified');
  const { payload } = await jwtVerify(tokens.id_token, keys, {
    issuer: 'https://appleid.apple.com', audience: clientId,
  });
  if (payload.sub !== identity.identity_data?.sub) throw new Error('Apple account does not match the account being deleted');
  const revoked = await fetch('https://appleid.apple.com/auth/revoke', {
    method: 'POST', body: new URLSearchParams({
      client_id: clientId, client_secret: secret, token: tokenToRevoke, token_type_hint: 'refresh_token',
    }), signal: AbortSignal.timeout(15000),
  });
  if (!revoked.ok) throw new Error('Apple authorization could not be revoked');
}
