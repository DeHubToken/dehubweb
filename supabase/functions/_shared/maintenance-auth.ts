import { corsHeaders } from './cors.ts';

/** Maintenance routes accept only short-lived, action-scoped server proofs. */
export async function maintenanceGate(req: Request, verify: (token: string) => Promise<boolean>): Promise<Response | null> {
  const reply = (status: number, error: string) => new Response(JSON.stringify({ error }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
  if (req.method !== 'POST') return reply(405, 'POST only');
  const token = req.headers.get('x-maintenance-token') || '';
  if (!/^\d{1,12}\.[a-f0-9]{64}$/.test(token)) return reply(401, 'Unauthorized');
  try {
    return await verify(token) ? null : reply(401, 'Unauthorized');
  } catch {
    return reply(503, 'Maintenance verification unavailable');
  }
}
