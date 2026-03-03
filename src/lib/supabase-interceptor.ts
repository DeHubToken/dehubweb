/**
 * Supabase Usage Interceptor
 * ==========================
 * Patches the global fetch to intercept Supabase REST and Edge Function calls
 * and track them via the cloud usage tracker.
 */

import { trackUsage } from './cloud-usage-tracker';

let patched = false;

export function installSupabaseInterceptor(): void {
  if (patched) return;
  patched = true;
  
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return;
  
  const originalFetch = window.fetch;
  
  window.fetch = async function (...args: Parameters<typeof fetch>): Promise<Response> {
    const [input, init] = args;
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    
    if (!url.includes(supabaseUrl)) {
      return originalFetch.apply(this, args);
    }
    
    const method = init?.method || (typeof input !== 'string' && 'method' in input ? (input as Request).method : 'GET');
    const start = performance.now();
    
    let type: 'rest' | 'edge_function' | 'storage' = 'rest';
    let target = 'unknown';
    
    // Parse the URL to determine type and target
    if (url.includes('/functions/v1/')) {
      type = 'edge_function';
      const match = url.match(/\/functions\/v1\/([^?/]+)/);
      target = match?.[1] || 'unknown';
    } else if (url.includes('/storage/v1/')) {
      type = 'storage';
      const match = url.match(/\/storage\/v1\/([^?]+)/);
      target = match?.[1] || 'unknown';
    } else if (url.includes('/rest/v1/')) {
      type = 'rest';
      const match = url.match(/\/rest\/v1\/([^?]+)/);
      target = match?.[1] || 'unknown';
    }
    
    try {
      const response = await originalFetch.apply(this, args);
      const durationMs = Math.round(performance.now() - start);
      
      trackUsage({
        type,
        target,
        method: method.toUpperCase(),
        durationMs,
        status: response.status,
        error: response.status >= 400,
      });
      
      return response;
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      trackUsage({
        type,
        target,
        method: method.toUpperCase(),
        durationMs,
        error: true,
      });
      throw err;
    }
  };
}
