import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { describe,expect,it,vi } from "vitest";
import { useCloudProjects } from "./useCloudProjects";
import type { ProjectSnapshot } from "./types";
const actor="0x"+"b".repeat(40),owner="0x"+"a".repeat(40),otherActor="0x"+"c".repeat(40);
const fixture=():ProjectSnapshot=>({id:"local",title:"Local draft",updatedAt:1,settings:{width:1920,height:1080,fps:30,aspectPreset:"16:9",background:"#000"},clips:[],tracks:[]});
function setup() {
  let current=fixture(),role:"viewer"|"editor"="editor";
  const target={ownerWallet:owner,projectId:"shared",title:"Shared",revision:4,role:"editor" as const};
  const preserve=vi.fn(async()=>{}),open=vi.fn((snapshot:ProjectSnapshot)=>{current=snapshot;});
  const sharedOwner=vi.fn(async()=>owner as string|null),save=vi.fn(async()=>{}),openShared=vi.fn(async()=>({...fixture(),id:"joined"}));
  const review={inbox:vi.fn(async()=>[{...target,role,memberWallet:actor,accepted:true,revoked:false,stateVersion:2,savedAt:"2026-10-08"}]),comments:vi.fn(async()=>[]),members:vi.fn(async()=>[])};
  const factory=(()=>({uuid:()=>"nonce",api:{list:vi.fn(async()=>[]),review},session:{sharedOwner,save,openShared}})) as unknown as Parameters<typeof useCloudProjects>[1];
  let cloud:ReturnType<typeof useCloudProjects>;
  function Harness({wallet=actor}:{wallet?:string}){cloud=useCloudProjects(wallet,factory,{current:()=>current,preserve,open});return <div><span>{cloud.sharedOwner||"personal"}</span><span>{cloud.linkPending?"pending":"ready"}</span></div>;}
  return {Harness,cloud:()=>cloud,sharedOwner,save,openShared,preserve,open,target,setRole:(value:typeof role)=>{role=value;},change:()=>{current={...current,title:"Changed during transfer"};}};
}
describe("shared cloud project account and draft guards",()=>{
  it("reads the local link before showing the destination and makes no automatic save",async()=>{
    const env=setup();let finish!:(value:string|null)=>void;env.sharedOwner.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    const screen=render(<env.Harness/>);expect(screen.getByText("pending")).toBeTruthy();expect(env.save).not.toHaveBeenCalled();
    await act(async()=>{finish(owner);});expect(screen.getByText(owner)).toBeTruthy();expect(screen.getByText("ready")).toBeTruthy();
  });
  it("does not carry another account's destination through the same local project ID",async()=>{
    const env=setup(),screen=render(<env.Harness/>);await waitFor(()=>expect(screen.getByText(owner)).toBeTruthy());
    let finish!:(value:string|null)=>void;env.sharedOwner.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    screen.rerender(<env.Harness wallet={otherActor}/>);expect(screen.queryByText(owner)).toBeNull();expect(screen.getByText("pending")).toBeTruthy();
    await act(async()=>{finish(null);});expect(screen.getByText("personal")).toBeTruthy();expect(env.save).not.toHaveBeenCalled();
  });
  it("refuses viewer edits before preserving or downloading a shared project",async()=>{
    const env=setup();env.setRole("viewer");render(<env.Harness/>);
    await act(async()=>{await env.cloud().showReview({...env.target,role:"viewer"});});
    await act(async()=>{await env.cloud().openShared();});
    expect(env.cloud().error).toBe("Project editing access is unavailable");expect(env.preserve).not.toHaveBeenCalled();expect(env.openShared).not.toHaveBeenCalled();
  });
  it("preserves the current project but refuses to replace edits made during transfer",async()=>{
    const env=setup();render(<env.Harness/>);await act(async()=>{await env.cloud().showReview(env.target);});
    let finish!:(snapshot:ProjectSnapshot)=>void;env.openShared.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));let pending!:Promise<void>;
    await act(async()=>{pending=env.cloud().openShared();});expect(env.preserve).toHaveBeenCalledTimes(1);env.change();
    await act(async()=>{finish({...fixture(),id:"joined"});await pending;});
    expect(env.open).not.toHaveBeenCalled();expect(env.cloud().error).toBe("The current project changed during transfer");
  });
  it("opens accepted editor projects and changes the visible destination after a personal copy",async()=>{
    const env=setup();render(<env.Harness/>);await act(async()=>{await env.cloud().showReview(env.target);});
    await act(async()=>{await env.cloud().openShared();});expect(env.openShared).toHaveBeenCalledWith(owner,"shared");expect(env.open).toHaveBeenCalledTimes(1);
    await waitFor(()=>expect(env.cloud().linkPending).toBe(false));
    await act(async()=>{await env.cloud().save(true);});expect(env.save).toHaveBeenCalledWith(expect.objectContaining({id:"joined"}),true);expect(env.cloud().sharedOwner).toBeNull();
  });
});
