/** `agent` tags signed-in views as agent traffic; they still count in the public totals. */
type Viewer = { token: string; agent?: boolean } | { anonymousUrl: string; deviceId: string };

/** Send impressions through the same public counters and cooldowns as the apps. */
export async function recordPostViews(ids: unknown[], viewer: Viewer, request: typeof fetch = fetch): Promise<void> {
  const tokenIds = [...new Set(ids.filter((id): id is string | number =>
    (typeof id === 'string' || typeof id === 'number') && /^\d+$/.test(String(id)) &&
    Number.isSafeInteger(Number(id)) && Number(id) >= 0).map(Number))];
  for (let start = 0; start < tokenIds.length; start += 50) {
    const batch = tokenIds.slice(start, start + 50);
    const signedIn = 'token' in viewer;
    const response = await request(signedIn ? 'https://api.dehub.io/api/view/batch' : viewer.anonymousUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(signedIn ? { Authorization: `Bearer ${viewer.token}` } : {}) },
      body: JSON.stringify(signedIn ? { tokenIds: batch, ...(viewer.agent ? { source: 'agent' } : {}) } : { tokenIds: batch.map(String), deviceId: viewer.deviceId }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok || (await response.json()).success !== true) {
      throw new Error(`Could not record public post views (${response.status}). Please retry.`);
    }
  }
}

/** A stable, salted identity for unsigned connectors; never persist the raw IP. */
export async function anonymousViewerId(req: Request, salt: string): Promise<string> {
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|mcp|${ip}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
