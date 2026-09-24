// Editor cloud media: the only door to `editor_assets` and the `editor-assets`
// bucket. Both used to be reached from the browser under RLS that trusted an
// `x-wallet-address` header, which anyone can set, so any wallet's media could
// be listed or deleted. Here the wallet comes from the verified DeHub token and
// every read and write goes through the service role.
import { handleCorsPreflight, jsonResponse, requireDeHubAuth, serviceClient, checkRateLimit } from '../_shared/auth.ts';

const BUCKET = 'editor-assets';
const ID = /^[a-zA-Z0-9_-]{6,80}$/;
const KINDS = ['video', 'audio', 'image', 'export'];
const EXT = /^[a-z0-9]{1,5}$/;
const SIGN_TTL = 60 * 60 * 4;

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);
  const auth = await requireDeHubAuth(req);
  if (!auth.ok) return auth.response;
  const wallet = auth.wallet.toLowerCase();
  const db = serviceClient();
  const limited = await checkRateLimit(db, wallet, 'editor-assets', { limit: 600, windowMs: 60_000 });
  if (!limited.allowed) return jsonResponse({ error: 'Slow down a little and try again.' }, 429);

  const own = (path: unknown): path is string =>
    typeof path === 'string' && path.startsWith(`${wallet}/`) && !path.includes('..');

  try {
    const body = await req.json();
    switch (body.action) {
      case 'list': {
        const { data, error } = await db.from('editor_assets').select('*')
          .eq('wallet_address', wallet).order('created_at', { ascending: false });
        if (error) throw error;
        return jsonResponse({ assets: data ?? [] });
      }

      case 'sign': {
        const paths = (Array.isArray(body.paths) ? body.paths : []).slice(0, 200);
        if (!paths.every(own)) return jsonResponse({ error: 'Not your file' }, 403);
        if (paths.length === 0) return jsonResponse({ urls: {} });
        const { data, error } = await db.storage.from(BUCKET).createSignedUrls(paths, SIGN_TTL);
        if (error) throw error;
        const urls: Record<string, string> = {};
        for (const row of data ?? []) if (row.path && row.signedUrl) urls[row.path] = row.signedUrl;
        return jsonResponse({ urls, ttl: SIGN_TTL });
      }

      case 'prepare': {
        const id = String(body.id ?? '');
        const ext = String(body.ext ?? '');
        if (!ID.test(id) || !EXT.test(ext)) return jsonResponse({ error: 'Invalid upload' }, 400);
        const original = `${wallet}/${id}/original.${ext}`;
        const up = await db.storage.from(BUCKET).createSignedUploadUrl(original, { upsert: true });
        if (up.error) throw up.error;
        let thumb: { path: string; token: string } | null = null;
        if (body.thumbnail) {
          const path = `${wallet}/${id}/thumb.jpg`;
          const t = await db.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
          if (t.error) throw t.error;
          thumb = { path, token: t.data.token };
        }
        return jsonResponse({ original: { path: original, token: up.data.token }, thumb });
      }

      case 'commit': {
        const r = body.row ?? {};
        const id = String(r.id ?? '');
        if (!ID.test(id) || !KINDS.includes(r.kind) || !own(r.storage_path)) {
          return jsonResponse({ error: 'Invalid asset' }, 400);
        }
        if (r.thumbnail_path != null && !own(r.thumbnail_path)) return jsonResponse({ error: 'Invalid asset' }, 400);
        const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
        const row = {
          id,
          wallet_address: wallet,
          name: String(r.name ?? 'Untitled').slice(0, 200),
          kind: r.kind,
          mime_type: String(r.mime_type ?? '').slice(0, 100),
          size_bytes: Math.max(0, Math.round(Number(r.size_bytes) || 0)),
          storage_path: r.storage_path,
          thumbnail_path: r.thumbnail_path ?? null,
          duration_seconds: num(r.duration_seconds),
          width: num(r.width),
          height: num(r.height),
          preserved: Boolean(r.preserved),
          posted_post_id: r.posted_post_id ? String(r.posted_post_id) : null,
          provenance: r.provenance ?? null,
          last_used_at: new Date().toISOString(),
        };
        const { data: existing } = await db.from('editor_assets').select('wallet_address').eq('id', id).maybeSingle();
        if (existing && existing.wallet_address?.toLowerCase() !== wallet) return jsonResponse({ error: 'Invalid asset' }, 409);
        const { data, error } = await db.from('editor_assets').upsert(row).select('*').single();
        if (error) throw error;
        return jsonResponse({ asset: data });
      }

      case 'discard': {
        const paths = (Array.isArray(body.paths) ? body.paths : []).slice(0, 10);
        if (!paths.every(own)) return jsonResponse({ error: 'Not your file' }, 403);
        if (paths.length) await db.storage.from(BUCKET).remove(paths);
        return jsonResponse({ ok: true });
      }

      case 'remove': {
        const id = String(body.id ?? '');
        if (!ID.test(id)) return jsonResponse({ error: 'Invalid asset' }, 400);
        const { data: row } = await db.from('editor_assets').select('storage_path, thumbnail_path')
          .eq('id', id).eq('wallet_address', wallet).maybeSingle();
        if (!row) return jsonResponse({ ok: true });
        const paths = [row.storage_path, row.thumbnail_path].filter(own);
        if (paths.length) {
          const { error: rmErr } = await db.storage.from(BUCKET).remove(paths);
          if (rmErr) console.warn('editor-assets remove', rmErr.message);
        }
        const { error } = await db.from('editor_assets').delete().eq('id', id).eq('wallet_address', wallet);
        if (error) throw error;
        return jsonResponse({ ok: true });
      }

      case 'touch': {
        const id = String(body.id ?? '');
        if (!ID.test(id)) return jsonResponse({ error: 'Invalid asset' }, 400);
        await db.from('editor_assets').update({ last_used_at: new Date().toISOString() })
          .eq('id', id).eq('wallet_address', wallet);
        return jsonResponse({ ok: true });
      }

      case 'preserve': {
        const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((i: string) => ID.test(i)).slice(0, 500);
        if (ids.length === 0) return jsonResponse({ ok: true });
        const { error } = await db.from('editor_assets')
          .update({ preserved: true, posted_post_id: String(body.postedPostId ?? ''), last_used_at: new Date().toISOString() })
          .in('id', ids).eq('wallet_address', wallet);
        if (error) throw error;
        return jsonResponse({ ok: true });
      }

      case 'usage': {
        const { data, error } = await db.rpc('get_editor_storage_usage', { _wallet: wallet });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        return jsonResponse({ used_bytes: Number(row?.used_bytes ?? 0), asset_count: Number(row?.asset_count ?? 0) });
      }

      default:
        return jsonResponse({ error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (err) {
    console.error('editor-assets error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
