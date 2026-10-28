import { handleCorsPreflight, jsonResponse, requireDeHubAuth, serviceClient, checkRateLimit } from '../_shared/auth.ts';
import { parseLibraryAction, updateLibraryAssets } from './actions.ts';
import { retryGenerationSave, settleGeneration } from '../_shared/generation-jobs.ts';
import { hydrateGenerationResult } from '../_shared/generation-result.ts';

const BUCKET = 'creator-assets';
const ID = /^[a-zA-Z0-9_-]{6,80}$/;
const FIELDS = ['id', 'kind', 'prompt', 'resolvedPrompt', 'model', 'modelName', 'presetId', 'aspect', 'exportFormat', 'createdAt', 'finishedAt', 'transcript', 'segments', 'posterUrl'];

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
    if (body.action === 'layer-jobs') {
      if (!ID.test(String(body.sourceAssetId || ''))) return jsonResponse({ error: 'Choose one saved image' }, 400);
      const jobs = await db.from('ai_generation_jobs').select('id,status,created_at,result,prediction_id,provider_app')
        .eq('wallet_address', auth.wallet).eq('model', 'qwen-image-layered').eq('endpoint', 'fal-ai-tools')
        .eq('metadata->>sourceAssetId', body.sourceAssetId).order('created_at', { ascending: false }).limit(20);
      if (jobs.error) throw jobs.error;
      return jsonResponse({ jobs: (jobs.data || []).map(job => ({ id: job.id, status: job.status, createdAt: job.created_at,
        savePending: job.result?.savePending === true, requestId: job.prediction_id, appId: job.provider_app })) });
    }
    if (body.action === 'layer-set') {
      const { data: job, error } = await db.from('ai_generation_jobs').select('*').eq('wallet_address', auth.wallet).eq('id', String(body.id || '')).eq('model', 'qwen-image-layered').eq('endpoint', 'fal-ai-tools').maybeSingle();
      if (error) throw error;
      if (!job) return jsonResponse({ error: 'Layer set was not found' }, 404);
      if (job.status === 'processing' && job.result?.providerCompleted && job.prediction_id) {
        return await settleGeneration('fal-ai-tools', job.prediction_id, jsonResponse({ ...job.result, status: 'succeeded' }));
      }
      if (job.status !== 'succeeded') return jsonResponse({ status: job.status, requestId: job.prediction_id, appId: job.provider_app });
      await retryGenerationSave(job);
      const current = await db.from('ai_generation_jobs').select('*').eq('id', job.id).eq('wallet_address', auth.wallet).single();
      if (current.error) throw current.error;
      const result = await hydrateGenerationResult(current.data, db);
      return jsonResponse({ status: result?.layerSet ? 'succeeded' : 'saving', layerSet: result?.layerSet, savePending: !!result?.savePending });
    }
    if (body.action === 'update-selection') {
      let selection;
      try { selection = parseLibraryAction(body); }
      catch { return jsonResponse({ error: 'Select between 1 and 100 saved generations.' }, 400); }
      return jsonResponse(await updateLibraryAssets(db, auth.wallet, selection));
    }
    if (body.action === 'list') {
      const offset = Math.max(0, Math.min(10000, Number(body.offset) || 0));
      let query = db.from('creator_assets').select('*')
        .eq('wallet_address', auth.wallet).eq('ready', true);
      if (body.includeHidden !== true) query = query.eq('hidden', body.hidden === true);
      if (body.favorites === true) query = query.eq('favorite', true);
      const { data, error } = await query.order('created_at', { ascending: false }).range(offset, offset + 99);
      if (error) throw error;
      const jobs = await Promise.all((data ?? []).map(async (row) => {
        let url: string | undefined;
        if (row.storage_path) {
          const signed = await db.storage.from(BUCKET).createSignedUrl(row.storage_path, 86400);
          if (signed.error) throw signed.error;
          url = signed.data.signedUrl;
        }
        let posterUrl = row.metadata?.posterUrl;
        if (row.metadata?.posterPath === `${auth.wallet}/${row.id}/preview`) {
          const poster = await db.storage.from(BUCKET).createSignedUrl(row.metadata.posterPath, 86400);
          if (!poster.error) posterUrl = poster.data.signedUrl;
        }
        return { ...row.metadata, posterUrl, id: row.id, status: 'done', stage: '', url, cloudSaved: true,
          favorite: row.favorite === true, hidden: row.hidden === true };
      }));
      return jsonResponse({ jobs, nextOffset: jobs.length === 100 ? offset + 100 : null });
    }
    const id = String(body.id ?? '');
    if (!ID.test(id)) return jsonResponse({ error: 'Invalid generation id' }, 400);
    if (/^[0-9a-f-]{36}-layer-[0-3]$/i.test(id) && ['prepare','complete','remove'].includes(body.action)) {
      return jsonResponse({ error: 'Layer originals are managed by their saved set. Use Hide to remove them from your library.' }, 409);
    }
    if (body.action === 'prepare-preview' || body.action === 'complete-preview') {
      const existing = await db.from('creator_assets').select('metadata').eq('wallet_address', auth.wallet).eq('id', id).eq('ready', true).maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) return jsonResponse({ error: 'Generation is not saved yet' }, 409);
      const path = `${auth.wallet}/${id}/preview`;
      if (body.action === 'prepare-preview') {
        const upload = await db.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
        if (upload.error) throw upload.error;
        return jsonResponse({ path, token: upload.data.token });
      }
      const files = await db.storage.from(BUCKET).list(`${auth.wallet}/${id}`, { search: 'preview', limit: 1 });
      if (files.error) throw files.error;
      if (!files.data?.some((file) => file.name === 'preview')) return jsonResponse({ error: 'Preview upload has not finished' }, 409);
      const updated = await db.from('creator_assets').update({ metadata: { ...existing.data.metadata, posterPath: path } }).eq('wallet_address', auth.wallet).eq('id', id);
      if (updated.error) throw updated.error;
      const poster = await db.storage.from(BUCKET).createSignedUrl(path, 86400);
      if (poster.error) throw poster.error;
      return jsonResponse({ posterUrl: poster.data.signedUrl });
    }
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
      for (const key of ['prompt','resolvedPrompt','model','modelName','aspect','transcript','posterUrl']) {
        if (input[key] !== undefined && typeof input[key] !== 'string') return jsonResponse({ error: 'Invalid generation metadata' }, 400);
      }
      if (input.posterUrl !== undefined && (input.posterUrl.length > 4096 || !/^https:\/\//i.test(input.posterUrl))) {
        return jsonResponse({ error: 'Invalid preview URL' }, 400);
      }
      const metadata = Object.fromEntries(FIELDS.filter((key) => input[key] !== undefined).map((key) => [key,input[key]]));
      if (JSON.stringify(metadata).length > 100000) return jsonResponse({ error: 'Generation metadata is too large' }, 413);
      const existing = await db.from('creator_assets').select('ready,metadata').eq('wallet_address', auth.wallet).eq('id',id).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data?.ready) {
        if (existing.data.metadata?.posterPath === `${auth.wallet}/${id}/preview`) metadata.posterPath = existing.data.metadata.posterPath;
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
