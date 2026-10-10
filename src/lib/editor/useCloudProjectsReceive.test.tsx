import React from "react";
TEST_.S
import { useCloudProjects } from "./useCloudProjects";
import { projectReviewSnapshotKey } from "./cloudProjectReview";
import type { ProjectSnapshot } from "./types";
const actor="0x"+"b".repeat(40),other="0x"+"c".repeat(40);
const fixture=():ProjectSnapshot=>({id:"device-project",title:"Film",updatedAt:1,settings:{width:1920,height:1080,fps:30,aspectPreset:"16:9",background:"#000000"},clips:[],tracks:[]});
function setup() {
  let current=fixture(),cloud!:ReturnType<typeof useCloudProjects>;
  const preserve=vi.fn(async()=>{}),open=vi.fn(),receive=vi.fn((snapshot:ProjectSnapshot,_key:string)=>{current=snapshot;return 3;});
  const receiveSaved=vi.fn(async(snapshot:ProjectSnapshot,accept:(value:ProjectSnapshot)=>void,guard:()=>void)=>{guard();accept({...snapshot,title:"Received"});guard();return {changed:true,revision:4};});
  const factory=vi.fn(()=>({uuid:()=>"unused",api:{list:async()=>[]},session:{sharedOwner:async()=>null,receiveSaved}})) as unknown as Parameters<typeof useCloudProjects>[1];
  function Harness({wallet=actor}:{wallet?:string}) {
    cloud=useCloudProjects(wallet,factory,{current:()=>current,preserve,open,receive});
    return <div>{cloud.linkPending?"pending":"ready"}</div>;
  }
  return {Harness,cloud:()=>cloud,current:()=>current,preserve,open,receive,receiveSaved,factory,
    change:()=>{current={...current,title:"Newer local edit"};},switchProject:()=>{current={...current,id:"other-project"};}};
}
describe("pinned shared timeline receive actions",()=>{
  it("applies into the existing editor without opening a new project or clearing history",async()=>{
    const env=setup(),screen=render(<env.Harness/>);await waitFor(()=>expect(screen.getByText("ready")).toBeTruthy());
    const key=projectReviewSnapshotKey(env.current());await act(async()=>{await env.cloud().receiveChanges();});
    expect(env.receive).toHaveBeenCalledWith(expect.objectContaining({id:"device-project",title:"Received"}),key);expect(env.open).not.toHaveBeenCalled();
    expect(env.cloud().received).toMatchObject({revision:4,changed:true,protectedUndo:3});expect(env.preserve).toHaveBeenCalledTimes(1);
  });
  it("refuses edits made during local preservation before requesting shared changes",async()=>{
    const env=setup(),screen=render(<env.Harness/>);await waitFor(()=>expect(screen.getByText("ready")).toBeTruthy());env.preserve.mockImplementation(async()=>{env.change();});
    await act(async()=>{await env.cloud().receiveChanges();});expect(env.receiveSaved).not.toHaveBeenCalled();expect(env.receive).not.toHaveBeenCalled();expect(env.current().title).toBe("Newer local edit");
  });
  it("keeps edits made while cloud transfer is waiting",async()=>{
    const env=setup(),screen=render(<env.Harness/>);await waitFor(()=>expect(screen.getByText("ready")).toBeTruthy());let finish!:()=>void,pending!:Promise<void>;
    env.receiveSaved.mockImplementation(async(snapshot,accept,guard)=>{await new Promise<void>(resolve=>{finish=resolve;});guard();accept(snapshot);return {changed:true,revision:4};});
    await act(async()=>{pending=env.cloud().receiveChanges();});env.change();await act(async()=>{finish();await pending;});
    expect(env.receive).not.toHaveBeenCalled();expect(env.current().title).toBe("Newer local edit");expect(env.cloud().received).toBeNull();expect(env.cloud().error).toBe("The current project changed during transfer");
  });
  it("discards a transfer from a project that is no longer open",async()=>{
    const env=setup(),screen=render(<env.Harness/>);await waitFor(()=>expect(screen.getByText("ready")).toBeTruthy());let finish!:()=>void,pending!:Promise<void>;
    env.receiveSaved.mockImplementation(async(snapshot,accept,guard)=>{await new Promise<void>(resolve=>{finish=resolve;});guard();accept(snapshot);return {changed:true,revision:4};});
    await act(async()=>{pending=env.cloud().receiveChanges();});env.switchProject();await act(async()=>{finish();await pending;});
    expect(env.receive).not.toHaveBeenCalled();expect(env.current().id).toBe("other-project");expect(env.cloud().received).toBeNull();
  });
  it("never applies another account's waiting transfer",async()=>{
    const env=setup(),screen=render(<env.Harness/>);await waitFor(()=>expect(screen.getByText("ready")).toBeTruthy());let finish!:()=>void,pending!:Promise<void>;
    env.receiveSaved.mockImplementation(async(snapshot,accept,guard)=>{await new Promise<void>(resolve=>{finish=resolve;});guard();accept(snapshot);return {changed:true,revision:4};});
    await act(async()=>{pending=env.cloud().receiveChanges();});screen.rerender(<env.Harness wallet={other}/>);await act(async()=>{finish();await pending;});
    expect(env.receive).not.toHaveBeenCalled();expect(env.cloud().received).toBeNull();expect(env.current().title).toBe("Film");
  });
  it("keeps receiving unavailable while signed out without creating a session or transfer",async()=>{
    const env=setup();render(<env.Harness wallet=""/>);await act(async()=>{await env.cloud().receiveChanges();});
    expect(env.cloud().available).toBe(false);expect(env.cloud().canReceive).toBe(false);expect(env.factory).not.toHaveBeenCalled();expect(env.preserve).not.toHaveBeenCalled();expect(env.receiveSaved).not.toHaveBeenCalled();
  });
});
