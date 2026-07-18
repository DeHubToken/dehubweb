/**
 * Client-side renderer for generated Builder apps.
 *
 * Supabase serves user-uploaded HTML as `text/plain` + `X-Content-Type-Options:
 * nosniff` on both the functions and storage origins (anti-phishing), so an
 * iframe/tab pointed straight at the file never renders. But the object is
 * public with `Access-Control-Allow-Origin: *`, so we fetch the HTML text and
 * render it ourselves in a sandboxed iframe via `srcdoc`.
 *
 * The iframe is sandboxed WITHOUT `allow-same-origin`, so the generated
 * (untrusted, AI-written) app runs on an opaque origin — it cannot read
 * dehub.io's localStorage, cookies, or DOM. A `<base>` tag points relative
 * asset URLs (app.js, style.css) back at Storage, which serves those with the
 * correct content-type. A small storage shim keeps apps that call
 * localStorage/sessionStorage working (in-memory, per preview session) instead
 * of throwing on the opaque origin.
 */
import { builderStorageBase } from "@/lib/builder/api";

/** sandbox flags: scripts + typical app needs, but NOT allow-same-origin. */
export const BUILDER_IFRAME_SANDBOX = "allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox";

const STORAGE_SHIM = `<script>(function(){
  function mk(){var m={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(m,k)?m[k]:null;},setItem:function(k,v){m[k]=String(v);},removeItem:function(k){delete m[k];},clear:function(){m={};},key:function(i){return Object.keys(m)[i]||null;},get length(){return Object.keys(m).length;}};}
  try{window.localStorage.setItem('__probe','1');window.localStorage.removeItem('__probe');}
  catch(e){try{Object.defineProperty(window,'localStorage',{value:mk(),configurable:true});}catch(_){}}
  try{window.sessionStorage.setItem('__probe','1');window.sessionStorage.removeItem('__probe');}
  catch(e){try{Object.defineProperty(window,'sessionStorage',{value:mk(),configurable:true});}catch(_){}}
})();</script>`;

/**
 * Wrap raw generated HTML so it renders correctly inside a sandboxed iframe:
 * inject a <base> (so relative assets resolve to Storage) and the storage shim.
 */
export function wrapAppHtml(html: string, projectId: string): string {
  const base = builderStorageBase(projectId);
  const head = `<base href="${base}">${STORAGE_SHIM}`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}${head}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${head}</head>`);
  }
  return `<head>${head}</head>${html}`;
}

/**
 * Fetch a generated app's index.html and return it wrapped for iframe srcdoc.
 * Throws if the app isn't reachable yet (still building).
 */
export async function loadBuilderAppHtml(projectId: string, version?: number): Promise<string> {
  const bust = version ? `?v=${version}` : "";
  const res = await fetch(`${builderStorageBase(projectId)}index.html${bust}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`App not ready (${res.status})`);
  return wrapAppHtml(await res.text(), projectId);
}
