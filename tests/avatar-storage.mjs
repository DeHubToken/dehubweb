import { createRequire } from 'node:module';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
createRequire(join(process.env.AVATAR_TEST_DEPS,'package.json'))('fake-indexeddb/auto');
const { loadPreparedAvatar, savePreparedAvatar, clearPreparedAvatar }=await import('../src/lib/creator/avatar.ts');
const old={clientJobId:'11111111-1111-4111-8111-111111111111',txHash:'paid-receipt',inputDigest:'a'.repeat(64),acceptedPriceDhb:405,imageDataUrl:'portrait',audioDataUrl:'speech',rightsConfirmed:true};
const opened=(version)=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('creator-avatar-prepared',version);
  request.onupgradeneeded=()=>request.result.createObjectStore('owners');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
const write=(db,key,value)=>new Promise((resolve,reject)=>{
  const tx=db.transaction('owners','readwrite');tx.objectStore('owners').put(value,key);
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
});
const read=(db,key)=>new Promise((resolve,reject)=>{
  const request=db.transaction('owners').objectStore('owners').get(key);
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
test('upgrades a paid owner-only record, retaining its receipt and immutable per-job input',async()=>{
  const db=await opened(1);await write(db,'owner-a',old);db.close();
  assert.deepEqual(await loadPreparedAvatar('OWNER-A'),old);
  const upgraded=await opened(2);
  assert.deepEqual(await read(upgraded,`owner-a:job:${old.clientJobId}`),old);upgraded.close();
  for(const patch of [{imageDataUrl:'edited'},{audioDataUrl:'edited'},{acceptedPriceDhb:1},{txHash:'other'},{clientJobId:'22222222-2222-4222-8222-222222222222'}]) {
    await assert.rejects(savePreparedAvatar('owner-a',{...old,...patch}));
    assert.deepEqual(await loadPreparedAvatar('owner-a'),old);
  }
  await clearPreparedAvatar('owner-a',old.clientJobId);assert.equal(await loadPreparedAvatar('owner-a'),null);
  const archive=await opened(2);assert.deepEqual(await read(archive,`owner-a:job:${old.clientJobId}`),old);archive.close();
});
test('input and receipt stay isolated by owner',async()=>{
  await savePreparedAvatar('owner-b',{...old,phase:'signed'});
  assert.equal(await loadPreparedAvatar('owner-c'),null);
  await clearPreparedAvatar('owner-c',old.clientJobId);
  assert.equal((await loadPreparedAvatar('owner-b')).txHash,'paid-receipt');
});
