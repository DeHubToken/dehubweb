import { createHandler } from './handler.ts';

// Server-to-server only; deliberately no browser CORS access.
Deno.serve(createHandler(name => Deno.env.get(name)));
