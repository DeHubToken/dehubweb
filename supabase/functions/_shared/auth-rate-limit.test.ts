import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { checkRateLimit } from './auth.ts';

Deno.test('rate limiter uses one atomic budget operation and preserves its result', async () => {
  const calls: unknown[][]=[];
  const client={rpc:async (...args:unknown[])=>{
    calls.push(args);
    return {error:null,data:[{allowed:true,remaining:4,reset_at:'2030-01-01T00:00:00Z'}]};
  }};
  const result=await checkRateLimit(client as never,'wallet','action',{limit:5,windowMs:60000});
  assertEquals(calls,[['consume_edge_rate_limit',{p_bucket_key:'wallet',p_action_type:'action',p_limit:5,p_window_ms:60000}]]);
  assertEquals(result.allowed,true);
  assertEquals(result.remaining,4);
  assertEquals(result.resetAt.toISOString(),'2030-01-01T00:00:00.000Z');
});
Deno.test('rate limiter cannot fail open on missing rows, storage errors or exceptions', async () => {
  for(const response of [{data:null,error:null},{data:null,error:{code:'offline'}},{data:[{allowed:true,reset_at:'bad'}],error:null}]) {
    const result=await checkRateLimit({rpc:async()=>response} as never,'wallet','action',{limit:5,windowMs:60000});
    assertEquals(result.allowed,false);
  }
  const result=await checkRateLimit({rpc:()=>{throw new Error('offline');}} as never,'wallet','action',{limit:5,windowMs:60000});
  assertEquals(result.allowed,false);
});
