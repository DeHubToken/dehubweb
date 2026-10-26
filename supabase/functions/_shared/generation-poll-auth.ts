import { corsHeaders, requireDeHubAuth } from './auth.ts';
import { generationTicket } from './generation-jobs.ts';

const reply = (error: string, status: number) => new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** Authenticate before looking up a private ticket; provider routing comes from its journal. */
export async function authorizeGenerationPoll(req: Request, endpoint: 'generate-video' | 'generate-3d' | 'fal-ai-tools', predictionId: unknown) {
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
  const ticket = await generationTicket(endpoint, predictionId);
  if (!ticket || !internal && ticket.wallet_address?.toLowerCase() !== wallet?.toLowerCase()) {
    return { ok: false as const, response: reply('Render not found', 404) };
  }
  const providers = endpoint === 'generate-video' ? ['replicate', 'fal', 'kie', 'kie-veo', 'venice'] : ['fal'];
  if (!providers.includes(ticket.provider)) {
    return { ok: false as const, response: reply('Render routing is pending. Reconnect to collect it.', 503) };
  }
  if (ticket.provider === 'fal' && (typeof ticket.provider_app !== 'string' || !ticket.provider_app.trim())) {
    return { ok: false as const, response: reply('Render routing is pending. Reconnect to collect it.', 503) };
  }
  return { ok: true as const, ticket };
}
