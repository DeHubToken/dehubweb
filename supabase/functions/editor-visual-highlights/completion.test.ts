import { test } from "node:test";
import assert from "node:assert/strict";
import { createVisualCompletion } from "./completion.ts";
import type { UsageMeter } from "../_shared/ai-usage.ts";

const body = { model: "google/gemini-2.5-flash", messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "data:image/jpeg;base64,fixture" } }] }] };
test("a successful image route is accounted for once and never asks the paid fallback", async () => {
  let freeCalls=0, paidCalls=0, flushes=0;
  const meter={streaming:false,flush:()=>{flushes++;}} as UsageMeter;
  const free=Response.json({choices:[]},{headers:{"x-ai-route":"free"}});
  const complete=createVisualCompletion({meter:()=>meter,free:async(value,signal,counter)=>{assert.equal(value,body);assert.equal(counter,meter);assert.equal(signal.aborted,false);freeCalls++;return free;},paid:async()=>{paidCalls++;return new Response();}});
  assert.equal(await complete(body,new AbortController().signal),free);
  assert.equal(freeCalls,1);assert.equal(paidCalls,0);assert.equal(flushes,1);
});
test("unavailable image quota preserves the original fallback and response headers",async()=>{
  let freeCalls=0,paidCalls=0,flushes=0;
  const fallback=new Response("unavailable",{status:502,headers:{"x-ai-fallback":"direct_http_402"}});
  const complete=createVisualCompletion({meter:()=>({streaming:false,flush:()=>{flushes++;}} as UsageMeter),free:async()=>{freeCalls++;return null;},paid:async(value)=>{assert.equal(value,body);paidCalls++;return fallback;}});
  const result=await complete(body,new AbortController().signal);
  assert.equal(result,fallback);assert.equal(result.headers.get("x-ai-fallback"),"direct_http_402");
  assert.equal(freeCalls,1);assert.equal(paidCalls,1);assert.equal(flushes,1);
});
test("cancellation before or during the image request never starts the fallback",async()=>{
  let freeCalls=0,paidCalls=0;
  const controller=new AbortController();
  const complete=createVisualCompletion({meter:()=>({streaming:false,flush:()=>{}} as UsageMeter),free:async()=>{freeCalls++;controller.abort();return null;},paid:async()=>{paidCalls++;return new Response();}});
  await assert.rejects(complete(body,controller.signal),/cancelled/);
  await assert.rejects(complete(body,controller.signal),/cancelled/);
  assert.equal(freeCalls,1);assert.equal(paidCalls,0);
});
