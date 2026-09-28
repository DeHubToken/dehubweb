import { handleCorsPreflight, jsonResponse, serviceClient } from '../_shared/auth.ts';
import { revokeAppleAuthorization } from './apple.ts';

// This is an internal service call. Clients cannot supply a wallet or user ID
// here: the backend obtains both from the account its own session verified.
Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);
  const secret = Deno.env.get('ASSISTANT_SERVICE_SECRET');
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  try {
    const body = await req.json();
    const wallet = typeof body.wallet === 'string' ? body.wallet.toLowerCase() : '';
    const userId = body.userId || null;
    if (!/^0x[a-f0-9]{40}$/.test(wallet) ||
      (userId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId))) {
      return jsonResponse({ error: 'Invalid account' }, 400);
    }
    const db = serviceClient();
    if (body.mode === 'prepare') {
      if (userId) {
        const { data, error } = await db.auth.admin.getUserById(userId);
        if (error) throw error;
        await revokeAppleAuthorization(data.user, body.appleAuthorizationCode, body.appleRefreshToken);
      }
      return jsonResponse({ status: 'ready' });
    }
    // Only a prepared durable request can erase data; ordinary calls cannot
    // skip the Apple revocation step by selecting an alternate mode.
    if (body.prepared !== true) return jsonResponse({ error: 'Deletion must be prepared first' }, 400);
    const args = { p_wallet: wallet, p_user_id: userId };
    // RPC responses have a row ceiling. Continue until the manifest is empty
    // so an account with more than one page of files does not leave data behind.
    while (true) {
      const { data: objects, error: manifestError } = await db.rpc('account_erasure_storage', args);
      if (manifestError) throw manifestError;
      if (!objects?.length) break;
      const byBucket = new Map<string, string[]>();
      for (const obj of objects) {
        const names = byBucket.get(obj.bucket_id) || [];
        names.push(obj.name); byBucket.set(obj.bucket_id, names);
      }
      for (const [bucket, names] of byBucket) {
        for (let offset = 0; offset < names.length; offset += 100) {
          const { error } = await db.storage.from(bucket).remove(names.slice(offset, offset + 100));
          if (error) throw error;
        }
      }
    }
    const { error: dataError } = await db.rpc('erase_account_app_data', args);
    if (dataError) throw dataError;
    if (userId) {
      const { error } = await db.auth.admin.deleteUser(userId);
      // Retrying a durable request after a restart can reach an identity already removed.
      if (error && error.status !== 404 && error.code !== 'user_not_found') throw error;
    }
    return jsonResponse({ status: 'complete' });
  } catch (error) {
    console.error('[account-erasure]', error instanceof Error ? error.message : 'Erasure failed');
    return jsonResponse({ error: 'Erasure could not finish. The request remains queued for retry.' }, 503);
  }
});
