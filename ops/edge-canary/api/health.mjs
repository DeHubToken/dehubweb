import { result } from '../lib/probe.mjs';
export function GET() { return result(200, { status: 'ok', service: 'dehub-edge-canary' }); }
