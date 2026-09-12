import { handleCorsPreflight, jsonResponse, requireDeHubAuth, serviceClient, checkRateLimit } from '../_shared/auth.ts';

const BUCKET = 'creator-assets';
const ID = /^[a-zA-Z0-9_-]{6,80}$/;
const FIELDS = ['id', 'kind', 'prompt', 'resolvedPrompt', 'model', 'modelName', 'presetId', 'aspect', 'exportFormat', 'createdAt', 'finishedAt', 'transcript', 'segments'];

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const auth = await requireDeHubAuth(req);
  if (!auth.ok) return auth.response;
  const db = serviceClient();
  const limited = await checkRateLimit(db, auth.wallet, 'creator-library', { limit: 240, windowMs: 60_000 });
  if (!limited.allowed) return jsonResponse({ error: 'Please wait before saving more generations.' }, 429);
  try {
    const body = await req.json();
    if (body.action === 'list') {
      const offset = Math.max(0, Math.min(10000, Number(body.offset) || 0));
      const { data, error } = await db.from('creator_assets').select('*')
        .eq('wallet_address', auth.wallet).eq('ready', true)
        .order('created_at', { ascending: false }).range(offset, offset + 99);
      if (error) throw error;
      const jobs = await Promise.all((data ?? []).map(async (row) => {
        let url: string | undefined;
        if (row.storage_path) {
          const signed = await db.storage.from(BUCKET).createSignedUrl(row.storage_path, 86400);
          if (signed.error) throw signed.error;
          url = signed.data.signedUrl;
        }
        return { ...row.metadata, id: row.id, status: 'done', stage: '', url, cloudSaved: true };
      }));
      return jsonResponse({ jobs, nextOffset: jobs.length === 100 ? offset + 100 : null });
    }
    const id = String(body.id ?? '');
    if (!ID.test(id)) return jsonResponse({ error: 'Invalid generation id' }, 400);
    if (body.action === 'remove') {
      // Hide from the active library without destroying the stored file.
      const { error } = await db.from('creator_assets').update({ ready: false })
        .eq('wallet_address', auth.wallet).eq('id', id);
      if (error) throw error;
      return jsonResponse({ ok: true });
    }
    if (body.action === 'prepare') {
      const input = body.metadata ?? {};
      if (!['image','video','audio','model3d'].includes(input.kind)) return jsonResponse({ error: 'Invalid media type' }, 400);
      for (const key of ['prompt','resolvedPrompt','model','modelName','aspect','transcript']) {
        if (input[key] !== undefined && typeof input[key] !== 'string') return jsonResponse({ error: 'Invalid generation metadata' }, 400);
      }
      const metadata = Object.fromEntries(FIELDS.filter((key) => input[key] !== undefined).map((key) => [key,input[key]]));
      if (JSON.stringify(metadata).length > 100000) return jsonResponse({ error: 'Generation metadata is too large' }, 413);
      const existing = await db.from('creator_assets').select('ready').eq('wallet_address', auth.wallet).eq('id',id).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data?.ready) {
        const updated = await db.from('creator_assets').update({ metadata }).eq('wallet_address', auth.wallet).eq('id', id);
        if (updated.error) throw updated.error;
        return jsonResponse({ saved: true });
      }
      const path = input.transcript ? null : `${auth.wallet}/${id}/original`;
      const { error } = await db.from('creator_assets').upsert({ id, wallet_address: auth.wallet, storage_path: path, metadata, ready: !path });
      if (error) throw error;
      if (!path) return jsonResponse({ saved: true });
      const signed = await db.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
      if (signed.error) throw signed.error;
      return jsonResponse({ path, token: signed.data.token });
    }
    if (body.action === 'complete') {
      const path = `${auth.wallet}/${id}/original`;
      const { data, error } = await db.storage.from(BUCKET).list(`${auth.wallet}/${id}`, { search: 'original', limit: 1 });
      if (error) throw error;
      if (!data?.some((file) => file.name === 'original')) return jsonResponse({ error: 'The media upload has not finished.' }, 409);
      const result = await db.from('creator_assets').update({ ready: true }).eq('wallet_address', auth.wallet).eq('id', id).eq('storage_path', path);
      if (result.error) throw result.error;
      return jsonResponse({ saved: true });
    }
    return jsonResponse({ error: 'Unknown library action' }, 400);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Could not update your library' }, 500);
  }
});
