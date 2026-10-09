import { describe, it, expect, vi } from "vitest";
import { EditorPresenceRoom, handleEditorPresence, presenceRoute } from "../../server/editor-presence";
const actor="0x"+"a".repeat(40),owner="0x"+"b".repeat(40),id="11111111-1111-4111-8111-111111111111";
const url=`https://dehub.io/api/editor/presence/${owner}/${id}`;
const token=(wallet:string,seconds=Math.floor(Date.now()/1000)+3600)=>`${wallet}.${seconds}.${"a".repeat(64)}`;
function setup() {
  const sockets: any[]=[];let revoked=false,head=3;
  const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{const wallet=new Headers(init?.headers).get("x-wallet-address");return new Response(JSON.stringify({wallet,ownerWallet:owner,projectId:id,role:wallet===owner?"owner":"editor",revision:head}),{status:revoked&&wallet===actor?401:200});});
  const context={getWebSockets:()=>sockets,acceptWebSocket:()=>{},storage:{setAlarm:vi.fn(async()=>{}),deleteAlarm:vi.fn(async()=>{})}};
  const room=new EditorPresenceRoom(context,null,fetcher);
  const socket=()=>{let attachment:any={owner,projectId:id,deadline:Date.now()+10000};const ws={send:vi.fn(),close:vi.fn(),serializeAttachment:(value:unknown)=>{attachment=value;},deserializeAttachment:()=>attachment};sockets.push(ws);return ws;};
  const join=async(wallet:string)=>{const ws=socket();await room.webSocketMessage(ws,JSON.stringify({type:"join",wallet,token:token(wallet)}));return ws;};
  return {room,context,fetcher,socket,join,revoke:()=>{revoked=true;},head:(value:number)=>{head=value;},last:(ws:ReturnType<typeof socket>)=>JSON.parse(ws.send.mock.calls.at(-1)![0]),wake:()=>new EditorPresenceRoom(context,null,fetcher)};
}
describe("signed editor presence room",()=>{
  it("keeps sessions out of URLs and rejects other origins",async()=>{expect(presenceRoute(new Request(url+"?token=private"))).toBeNull();expect((await handleEditorPresence(new Request(url,{headers:{Upgrade:"websocket",Origin:"https://other.example"}}),{})).status).toBe(403);expect((await handleEditorPresence(new Request(url),{})).status).toBe(426);});
  it("fails closed without the production binding",async()=>{expect((await handleEditorPresence(new Request(url,{headers:{Upgrade:"websocket"}}),{})).status).toBe(503);});
  it("authenticates joins and revalidates every recipient before broadcasting",async()=>{const e=setup(),first=await e.join(owner),second=await e.join(actor);expect(e.last(first).participants).toEqual([{wallet:actor,connections:1},{wallet:owner,connections:1}]);expect(e.last(second).revision).toBe(3);const init=e.fetcher.mock.calls[0][1]!;expect(new Headers(init.headers).get("x-wallet-session")).toBe(token(owner));expect(JSON.parse(String(init.body))).toEqual({p_owner:owner,p_id:id});});
  it("counts separate connections of one wallet without inventing extra people",async()=>{const e=setup(),first=await e.join(owner);await e.join(owner);expect(e.last(first).participants).toEqual([{wallet:owner,connections:2}]);});
  it("removes a revoked peer before sending the next saved head",async()=>{const e=setup(),first=await e.join(owner),second=await e.join(actor);e.revoke();e.head(4);await e.wake().webSocketClose(e.socket());expect(e.last(first)).toEqual({type:"presence",revision:4,participants:[{wallet:owner,connections:1}]});expect(e.last(second)).toEqual({type:"error"});expect(second.deserializeAttachment()).toBeNull();});
  it("restores authorized attachments after a new room instance wakes",async()=>{const e=setup(),ws=await e.join(owner);await e.wake().webSocketClose(e.socket());expect(e.last(ws).participants).toEqual([{wallet:owner,connections:1}]);});
  it.each(["malformed","oversize","binary","wrong wallet","expired","refresh before join"])("rejects %s without reading project data",async kind=>{const e=setup(),ws=e.socket();const value=kind==="malformed"?"{":kind==="oversize"?"x".repeat(2049):kind==="binary"?new ArrayBuffer(5):kind==="wrong wallet"?JSON.stringify({type:"join",wallet:owner,token:token(actor)}):kind==="expired"?JSON.stringify({type:"join",wallet:actor,token:token(actor,1)}):'{"type":"refresh"}';await e.room.webSocketMessage(ws,value);expect(e.fetcher).not.toHaveBeenCalled();expect(ws.close).toHaveBeenCalled();expect(ws.deserializeAttachment()).toBeNull();});
  it("clears expired sessions and the last security alarm",async()=>{const e=setup(),ws=e.socket();ws.serializeAttachment({owner,projectId:id,deadline:1});await e.room.alarm();expect(ws.deserializeAttachment()).toBeNull();expect(e.context.storage.deleteAlarm).toHaveBeenCalled();expect(e.fetcher).not.toHaveBeenCalled();});
  it("never sends private presence after permission lookup failure",async()=>{const e=setup();e.fetcher.mockRejectedValueOnce(new Error("network"));const ws=await e.join(actor);expect(e.last(ws)).toEqual({type:"error"});expect(ws.deserializeAttachment()).toBeNull();});
});
