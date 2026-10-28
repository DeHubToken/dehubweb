import { describe, it, expect, vi, afterEach } from 'vitest';
import { admitAvatarPayment, resumeAvatarPayment, withAvatarAdmission, type AvatarPaymentAdapter } from './avatarPayment';
import type { AvatarSubmission } from './avatar';
afterEach(()=>vi.unstubAllGlobals());
const quote={priceDhb:405,priceUsd:.405,inputDigest:'a'.repeat(64),durationSeconds:6};
function setup() {
  let stored: AvatarSubmission|null=null, active=true;
  const events:string[]=[];
  const a:AvatarPaymentAdapter={input:{imageDataUrl:'portrait',audioDataUrl:'voice',rightsConfirmed:true,prompt:'Speak'},reviewed:quote,newId:()=> 'job-1',current:()=>active,
    load:async()=>stored,save:async value=>{stored=value;events.push(value.phase!);},quote:async()=>{events.push('quote');return quote;},
    pay:async()=>{events.push('pay');return 'receipt';},receipt:async()=>undefined,submit:()=>{events.push('submit');}};
  return {a,events,stored:()=>stored,setStored:(value:AvatarSubmission)=>{stored=value;},setActive:(value:boolean)=>{active=value;}};
}
describe('avatar payment interruption and admission',()=>{
  it('persists intent, requotes after persistence, signs once and saves its receipt before submission',async()=>{
    const s=setup();await admitAvatarPayment(s.a);
    expect(s.events).toEqual(['prepared','paying','quote','pay','signed','submit']);
    expect(s.stored()).toMatchObject({clientJobId:'job-1',txHash:'receipt',phase:'signed'});
  });
  it('cannot pay when the owner/epoch changes during durable input persistence',async()=>{
    const s=setup(), save=s.a.save;s.a.save=async value=>{await save(value);s.setActive(false);};
    await expect(admitAvatarPayment(s.a)).rejects.toThrow('priceRetry');
    expect(s.events).not.toContain('pay');expect(s.events).not.toContain('submit');
  });
  it('cannot pay a changed price discovered after storage completes',async()=>{
    const s=setup();s.a.quote=async()=>({...quote,priceDhb:406});
    await expect(admitAvatarPayment(s.a)).rejects.toThrow('priceRetry');expect(s.events).not.toContain('pay');
    expect(s.stored()?.phase).toBe('prepared');
  });
  it('resumes the same signed job without a second payment',async()=>{
    const s=setup();await admitAvatarPayment(s.a);s.events.length=0;
    await admitAvatarPayment(s.a);expect(s.events).toEqual(['signed','submit']);
  });
  it('resumes persisted paid input without quoting or opening a wallet, even after editing the current draft',async()=>{
    const s=setup();await admitAvatarPayment(s.a);s.events.length=0;
    s.a.input={...s.a.input,audioDataUrl:'different'};s.a.reviewed={...quote,inputDigest:'b'.repeat(64)};
    s.a.quote=async()=>{throw new Error('must not quote');};s.a.pay=async()=>{throw new Error('must not pay');};
    await resumeAvatarPayment(s.a);expect(s.events).toEqual(['signed','submit']);expect(s.stored()?.audioDataUrl).toBe('voice');
  });
  it('serializes two independent paywalls so a concurrent click cannot enter a second wallet',async()=>{
    const s=setup();let release!:()=>void, started!:()=>void,locked=false;
    const entered=new Promise<void>(resolve=>{started=resolve;});
    vi.stubGlobal('navigator',{locks:{request:async (_name:string,_options:unknown,operation:(lock:object|null)=>Promise<unknown>)=>{
      if(locked)return operation(null);locked=true;try{return await operation({});}finally{locked=false;}
    }}});
    s.a.pay=async()=>{s.events.push('pay');started();await new Promise<void>(resolve=>{release=resolve;});return 'receipt';};
    const first=withAvatarAdmission('OWNER',()=>admitAvatarPayment(s.a));await entered;
    await expect(withAvatarAdmission('owner',()=>admitAvatarPayment(s.a))).rejects.toThrow('recoveryPending');
    release();await first;
    await withAvatarAdmission('owner',()=>admitAvatarPayment(s.a));
    expect(s.events.filter(event=>event==='pay')).toHaveLength(1);
  });
  it('holds an uncertain wallet interruption and never signs a second transfer',async()=>{
    const s=setup();s.a.pay=async()=>{s.events.push('pay');throw new Error('connection interrupted');};
    await expect(admitAvatarPayment(s.a)).rejects.toThrow('interrupted');
    await expect(admitAvatarPayment(s.a)).rejects.toThrow('recoveryPending');
    expect(s.events.filter(event=>event==='pay')).toHaveLength(1);expect(s.stored()?.phase).toBe('paying');
  });
  it('never pays again after signing succeeds but persisting the receipt fails',async()=>{
    const s=setup(),save=s.a.save;s.a.save=async value=>{if(value.phase==='signed')throw new Error('disk full');await save(value);};
    await expect(admitAvatarPayment(s.a)).rejects.toThrow('disk full');
    expect(s.stored()?.phase).toBe('paying');
    await expect(admitAvatarPayment(s.a)).rejects.toThrow('recoveryPending');
    expect(s.events.filter(x=>x==='pay')).toHaveLength(1);expect(s.events).not.toContain('submit');
  });
  it('does not overwrite a pending paid operation with different media',async()=>{
    const s=setup();await admitAvatarPayment(s.a);const previous=s.stored();s.a.reviewed={...quote,inputDigest:'b'.repeat(64)};
    await expect(admitAvatarPayment(s.a)).rejects.toThrow('recoveryPending');expect(s.stored()).toBe(previous);
  });
  it('retains the signed receipt under the original owner if the UI changes while signing',async()=>{
    const s=setup();s.a.pay=async()=>{s.setActive(false);return 'receipt';};
    await expect(admitAvatarPayment(s.a)).rejects.toThrow('priceRetry');
    expect(s.stored()).toMatchObject({txHash:'receipt',phase:'signed'});expect(s.events).not.toContain('submit');
  });
  it('admits only one simultaneous owner operation and fails closed without Web Locks',async()=>{
    let release!:()=>void, locked=false;
    vi.stubGlobal('navigator',{locks:{request:async (_name:string,_options:unknown,operation:(lock:object|null)=>Promise<unknown>)=>{
      if(locked)return operation(null);locked=true;try{return await operation({});}finally{locked=false;}
    }}});
    const first=withAvatarAdmission('owner',()=>new Promise<void>(resolve=>{release=resolve;}));
    await expect(withAvatarAdmission('owner',async()=>{})).rejects.toThrow('recoveryPending');release();await first;
    vi.stubGlobal('navigator',{});await expect(withAvatarAdmission('owner',async()=>{})).rejects.toThrow('recoveryPending');
  });
});
