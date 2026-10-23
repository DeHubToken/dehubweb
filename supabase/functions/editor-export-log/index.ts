// Editor export journal.
// =====================
// Every video export the editor starts, finishes or fails is written here, so a
// failed download is never a silent loss: support can see who tried to export
// what, from which browser, and why it broke, then hand the creator their video.
//
// The journal is JSON files in the private `creator-assets` bucket under
// `<wallet>/export-logs/`, next to that wallet's archived generations. Files need
// no schema migration, are covered by the same per-wallet erasure as the rest of
// the folder, and are read back by the `admin-user-creations` function.
//
// Signed-in callers are keyed on the wallet from their verified token. Signed-out
// exports are still journalled, under `anonymous/`, rate limited by IP.
import { callerIp, checkRateLimit, handleCorsPreflight, jsonResponse, requireDeHubAuth, serviceClient } from '../_shared/auth.ts';

const BUCKET = 'creator-assets';
const EVENTS = ['started', 'succeeded', 'failed', 'cancelled', 'backed_up', 'backup_failed'];
const SURFACES = ['download', 'post', 'agent'];

const text = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : null;
const num = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);

  let wallet = 'anonymous';
  if (req.headers.get('x-dehub-token')) {
    const auth = await requireDeHubAuth(req);
    if (auth.ok) wallet = auth.wallet.toLowerCase();
  }
  const db = serviceClient();
  const limited = await checkRateLimit(db, wallet === 'anonymous' ? `ip:${callerIp(req)}` : wallet, 'editor-export-log', { limit: 60, windowMs: 60_000 });
  if (!limited.allowed) return jsonResponse({ ok: false }, 429);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonResponse({ error: 'JSON body required' }, 400); }
  const event = text(body.event, 20);
  if (!event || !EVENTS.includes(event)) return jsonResponse({ error: 'Unknown event' }, 400);

  const exportId = text(body.exportId, 80) ?? crypto.randomUUID();
  const at = new Date();
  const entry = {
    exportId,
    event,
    at: at.toISOString(),
    wallet,
    surface: SURFACES.includes(String(body.surface)) ? body.surface : null,
    projectId: text(body.projectId, 80),
    projectTitle: text(body.projectTitle, 200),
    format: text(body.format, 10),
    width: num(body.width),
    height: num(body.height),
    durationSeconds: num(body.durationSeconds),
    bytes: num(body.bytes),
    elapsedMs: num(body.elapsedMs),
    videoCodec: text(body.videoCodec, 40),
    audioCodec: text(body.audioCodec, 40),
    // Media ids on the timeline. Creator generations keep their job id here, which
    // is how a failed export is matched back to the paid render it was made from.
    mediaIds: Array.isArray(body.mediaIds) ? body.mediaIds.filter((id) => typeof id === 'string').slice(0, 50).map((id) => id.slice(0, 120)) : [],
    mediaNames: Array.isArray(body.mediaNames) ? body.mediaNames.filter((n) => typeof n === 'string').slice(0, 50).map((n) => n.slice(0, 200)) : [],
    backupAssetId: text(body.backupAssetId, 80),
    error: text(body.error, 2000),
    page: text(body.page, 300),
    userAgent: text(req.headers.get('user-agent'), 400),
  };

  const path = `${wallet}/export-logs/${at.toISOString().replace(/[:.]/g, '-')}-${event}-${exportId}.json`;
  const upload = await db.storage.from(BUCKET).upload(path, new Blob([JSON.stringify(entry)], { type: 'application/json' }), {
    contentType: 'application/json', upsert: true,
  });
  if (upload.error) {
    console.error('[editor-export-log] write failed', String(upload.error.message));
    return jsonResponse({ ok: false }, 503);
  }
  return jsonResponse({ ok: true, exportId });
});
