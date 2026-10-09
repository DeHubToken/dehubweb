import { describe, it, expect, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useCloudProjectPresence } from "./useCloudProjectPresence";
const actor="0x"+"a".repeat(40),owner="0x"+"b".repeat(40),id="11111111-1111-4111-8111-111111111111";
function setup() {
  const binding=vi.fn(async()=>({owner,projectId:id,revision:3})), session=vi.fn(async()=>({token:"signed",expiresAt:Date.now()+3600000}));
  const sockets: {close:ReturnType<typeof vi.fn>}[]=[];
  const original=globalThis.WebSocket;
  globalThis.WebSocket=class {close=vi.fn();send=vi.fn();constructor(){sockets.push(this);}} as unknown as typeof WebSocket;
  let live!:ReturnType<typeof useCloudProjectPresence>;
  const factory=()=>({session:{binding}});
  function Harness({wallet=actor,project="local"}:{wallet?:string;project?:string}){live=useCloudProjectPresence(wallet,project,factory,session);return <div>{live.status}</div>;}
  return {Harness,binding,session,sockets,live:()=>live,restore:()=>{globalThis.WebSocket=original;}};
}
describe("live session scope",()=>{
  it("never connects or reads cloud bindings before joining",()=>{const e=setup();const view=render(<e.Harness/>);expect(e.binding).not.toHaveBeenCalled();expect(e.session).not.toHaveBeenCalled();expect(e.sockets).toHaveLength(0);view.unmount();e.restore();});
  it("leaves when the project changes",async()=>{const e=setup();const view=render(<e.Harness/>);await act(async()=>{await e.live().join();});expect(e.sockets).toHaveLength(1);view.rerender(<e.Harness project="other"/>);expect(e.sockets[0].close).toHaveBeenCalledTimes(1);expect(e.live().status).toBe("idle");view.unmount();e.restore();});
  it("leaves when the wallet changes",async()=>{const e=setup();const view=render(<e.Harness/>);await act(async()=>{await e.live().join();});view.rerender(<e.Harness wallet={owner}/>);expect(e.sockets[0].close).toHaveBeenCalledTimes(1);view.unmount();e.restore();});
  it("ignores a binding transfer after the account changes",async()=>{const e=setup();let finish!:(value:{owner:string;projectId:string;revision:number})=>void;e.binding.mockImplementation(()=>new Promise(done=>{finish=done;}));const view=render(<e.Harness/>);let pending!:Promise<void>;act(()=>{pending=e.live().join();});view.rerender(<e.Harness wallet={owner}/>);await act(async()=>{finish({owner,projectId:id,revision:3});await pending;});expect(e.session).not.toHaveBeenCalled();expect(e.sockets).toHaveLength(0);view.unmount();e.restore();});
});
