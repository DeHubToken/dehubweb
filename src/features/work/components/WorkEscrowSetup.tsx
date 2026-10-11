import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { useState } from 'react';
import { AbiCoder,concat,getCreate2Address,Interface,keccak256,toUtf8Bytes } from 'ethers';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { writeContractAA,switchChain } from '@/lib/contracts/aa-utils';
import { useWorkConfig } from '../hooks/use-work';
import { workReceipt,workRpc } from '../work-rpc';

const FACTORY='0x4e59b44847b379578588920ca78fbf26c0b4956c';
const FACTORY_CODE='0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3';
async function codeAt(address:string) {
 const response=await fetch('https://mainnet.base.org',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getCode',params:[address,'latest']})});
 const data=await response.json(); if(!response.ok || data.error || typeof data.result!=='string') throw new Error('Could not check the Base deployment');
 return data.result as string;
}
export function WorkEscrowSetup() {
  const { t: _copy } = _useCopy();
 const {t}=useTranslation(); const {walletAddress}=useAuth(); const {data:config}=useWorkConfig(); const qc=useQueryClient();
 const [busy,setBusy]=useState(false); const [message,setMessage]=useState(''); const [hash,setHash]=useSurfaceDraft("src/features/work/components/WorkEscrowSetup.tsx:hash", '');
 if(!config || walletAddress?.toLowerCase()!==config.owner_address) return null;
 async function deploy() {
  setBusy(true); setMessage('');
  try {
   const response=await fetch('/assets/work-escrow.json'); if(!response.ok) throw new Error('Tested escrow artifact is unavailable');
   const artifact=await response.json() as {bytecode:string;runtimeCodeHash:string};
   if(artifact.runtimeCodeHash!==config.expected_code_hash) throw new Error('Escrow artifact and configuration do not match');
   const init=concat([artifact.bytecode,AbiCoder.defaultAbiCoder().encode(['address','address','address[]'],[config.owner_address,config.fee_recipient,['0xd20ab1015f6a2de4a6fddebab270113f689c2f7c','0x833589fcd6edb6e08f4c7c32d4f71b54bda02913']])]);
   const salt=keccak256(toUtf8Bytes('DeHubWork:v2:Base'));
   const address=getCreate2Address(FACTORY,salt,keccak256(init));
   let txHash=hash;
   await switchChain(8453);
   if(await codeAt(FACTORY)!==FACTORY_CODE) throw new Error('Base deployment factory does not match the verified code');
   if(await codeAt(address)==='0x') {
    if(txHash) throw new Error('A deployment transaction is already saved. Check its confirmation before sending another.');
    const sent=await writeContractAA(FACTORY,new Interface([]),'deploy',[],{chainId:8453,context:'deploy bounty escrow',calldata:concat([salt,init]) as `0x${string}`,gasLimit:5000000});
    txHash=sent.hash; setHash(txHash); localStorage.setItem('work-escrow-deployment',txHash);
    try {await sent.wait(2);} catch { /* verified receipt determines deployment state */ }
   }
   if(!txHash) throw new Error('Enter the deployment transaction hash to activate the existing contract');
   const proof=await workReceipt('00000000-0000-4000-8000-000000000001',txHash,8453,address);
   if(!proof) {setMessage(t('work.integrity.fundingPending'));return;}
   if(JSON.parse(proof.payload).status==='failed') {localStorage.removeItem('work-escrow-deployment');setHash.complete(hash, '');throw new Error('Deployment reverted. Check your wallet gas balance before retrying.');}
   await workRpc(walletAddress!,'work_activate_escrow',{p_payload:proof.payload,p_signature:proof.signature});
   await qc.invalidateQueries({queryKey:['work-config']});setMessage(t('work.integrity.escrowActive'));
  } catch(error:any) {setMessage(error.message || 'Escrow setup failed');} finally {setBusy(false);}
 }
 return <div className="mb-6 rounded-xl border border-white/20 p-4 space-y-3 text-white">
  <h2 className="font-semibold">{t('work.integrity.escrowSetup')}</h2>
  {config.escrow_address?<a className="text-xs break-all" href={'https://basescan.org/address/'+config.escrow_address} target="_blank" rel="noreferrer">{t('work.integrity.escrowActive')}: {config.escrow_address}</a>:<>
   <p className="text-xs text-white/70">{t('work.integrity.deployNotice')}</p>
   <p className="text-xs break-all">{_copy("copy.60d5bbcba717", { defaultValue: "Owner: " })}{config.owner_address}<br/>{_copy("copy.90b8bc518ac2", { defaultValue: "Fee recipient: " })}{config.fee_recipient}<br/>{_copy("copy.47890e046218", { defaultValue: "Tokens: DHB, USDC · Base" })}</p>
   <input aria-label={t('work.integrity.recoverTx')} value={hash} onChange={e=>setHash(e.target.value)} placeholder={t('work.integrity.hashPlaceholder')} className="w-full rounded-lg bg-white/5 border border-white/20 px-3 py-2 text-xs" />
   <button onClick={deploy} disabled={busy || !config.expected_code_hash} className="px-4 py-2 rounded-lg bg-white text-black text-sm font-semibold disabled:opacity-40">{t(busy?'work.integrity.deploying':hash?'work.integrity.activateEscrow':'work.integrity.deployEscrow')}</button>
  </>}
  {message && <p role="status" className="text-xs text-amber-200">{message}</p>}
 </div>;
}
