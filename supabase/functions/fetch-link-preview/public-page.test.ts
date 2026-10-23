import { assertEquals, assertRejects, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createServer } from 'node:http';
import { fetchPublicPage, isPublicAddress, parsePublicUrl, requestPinned, type Transport } from './public-page.ts';

const publicDns = async () => [{address:'93.184.215.14',family:4}];
Deno.test('rejects non-public literals, mapped IPv6 and malformed inputs', () => {
  for(const address of ['127.0.0.1','10.1.2.3','169.254.169.254','100.64.0.1','192.168.0.1','224.0.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2002:7f00:1::','2001:db8::1']) {
    assertEquals(isPublicAddress(address),false,address);
    assertThrows(()=>parsePublicUrl(`http://${address.includes(':')?'['+address+']':address}/`));
  }
  for(const raw of [null,{},12,'file:///etc/passwd','http://user:pass@example.com','http://example.com:22','http://localhost.','http://internal.local','http://2130706433']) assertThrows(()=>parsePublicUrl(raw));
});
Deno.test('preserves unicode and valid hostnames beginning with fc/fd', async () => {
  for(const host of ['fcbayern.com','fd.example.com']) {
    const result=await fetchPublicPage(`https://${host}/café`,publicDns,async()=>({status:200,html:'ok'}));
    assertEquals(result.url,`https://${host}/caf%C3%A9`);
  }
  assertEquals(isPublicAddress('2606:4700:4700::1111'),true);
});
Deno.test('rejects private DNS answers before connecting, including mixed answers', async () => {
  let calls=0;
  const transport:Transport=async()=>{calls++;return {status:200,html:'bad'};};
  for(const answers of [[{address:'10.0.0.1',family:4}],[...(await publicDns()),{address:'::1',family:6}]]) {
    await assertRejects(()=>fetchPublicPage('https://example.com',async()=>answers,transport));
  }
  assertEquals(calls,0);
});
Deno.test('validates every redirect and pins the checked address', async () => {
  let calls=0;
  await assertRejects(()=>fetchPublicPage('https://example.com',publicDns,async(_url,address)=>{
    assertEquals(address.address,'93.184.215.14');calls++;
    return {status:302,location:'http://169.254.169.254/latest/meta-data',html:''};
  }));
  assertEquals(calls,1);
  let lookups=0;
  await assertRejects(()=>fetchPublicPage('https://example.com',async()=>++lookups===1?publicDns():[{address:'127.0.0.1',family:4}],async()=>({status:302,location:'https://other.example',html:''})));
  assertEquals(lookups,2);
});
Deno.test('limits redirect loops and covers stalled DNS and body with deadline', async () => {
  let hops=0;
  await assertRejects(()=>fetchPublicPage('https://example.com',publicDns,async()=>{hops++;return {status:302,location:'/',html:''};}));
  assertEquals(hops,4);
  await assertRejects(()=>fetchPublicPage('https://example.com',()=>new Promise(()=>{}),undefined,20));
  await assertRejects(()=>fetchPublicPage('https://example.com',publicDns,()=>new Promise(()=>{}),20));
});
Deno.test('pinned HTTP transport preserves Host and bounds response bodies', async () => {
  const server=createServer((req,res)=>{
    res.setHeader('Content-Type','text/html');
    if(req.url==='/large') return res.end('x'.repeat(1_048_577));
    if(req.url==='/redirect') {res.statusCode=302;res.setHeader('Location','http://127.0.0.1');return res.end();}
    res.end(`<title>${req.headers.host}</title>`);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address() as {port:number};
  const url=`http://does-not-resolve.invalid:${address.port}`;
  const signal=AbortSignal.timeout(2000);
  try {
    const result=await requestPinned(new URL(url),{address:'127.0.0.1',family:4},signal);
    assertEquals(result.html,`<title>does-not-resolve.invalid:${address.port}</title>`);
    await assertRejects(()=>requestPinned(new URL(url+'/large'),{address:'127.0.0.1',family:4},signal));
    const redirect=await requestPinned(new URL(url+'/redirect'),{address:'127.0.0.1',family:4},signal);
    assertEquals(redirect.status,302);
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});
