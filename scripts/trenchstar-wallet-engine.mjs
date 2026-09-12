import { Wallet, JsonRpcProvider, getAddress, randomBytes, hexlify, formatEther } from 'ethers';
import { Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import qrcode from 'qrcode-generator';

const iterations=600000;
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const base64=a=>btoa(String.fromCharCode(...a));
const encoder=new TextEncoder();
export function normalizeSecret(value,chain){
  try {
    if(chain==='evm'){
      const key=value.trim();
      if(!/^(0x)?[0-9a-fA-F]{64}$/.test(key))throw new Error();
      const w=new Wallet(key.startsWith('0x')?key:'0x'+key);
      return {secret:w.privateKey,address:w.address};
    }
    if(chain!=='solana')throw new Error();
    let raw;
    if(value.trim().startsWith('[')){
      const a=JSON.parse(value);
      if(!Array.isArray(a)||a.length!==64||a.some(n=>!Number.isInteger(n)||n<0||n>255))throw new Error();
      raw=Uint8Array.from(a);
    }else raw=bs58.decode(value.trim());
    if(raw.length!==64)throw new Error();
    const kp=Keypair.fromSecretKey(raw);
    return {secret:bs58.encode(kp.secretKey),address:kp.publicKey.toBase58()};
  }catch{throw new Error(chain==='evm'?'Enter a valid 64-digit EVM private key.':'Enter a Solana base58 private key or a 64-byte JSON array.');}
}
export function createSecret(chain){
  if(chain==='evm')return normalizeSecret(hexlify(randomBytes(32)),chain);
  if(chain!=='solana')throw new Error('Choose a wallet network.');
  const kp=Keypair.generate();return {secret:bs58.encode(kp.secretKey),address:kp.publicKey.toBase58()};
}
const aad=r=>encoder.encode(JSON.stringify([1,r.id,r.chain,r.address]));
async function key(password,salt){
  const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function encryptSecret(secret,password,record){
  if(password.length<12)throw new Error('Use a vault password of at least 12 characters.');
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(record)},await key(password,salt),encoder.encode(secret));
  return {version:1,salt:base64(salt),iv:base64(iv),cipher:base64(new Uint8Array(cipher))};
}
export async function decryptSecret(record,password){
  try{
    const p=record.payload;
    if(p.version!==1||bytes(p.salt).length!==16||bytes(p.iv).length!==12||p.cipher.length>2048)throw new Error();
    const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(p.iv),additionalData:aad(record)},await key(password,bytes(p.salt)),bytes(p.cipher));
    const normalized=normalizeSecret(new TextDecoder().decode(clear),record.chain);
    new Uint8Array(clear).fill(0);
    if(normalized.address!==record.address)throw new Error();
    return normalized.secret;
  }catch{throw new Error('Incorrect password or damaged wallet backup.');}
}
export function depositQr(address){const qr=qrcode(0,'M');qr.addData(address);qr.make();return qr.createSvgTag({cellSize:5,margin:3,scalable:true});}
export async function prepareEvm(secret,network,input){
  const offline=new Wallet(secret);
  const signerAddress=offline.address;
  if(input.from&&getAddress(input.from)!==signerAddress)throw new Error('The selected wallet changed. Review the transaction again.');
  const to=getAddress(input.to);
  const value=BigInt(input.value||0);
  if(value<0n||!/^0x([0-9a-fA-F]{2})*$/.test(input.data||'0x'))throw new Error('Invalid transaction.');
  const provider=new JsonRpcProvider(network.rpc,network.id,{batchMaxCount:1});
  const signer=offline.connect(provider);
  try{
    const tx=await signer.populateTransaction({to,value,data:input.data||'0x'});
    const fee=tx.gasLimit*(tx.maxFeePerGas||tx.gasPrice||0n);
    return {to,value:formatEther(value),fee:formatEther(fee),contract:tx.data!=='0x',
      send:async(check=()=>{})=>{try{check();const signed=await signer.signTransaction(tx);check();return (await provider.broadcastTransaction(signed)).hash;}finally{provider.destroy();}},
      cancel:()=>provider.destroy()};
  }catch(e){provider.destroy();throw new Error('Could not prepare this transaction. Check the network and available ETH for gas.');}
}
export function signSolana(secret,message,address){
  const kp=Keypair.fromSecretKey(bs58.decode(secret));
  if(kp.publicKey.toBase58()!==address)throw new Error('The selected wallet changed.');
  const tx=VersionedTransaction.deserialize(bs58.decode(message));
  if(tx.message.staticAccountKeys[0].toBase58()!==address)throw new Error('Unexpected transaction fee payer.');
  tx.sign([kp]);return base64(tx.serialize());
}
