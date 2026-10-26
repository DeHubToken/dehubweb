import { corsHeaders, requireDeHubAuth } from './auth.ts';
import { generationTicket } from './generation-jobs.ts';

const reply = (error: string, status: number) => new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** Authenticate before looking up a private ticket; provider routing comes from its journal. */
export async function authorizeVideoPoll(req: Request, predictionId: unknown) {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const internal = !!serviceKey && req.headers.get('Authorization') === `Bearer ${serviceKey}`;
  let wallet: string | undefined;
  if (!internal) {
    const auth = await requireDeHubAuth(req);
    if (!auth.ok) return { ok: false as const, response: auth.response };
    wallet = auth.wallet;
  }
  if (typeof predictionId !== 'string' || !predictionId.trim() || predictionId.length > 200) {
    return { ok: false as const, response: reply('Invalid render ticket', 400) };
  }
  const ticket = await generationTicket('generate-video', predictionId);
  if (!ticket || !internal && ticket.wallet_address?.toLowerCase() !== wallet?.toLowerCase()) {
    return { ok: false as const, response: reply('Render not found', 404) };
  }
  if (!['replicate', 'fal', 'kie', 'kie-veo', 'venice'].includes(ticket.provider)) {
    return { ok: false as const, response: reply('Render routing is pending. Reconnect to collect it.', 503) };
  }
  return { ok: true as const, ticket };
}
