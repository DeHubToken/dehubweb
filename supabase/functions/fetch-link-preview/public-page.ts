import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { pinnedHttp } from './pinned-http.ts';

export function isPublicAddress(address: string): boolean {
  const h = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(h) === 4) {
    const [a,b,c] = h.split('.').map(Number);
    return !(a===0 || a===10 || a===127 || a>=224 || (a===169&&b===254)
      || (a===172&&b>=16&&b<=31) || (a===192&&b===168) || (a===100&&b>=64&&b<=127)
      || (a===192&&b===0&&(c===0||c===2)) || (a===192&&b===88&&c===99) || (a===198&&(b===18||b===19))
      || (a===198&&b===51&&c===100) || (a===203&&b===0&&c===113));
  }
  // Global unicast only; mapped/compatible IPv4, local, multicast and
  // transition mechanisms never get another chance to resolve internally.
  if (isIP(h) !== 6 || !/^[23][0-9a-f]{3}:/.test(h)) return false;
  if (h.startsWith('2002:') || h.startsWith('2001:db8:')) return false;
  if (h.startsWith('2001:') && parseInt(h.split(':')[1] || '0',16)<0x200) return false;
  return true;
}

export function parsePublicUrl(raw: unknown): URL {
  if (typeof raw!=='string' || !raw.trim() || raw.length>8192) throw new Error('Invalid URL');
  const url=new URL(raw.trim());
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid URL');
  if (url.port && url.port!=='80' && url.port!=='443') throw new Error('URL port is not allowed');
  const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');
  if (!host || host==='localhost' || /\.(localhost|local|internal)$/.test(host)
    || (isIP(host) && !isPublicAddress(host))) throw new Error('URL host is not allowed');
  url.hash='';
  return url;
}

type Hop = {status:number; location?:string; html:string};
export type Resolver = (host:string) => Promise<Array<{address:string;family:number}>>;
export type Transport = (url:URL, address:{address:string;family:number}, signal:AbortSignal) => Promise<Hop>;

// Connect to the checked address, while preserving Host and TLS certificate
// verification against the original hostname. A second DNS lookup cannot rebind.
export const requestPinned: Transport = (url,address,signal) => pinnedHttp(url,address.address,signal);

export async function fetchPublicPage(raw:unknown, resolve:Resolver=host=>lookup(host,{all:true}), transport:Transport=requestPinned, timeoutMs=8000):Promise<{url:string;html:string}> {
  let url=parsePublicUrl(raw);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(new Error('Preview timed out')),timeoutMs);
  const deadline=new Promise<never>((_,reject)=>controller.signal.addEventListener('abort',()=>reject(controller.signal.reason),{once:true}));
  try {
    for(let redirects=0;redirects<=3;redirects++) {
      const host=url.hostname.replace(/^\[|\]$/g,'');
      const addresses=isIP(host) ? [{address:host,family:isIP(host)}] : await Promise.race([resolve(host),deadline]);
      if(!addresses.length || addresses.some(a=>!isPublicAddress(a.address))) throw new Error('URL host is not allowed');
      const address=addresses.find(a=>a.family===4) || addresses[0];
      const result=await Promise.race([transport(url,address,controller.signal),deadline]);
      if([301,302,303,307,308].includes(result.status)) {
        if(!result.location || redirects===3) throw new Error('Too many or invalid redirects');
        url=parsePublicUrl(new URL(result.location,url).href); continue;
      }
      return {url:url.href,html:result.html};
    }
    throw new Error('Too many redirects');
  } finally { clearTimeout(timer); controller.abort(); }
}
