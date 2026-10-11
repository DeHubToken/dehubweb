import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const html = readFileSync('services/maboroshi/static/index.html', 'utf8');
const script = readFileSync('services/maboroshi/static/studio.js', 'utf8');
const wallet = `0x${'1'.repeat(40)}`;
const id = 'a'.repeat(32);
const project = (extra = {}) => ({ id, subject: 'person', created: 1, state: 'uploaded', stage: '', status: 'Source saved.', seconds: 5,
  files: { 'upload.mp4': 'https://live.dehub.io/maboroshi/media/source.mp4' }, review: { approved: false, note: '' },
  hasReference: false, references: {}, resolvedPrompt: '', quotes: { prepare: 1000000, draft: 1600000, hd: 5000000 }, ...extra });
let dom, w, fetcher, sent, jobs, saved, sessionWallet;
const el = id => w.document.getElementById(id);
const respond = data => ({ ok: true, json: async () => data });
const session = (extra = {}) => w.document.dispatchEvent(new w.CustomEvent('maboroshi:native-session', {
  detail: { token: 'session', wallet, paymentBridge: 1, allowPayments: true, ...extra },
}));
const chooseReference = () => {
  const file = new w.File(['image'], 'character.png', { type: 'image/png' });
  Object.defineProperty(el('reference'), 'files', { configurable: true, value: [file] });
  el('reference').dispatchEvent(new w.Event('change', { bubbles: true }));
};
beforeEach(() => {
  jobs = [project()]; saved = project(); sessionWallet = wallet; sent = [];
  dom = new JSDOM(html, { url: 'https://live.dehub.io/maboroshi/', runScripts: 'outside-only' }); w = dom.window;
  w.HTMLMediaElement.prototype.load = vi.fn(); w.HTMLMediaElement.prototype.pause = vi.fn();
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function (value) { this.returnValue = value; this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.URL.createObjectURL = vi.fn(() => 'blob:reference'); w.URL.revokeObjectURL = vi.fn();
  w.crypto.randomUUID = () => '11111111-1111-4111-8111-111111111111';
  w.ReactNativeWebView = { postMessage: data => sent.push(JSON.parse(data)) };
  fetcher = vi.fn(async (path, options) => {
    if (path === 'health') return respond({ ready: true });
    if (path === 'session') return respond({ wallet: sessionWallet });
    if (path === 'jobs') return respond({ jobs });
    if (path === `jobs/${id}/references`) {
      expect(options.method).toBe('POST');
      saved = project({ hasReference: true, references: { reference: { url: 'https://live.dehub.io/maboroshi/media/reference.png', kind: 'image', key: 'saved' } } });
      return respond(saved);
    }
    if (path === `jobs/${id}`) return respond(saved);
    throw new Error(`Unexpected request: ${path}`);
  });
  w.fetch = fetcher; w.localStorage.setItem(`maboroshi:last:${wallet}`, id); w.eval(script);
});
afterEach(() => { dom.window.close(); });
const connected = async () => { await vi.waitFor(() => expect(sent.some(x => x.type === 'maboroshi:ready')).toBe(true)); session(); await vi.waitFor(() => expect(el('project').hidden).toBe(false)); };

describe('Maboroshi creator journey', () => {
  it('saves an early character before requesting the normal payment confirmation', async () => {
    await connected(); chooseReference();
    expect(el('reference-preview').querySelector('img').src).toBe('blob:reference');
    el('prepare').click();
    await vi.waitFor(() => expect(sent.some(x => x.type === 'maboroshi:pay')).toBe(true));
    const upload = fetcher.mock.calls.find(([path]) => path.endsWith('/references'));
    expect(upload[1].body.get('reference').name).toBe('character.png');
    expect(upload[1].body.get('prompt')).toContain('Replace the complete selected subject');
    expect(fetcher.mock.calls.some(([path]) => path.endsWith('/prepare'))).toBe(false);
    expect(el('jobs').disabled).toBe(true);
    const payment = sent.find(x => x.type === 'maboroshi:pay');
    w.document.dispatchEvent(new w.CustomEvent('maboroshi:native-payment-result', { detail: { requestId: payment.requestId, error: 'Payment cancelled.' } }));
    await vi.waitFor(() => expect(el('error').textContent).toBe('Payment cancelled.'));
    expect(el('prepare').disabled).toBe(false);
  });
  it('keeps original video and download accessible after processing failure', async () => {
    saved = project({ state: 'failed', stage: 'prepare', status: 'Processing failed. This step has been refunded.' });
    await connected();
    expect(el('source-preview-section').hidden).toBe(false);
    expect(el('source-download').href).toContain('/media/source.mp4');
    expect(el('prepare-section').hidden).toBe(true);
    expect(sent.some(x => x.type === 'maboroshi:pay')).toBe(false);
  });
  it('preserves preview access without purchase actions in a restricted app', async () => {
    saved = project({ state: 'draft', files: { ...project().files, 'final-preview.mp4': 'https://live.dehub.io/maboroshi/media/preview.mp4' } });
    await vi.waitFor(() => expect(sent.length).toBeGreaterThan(0)); session({ allowPayments: false });
    await vi.waitFor(() => expect(el('export-section').hidden).toBe(false));
    expect(el('hd').hidden).toBe(true); expect(el('reference-fields').disabled).toBe(true);
    expect(el('result-download').href).toContain('/media/preview.mp4');
  });
  it('does not restore a project outside the authenticated library', async () => {
    jobs = []; await vi.waitFor(() => expect(sent.length).toBeGreaterThan(0)); session();
    await vi.waitFor(() => expect(el('upload').disabled).toBe(false));
    expect(fetcher.mock.calls.some(([path]) => path === `jobs/${id}`)).toBe(false);
    expect(el('project').hidden).toBe(true);
  });
  it('keeps unsaved references when the creator cancels a project switch', async () => {
    await connected(); chooseReference(); el('new-project').click();
    await vi.waitFor(() => expect(el('discard-dialog').open).toBe(true)); el('keep-editing').click();
    await vi.waitFor(() => expect(el('discard-dialog').open).toBe(false));
    expect(el('reference').files[0].name).toBe('character.png'); expect(el('project').hidden).toBe(false);
  });
  it('cannot restore the previous account from an upload that finishes after account switching', async () => {
    await connected(); chooseReference();
    let finish;
    fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    el('save-references').click(); await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    sessionWallet = `0x${'2'.repeat(40)}`; jobs = []; session({ wallet: sessionWallet, token: 'second-session' });
    await vi.waitFor(() => expect(el('upload').disabled).toBe(false));
    finish(respond(project({ hasReference: true })));
    await vi.waitFor(() => expect(el('project').hidden).toBe(true));
    expect(el('source-preview').getAttribute('src')).toBeNull();
  });
});
