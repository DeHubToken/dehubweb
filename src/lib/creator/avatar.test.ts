import { describe, it, expect } from 'vitest';
import { avatarRequestKey, matchingAvatarQuote } from './avatar';
describe('reviewed avatar quote ownership',()=>{
  const input={imageDataUrl:'data:image/png;base64,photo',audioDataUrl:'data:audio/wav;base64,speech',rightsConfirmed:true};
  const quote={priceDhb:405,priceUsd:.405,inputDigest:'a'.repeat(64),durationSeconds:6};
  it('invalidates pending work on account, prompt and attachment changes',()=>{
    const key=avatarRequestKey('owner-a','Speak',input);
    expect(key).not.toBe(avatarRequestKey('owner-b','Speak',input));
    expect(key).not.toBe(avatarRequestKey('owner-a','Smile',input));
    expect(key).not.toBe(avatarRequestKey('owner-a','Speak',{...input,audioDataUrl:'changed'}));
  });
  it('does not authorize payment after server price, prepared input or duration changes',()=>{
    expect(matchingAvatarQuote(quote,{...quote})).toBe(true);
    for(const patch of [{priceDhb:406},{inputDigest:'b'.repeat(64)},{durationSeconds:7}]) expect(matchingAvatarQuote(quote,{...quote,...patch})).toBe(false);
  });
});
