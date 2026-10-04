import { Interface,parseUnits,formatUnits } from 'ethers';
import { supabase } from '@/integrations/supabase/client';
import { writeContractAA,approveERC20,getERC20Allowance,getERC20Balance,getWalletAddress,switchChain } from './aa-utils';
import { CHAIN_CONFIGS,BASE_CHAIN_ID } from './dhb-token';

export const DEHUB_WORK_ABI=[
 'function createJob(address,uint8,uint256,uint256,uint256) returns (uint256)',
 'function registerProof(uint256,bytes32)',
 'function awardApplicant(uint256,address)',
 'function rejectProof(uint256,bytes32)',
 'function approveSubmission(uint256,address,uint256,bytes32,bytes32)',
 'function openDispute(uint256)',
 'function closeJob(uint256)',
 'function adminResolve(uint256,address,uint256,uint256,bytes32)',
];
export async function getWorkConfig() {
 const {data,error}=await supabase.from('work_config' as any).select('*').eq('id',1).single();
 if(error) throw error;
 return data as any;
}
export function workExplorerTxUrl(hash:string,chain=8453) {
 return `${chain===56?'https://bscscan.com':CHAIN_CONFIGS[BASE_CHAIN_ID].explorerUrl}/tx/${hash}`;
}
export function getCurrencyToken(currency:string) {
 return currency==='USDC'?{address:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',decimals:6}:{address:CHAIN_CONFIGS[BASE_CHAIN_ID].dhbToken,decimals:18};
}
export async function writeWork(address:string,name:string,args:unknown[]) {
 await switchChain(BASE_CHAIN_ID);
 return writeContractAA(address,new Interface(DEHUB_WORK_ABI),name,args,{context:'bounty '+name,chainId:BASE_CHAIN_ID});
}
export async function prepareWorkFunding(address:string,currency:string,total:string) {
 await switchChain(BASE_CHAIN_ID);
 const token=getCurrencyToken(currency);
 const amount=parseUnits(total,token.decimals);
 const owner=await getWalletAddress();
 if(await getERC20Balance(token.address,owner,BASE_CHAIN_ID)<amount) throw new Error('Not enough '+currency+' to fund this bounty');
 if(await getERC20Allowance(token.address,owner,address)<amount) {
  const sent=await approveERC20(token.address,address,amount,BASE_CHAIN_ID);
  const receipt=await sent.wait(2);
  if(receipt.status!==1) throw new Error('Token approval reverted');
 }
}
export async function payWorkerDirect(params:{currency:string;to:string;amount:number|string}) {
 await switchChain(BASE_CHAIN_ID);
 const token=getCurrencyToken(params.currency);
 const amount=parseUnits(String(params.amount),token.decimals);
 const from=await getWalletAddress();
 if(from.toLowerCase()===params.to.toLowerCase()) throw new Error('Cannot pay your own wallet');
 const balance=await getERC20Balance(token.address,from,BASE_CHAIN_ID);
 if(balance<amount) throw new Error(`Not enough ${params.currency}: balance ${formatUnits(balance,token.decimals)}`);
 return writeContractAA(token.address,new Interface(['function transfer(address,uint256) returns (bool)']),'transfer',[params.to,amount],{context:'bounty payout',chainId:BASE_CHAIN_ID});
}
