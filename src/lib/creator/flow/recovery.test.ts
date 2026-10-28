import { beforeEach, expect, it } from 'vitest';
import { finishReceipt, graphSignature, readReceipt, reserveReceipt, saveReceipt } from './recovery';

beforeEach(() => localStorage.clear());
it('reserves every paid UUID before a free predecessor starts and retains payment after interruption', () => {
  const receipt = reserveReceipt('owner', 'flow', 'graph', ['audio', 'image', 'video'], ['image', 'video'], 100);
  expect(Object.keys(readReceipt('owner', 'flow')!.jobIds)).toEqual(['image', 'video']);
  receipt.txHash = 'accepted-transfer'; receipt.started.push('audio'); saveReceipt(receipt);
  expect(finishReceipt(receipt)).toBe(false);
  // The next explicit Run confirmation retries the interrupted free task, with
  // the original transfer and paid UUIDs still reserved for downstream jobs.
  const retry = reserveReceipt('owner', 'flow', 'graph', ['audio'], [], 0);
  expect(retry).toEqual(receipt);
  retry.completed.push('audio'); saveReceipt(retry);
  expect(finishReceipt(retry)).toBe(false);
  expect(reserveReceipt('owner', 'flow', 'graph', ['image', 'video'], ['image', 'video'], 100).jobIds).toEqual(receipt.jobIds);
  retry.completed.push('image', 'video'); saveReceipt(retry);
  expect(finishReceipt(retry)).toBe(true);
  expect(readReceipt('owner', 'flow')).toBeNull();
});
it('keeps receipts isolated by owner and flow and refuses a changed paid graph', () => {
  const receipt = reserveReceipt('owner', 'flow', 'original', ['paid'], ['paid'], 100);
  receipt.txHash = 'accepted'; saveReceipt(receipt);
  expect(readReceipt('other', 'flow')).toBeNull();
  expect(readReceipt('owner', 'other')).toBeNull();
  expect(() => reserveReceipt('owner', 'flow', 'edited', ['paid'], ['paid'], 100)).toThrow('Restore the saved Flow graph');
  expect(readReceipt('owner', 'flow')!.txHash).toBe('accepted');
});
it('compares authored settings without treating generated output or renewed private links as edits', () => {
  const before = [{ id: 'audio', type: 'audioGenNode', data: { audioTask: 'transcribe', audioAssetId: 'old', audioUrl: 'expired' } },
    { id: 'image', type: 'imageGenNode', data: { model: 'image-model', imageUrl: 'old-result', prompt: 'old-resolved' } }];
  const after = [{ ...before[0], data: { ...before[0].data, audioAssetId: 'saved', audioUrl: 'fresh', outputText: 'Transcript' } },
    { ...before[1], data: { ...before[1].data, imageUrl: 'new-result', outputAssetId: 'saved-image', prompt: 'new-resolved' } }];
  expect(graphSignature(before, [])).toBe(graphSignature(after, []));
  expect(graphSignature([{ ...before[1], data: { model: 'changed' } }], [])).not.toBe(graphSignature([before[1]], []));
});
