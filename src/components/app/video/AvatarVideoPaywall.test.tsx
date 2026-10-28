import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AvatarVideoPaywall } from './AvatarVideoPaywall';
import { VIDEO_MODELS } from '@/constants/video-models.constants';

const state=vi.hoisted(()=>({owner:'owner-a',invoke:vi.fn(),pay:vi.fn(),save:vi.fn()}));
const input={clientJobId:'prepared-job',phase:'prepared' as const,imageDataUrl:'portrait',audioDataUrl:'speech',rightsConfirmed:true};
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({walletAddress:state.owner})}));
vi.mock('@/lib/ai-invoke',()=>({invokeAi:state.invoke}));
vi.mock('@/lib/ai-payment',()=>({payForJob:state.pay}));
vi.mock('@/lib/creator/avatar',async importOriginal=>({...await importOriginal<typeof import('@/lib/creator/avatar')>(),loadPreparedAvatar:async()=>input,savePreparedAvatar:state.save}));
vi.mock('@/components/ui/drawer',()=>({Drawer:({children}:{children:React.ReactNode})=><div>{children}</div>,DrawerContent:({children}:{children:React.ReactNode})=><div>{children}</div>,DrawerHeader:({children}:{children:React.ReactNode})=><div>{children}</div>,DrawerTitle:({children}:{children:React.ReactNode})=><div>{children}</div>}));

afterEach(()=>{cleanup();state.owner='owner-a';vi.clearAllMocks();vi.unstubAllGlobals();});
function props(){return {open:true,onOpenChange:vi.fn(),onConfirm:vi.fn(),avatarPrompt:'Speak',isGenerating:false,model:VIDEO_MODELS['kling-avatar-v2'],selectedModelKey:'kling-avatar-v2',onModelChange:vi.fn()};}
it('invalidates a quote from owner A after switching to B and back to A',async()=>{
  let resolve!:(value:unknown)=>void;
  state.invoke.mockImplementation(()=>new Promise(done=>{resolve=done;}));
  const p=props(), view=render(<AvatarVideoPaywall {...p}/>);
  await waitFor(()=>expect((screen.getByText('creator.avatarPrepare') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText('creator.avatarPrepare'));
  state.owner='owner-b';view.rerender(<AvatarVideoPaywall {...p}/>);
  state.owner='owner-a';view.rerender(<AvatarVideoPaywall {...p}/>);
  await act(async()=>resolve({data:{priceDhb:405,priceUsd:.405,inputDigest:'a'.repeat(64),durationSeconds:6}}));
  expect(screen.queryByText('work.payAmount')).toBeNull();expect(state.pay).not.toHaveBeenCalled();expect(p.onConfirm).not.toHaveBeenCalled();
});
it('retains a signed receipt for A without submitting after an A to B to A switch during wallet signing',async()=>{
  let resolve!:(value:string)=>void,locked=false;
  vi.stubGlobal('navigator',{locks:{request:async (_name:string,_options:unknown,run:(lock:object|null)=>Promise<unknown>)=>{
    if(locked)return run(null);locked=true;try{return await run({});}finally{locked=false;}
  }}});
  state.invoke.mockResolvedValue({data:{priceDhb:405,priceUsd:.405,inputDigest:'a'.repeat(64),durationSeconds:6}});
  state.save.mockResolvedValue(undefined);state.pay.mockImplementation(()=>new Promise(done=>{resolve=done;}));
  const p=props(),view=render(<AvatarVideoPaywall {...p}/>);
  await waitFor(()=>expect((screen.getByText('creator.avatarPrepare') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText('creator.avatarPrepare'));await screen.findByText('work.payAmount');
  fireEvent.click(screen.getByText('work.payAmount'));await waitFor(()=>expect(state.pay).toHaveBeenCalledTimes(1));
  state.owner='owner-b';view.rerender(<AvatarVideoPaywall {...p}/>);
  state.owner='owner-a';view.rerender(<AvatarVideoPaywall {...p}/>);
  await act(async()=>resolve('paid-receipt'));
  expect(state.save).toHaveBeenLastCalledWith('owner-a',expect.objectContaining({phase:'signed',txHash:'paid-receipt'}));
  expect(p.onConfirm).not.toHaveBeenCalled();
});
