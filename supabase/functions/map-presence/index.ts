import {
  handleCorsPreflight,
  jsonResponse,
  requireDeHubAuth,
  serviceClient,
} from '../_shared/auth.ts';

const MAX_ROWS = 5000;

function coarsen(value: number, precisionKm: number): number {
  const degrees = Math.max(0.01, precisionKm / 111);
  return Math.round(value / degrees) * degrees;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const db = serviceClient();
  if (req.method === 'GET') {
    const { data, error } = await db.from('arcade_map_presence')
      .select('public_id,latitude,longitude,username,avatar_url,updated_at')
      .order('updated_at', { ascending: false }).limit(MAX_ROWS);
    if (error) return jsonResponse({ error: 'Could not load the community map.' }, 500);
    return jsonResponse({ people: (data || []).map((row) => ({
      id: row.public_id,
      name: row.username || 'Community member',
      latitude: row.latitude,
      longitude: row.longitude,
      avatar_url: row.avatar_url,
      profile_url: row.username ? `https://dehub.io/${encodeURIComponent(row.username)}` : null,
    })) });
  }

  if (req.method === 'DELETE') {
    const auth = await requireDeHubAuth(req);
    if (!auth.ok) return auth.response;
    const { error } = await db.from('arcade_map_presence').delete().eq('wallet_address', auth.wallet);
    return error ? jsonResponse({ error: 'Could not remove your map presence.' }, 500) : jsonResponse({ removed: true });
  }

  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);
  const auth = await requireDeHubAuth(req);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null);
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  const precisionKm = Math.round(Math.min(100, Math.max(1, Number(body?.precisionKm) || 25)));
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return jsonResponse({ error: 'Valid coordinates are required.' }, 400);
  }
  const username = typeof body?.username === 'string' ? body.username.trim().slice(0, 80) || null : null;
  const avatarUrl = typeof body?.avatarUrl === 'string' && /^https:\/\//i.test(body.avatarUrl)
    ? body.avatarUrl.slice(0, 1000) : null;
  const { error } = await db.from('arcade_map_presence').upsert({
    wallet_address: auth.wallet,
    latitude: coarsen(latitude, precisionKm),
    longitude: coarsen(longitude, precisionKm),
    precision_km: precisionKm,
    username,
    avatar_url: avatarUrl,
    updated_at: new Date().toISOString(),
  });
  return error ? jsonResponse({ error: 'Could not place you on the map.' }, 500)
    : jsonResponse({ placed: true, precisionKm });
});
