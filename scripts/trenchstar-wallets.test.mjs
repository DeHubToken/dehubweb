import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createSecret,normalizeSecret,encryptSecret,decryptSecret,depositQr,prepareEvm,signSolana} from '../public/trenchstar-game/vendor/wallet-engine.js';
const require=createRequire(path.resolve(process.argv[2]||'node_modules','_wallet-tests.cjs'));
const {Keypair,TransactionMessage,VersionedTransaction,SystemProgram}=require('@solana/web3.js');
const base58=require('bs58');const bs58=base58.default||base58;
const password='unfunded-test-fixture-password';

for(const chain of ['evm','solana'])test(`${chain}: encryption, password rejection, and metadata binding`,async()=>{
  const wallet=createSecret(chain);
  assert.deepEqual(normalizeSecret(wallet.secret,chain),wallet);
  const record={id:'test-'+chain,chain,address:wallet.address};
  record.payload=await encryptSecret(wallet.secret,password,record);
  assert.equal(await decryptSecret(record,password),wallet.secret);
  assert(!JSON.stringify(record).includes(wallet.secret));
  await assert.rejects(decryptSecret(record,'incorrect-password'),/Incorrect password/);
  await assert.rejects(decryptSecret({...record,id:'different-wallet'},password),/Incorrect password/);
  await assert.rejects(decryptSecret({...record,chain:chain==='evm'?'solana':'evm'},password),/Incorrect password/);
  const changed=structuredClone(record);changed.payload.cipher=changed.payload.cipher.slice(0,-4)+'AAAA';
  await assert.rejects(decryptSecret(changed,password),/Incorrect password/);
  const next=await encryptSecret(wallet.secret,password,record);
  assert.notEqual(next.salt,record.payload.salt);assert.notEqual(next.iv,record.payload.iv);
  await assert.rejects(encryptSecret(wallet.secret,'short',record),/at least 12/);
});
test('private-key formats reject invalid keys without echoing secrets',()=>{
  for(const input of ['0x'+'0'.repeat(64),'0x'+'f'.repeat(64),'not-a-private-key'])assert.throws(()=>normalizeSecret(input,'evm'),/^Error: Enter a valid/);
  for(const input of ['[256]','[1,2,3]','not-a-private-key',JSON.stringify(Array(64).fill(-1))])assert.throws(()=>normalizeSecret(input,'solana'),/^Error: Enter a Solana/);
  const kp=Keypair.generate();const imported=normalizeSecret(JSON.stringify([...kp.secretKey]),'solana');
  assert.equal(imported.address,kp.publicKey.toBase58());
  assert(depositQr(imported.address).includes('<svg'));
});
test('Solana signing uses the selected key and rejects a different fee payer',()=>{
  const kp=Keypair.generate(),other=Keypair.generate();
  const tx=new VersionedTransaction(new TransactionMessage({payerKey:kp.publicKey,recentBlockhash:SystemProgram.programId.toBase58(),instructions:[]}).compileToV0Message());
  const message=bs58.encode(tx.serialize());
  const signed=VersionedTransaction.deserialize(Buffer.from(signSolana(bs58.encode(kp.secretKey),message,kp.publicKey.toBase58()),'base64'));
  assert(signed.signatures[0].some(b=>b!==0));
  assert.throws(()=>signSolana(bs58.encode(other.secretKey),message,other.publicKey.toBase58()),/fee payer/);
  assert.throws(()=>signSolana(bs58.encode(kp.secretKey),message,other.publicKey.toBase58()),/selected wallet/);
});
test('EVM signing rejects an unexpected sender before touching an RPC',async()=>{
  const one=createSecret('evm'),two=createSecret('evm');
  await assert.rejects(prepareEvm(one.secret,{id:8453,rpc:'https://invalid.invalid'},{from:two.address,to:one.address,value:'0x0'}),/selected wallet changed/);
});

test('wallet manager keeps a saved wallet locked, unlocks locally, and cancels on native lock',async()=>{
  const {JSDOM}=require('jsdom');
  const dom=new JSDOM('<div><div id="wlConnRow"><button id="wlConnect"></button></div></div>',{url:'https://staging.dehub.io/trenchstar-game/',pretendToBeVisual:true});
  const saved={document:globalThis.document,window:globalThis.window,localStorage:globalThis.localStorage};
  Object.assign(globalThis,{document:dom.window.document,window:dom.window,localStorage:dom.window.localStorage});
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const wallet=createSecret('solana');const record={id:'fixture',name:'Unfunded fixture',chain:'solana',address:wallet.address};record.payload=await encryptSecret(wallet.secret,password,record);
  localStorage.setItem('trenchstar.wallet.v1.fixture',JSON.stringify(record));localStorage.setItem('trenchstar.wallet.active','fixture');
  const {mountWallets}=await import('../public/trenchstar-game/wallets.js');
  let selection,requests=0,disarmed=0;
  const dispose=mountWallets({chains:{base:{hex:'0x2105'},solana:{rpc:'https://invalid.invalid'}},select:v=>{selection=v;},refresh(){},isTrading:()=>false,disarm(){disarmed++;},rpc(){requests++;throw new Error('A cancelled transaction must not reach an RPC');}});
  const el=id=>document.getElementById(id);
  const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw new Error('UI action did not finish');};
  try{
    assert.equal(selection.address,wallet.address);assert.equal(selection.locked,true);
    await assert.rejects(selection.provider.request({method:'signAndSendTransaction',params:{message:'fixture'}}),/locked/);
    el('twLaunch').click();document.querySelector('[data-wallet]').click();el('twSelect').click();el('twUnlockPassword').value=password;el('twUnlock').click();
    await wait(()=>selection.locked===false&&el('twSelect'));
    el('twClose').click();
    const pending=selection.provider.request({method:'signAndSendTransaction',params:{message:'fixture'}});
    await wait(()=>el('twApprove'));
    window.dispatchEvent(new dom.window.Event('trenchstar:wallet-lock'));
    await assert.rejects(pending,/cancelled/);assert.equal(requests,0);assert.equal(selection.locked,true);assert.equal(selection.address,wallet.address);assert(disarmed>0);
    assert.equal(localStorage.getItem('trenchstar.wallet.active'),'fixture');assert(!document.getElementById('twDialog').open);
    el('twLaunch').click();document.querySelector('[data-wallet]').click();el('twExport').click();el('twUnlockPassword').value=password;el('twUnlock').click();
    await wait(()=>el('twRevealed'));
    assert.equal(el('twRevealed').value,wallet.secret);assert.equal(selection.locked,true);
    window.dispatchEvent(new dom.window.Event('trenchstar:wallet-lock'));
    assert.equal(el('twRevealed'),null);assert(!document.body.textContent.includes(wallet.secret));
    el('twLaunch').click();el('twAccount').click();await wait(()=>selection===null);
    assert.equal(localStorage.getItem('trenchstar.wallet.active'),null);
    assert(localStorage.getItem('trenchstar.wallet.v1.fixture'),'Switching to the account preserves the encrypted extra wallet');
    el('twCreate').click();el('twName').value='Unfunded EVM fixture';el('twPassword').value=password;el('twRepeat').value=password;el('twSave').click();
    await wait(()=>selection?.chain==='evm'&&el('twFund'));
    const created=selection.address;assert.match(created,/^0x[0-9a-fA-F]{40}$/);
    el('twFund').click();assert.equal(document.querySelectorAll('#twNetwork option').length,2);assert(document.querySelector('.twQr svg'));assert(document.querySelector('.twAddress').textContent.includes(created));assert.equal(requests,0);
    window.dispatchEvent(new dom.window.Event('trenchstar:wallet-lock'));assert.equal(selection.locked,true);assert.equal(selection.address,created);
  }finally{dispose();dom.window.close();Object.assign(globalThis,saved);}
});
