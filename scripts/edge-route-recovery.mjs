// Preserve the old inspection entry point without changing public DNS.
import { main } from './production-routing.mjs';
if ((process.env.ROUTING_MODE || 'inspect') !== 'inspect') {
  throw new Error('Zone-route recovery is retired. Preserve direct HTTPS delivery; see ops/DIRECT-RECOVERY.md.');
}
await main();
