import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const html = readFileSync('services/maboroshi/static/index.html', 'utf8');
const script = readFileSync('services/maboroshi/static/studio.js', 'utf8');
const presetsScript = readFileSync('services/maboroshi/static/presets.js', 'utf8');
it('permits the registered DeHub source route through the hosted studio policy without provider credits', () => {
  const server = readFileSync('services/maboroshi/server.py', 'utf8');
  expect(server).toContain("connect-src 'self' https://dehub.io;");
  expect(server).toContain("media-src 'self' blob:;");
  expect(html).not.toContain('Processing uses');
});
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
  w.HTMLElement.prototype.scrollIntoView = vi.fn();
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
  w.fetch = fetcher; w.localStorage.setItem(`maboroshi:last:${wallet}`, id); w.eval(presetsScript); w.eval(script);
});
afterEach(() => { dom.window.close(); });
const connected = async () => { await vi.waitFor(() => expect(sent.some(x => x.type === 'maboroshi:ready')).toBe(true)); session(); await vi.waitFor(() => expect(el('project').hidden).toBe(false)); };

describe('Maboroshi creator journey', () => {
  it('refreshes a saved output for private library delivery without a generation payment', async () => {
    saved = project({ state: 'draft', files: { ...project().files, 'final-preview.mp4': `https://live.dehub.io/maboroshi/media/${id}/final-preview.mp4?expires=123&signature=${'b'.repeat(64)}` } });
    await vi.waitFor(() => expect(sent.some(x => x.type === 'maboroshi:ready')).toBe(true));
    session({ libraryBridge: 1, allowPayments: false });
    await vi.waitFor(() => expect(el('result-save-library').hidden).toBe(false));
    await vi.waitFor(() => expect(el('project').hidden).toBe(false));
    Object.defineProperty(w.HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 1080 });
    Object.defineProperty(w.HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 1920 });
    w.HTMLMediaElement.prototype.load = function () { if (this.onloadedmetadata) this.onloadedmetadata(); };
    el('result-save-library').click(); el('result-save-library').click();
    await vi.waitFor(() => expect(sent.filter(x => x.type === 'maboroshi:save')).toHaveLength(1));
    const request = sent.find(x => x.type === 'maboroshi:save');
    expect(request.wallet).toBe(wallet); expect(request.projectId).toBe(id);
    expect(request.width).toBe(1080); expect(request.height).toBe(1920);
    expect(request.url).toContain('final-preview.mp4?expires=123');
    expect(sent.some(x => x.type === 'maboroshi:pay')).toBe(false);
    w.document.dispatchEvent(new w.CustomEvent('maboroshi:native-save-result', { detail: { requestId: request.requestId, error: 'offline' } }));
    expect(el('result-save-library').disabled).toBe(false);
    expect(el('library-save-status').textContent).toContain('Try again');
    expect(el('project').hidden).toBe(false);
  });
  it('offers one complete Kling render with no preparation or HD purchase', async () => {
    saved = project({ renderer: 'kling', state: 'prepared', hasReference: true, review: { approved: true }, quotes: { draft: 3150000 }, files: { ...project().files, 'seedance-input.mp4': 'https://live.dehub.io/maboroshi/media/input.mp4' } });
    await connected();
    expect(el('draft').textContent).toContain('Generate Kling video');
    expect(el('draft').textContent).toContain('3.15');
    expect(el('prepare').hidden).toBe(true);
    expect(el('hd').hidden).toBe(true);
    expect(el('render-hint').textContent).toContain('No preparation');
    expect(el('reference').accept).not.toContain('video/');
  });
  it('offers one complete Wan 3.0 render at the lowest price', async () => {
    saved = project({ renderer: 'wan', state: 'prepared', hasReference: true, review: { approved: true }, quotes: { draft: 2450000 }, files: { ...project().files, 'seedance-input.mp4': 'https://live.dehub.io/maboroshi/media/input.mp4' } });
    await connected();
    expect(el('draft').textContent).toContain('Generate Wan 3.0 video');
    expect(el('draft').textContent).toContain('2.45');
    expect(el('prepare').hidden).toBe(true);
    expect(el('hd').hidden).toBe(true);
    expect(el('reference').accept).not.toContain('video/');
  });
  it('imports a library source into a new project without sending a paid request or credentials to the media host', async () => {
    await connected();
    el('new-project').click(); await vi.waitFor(() => expect(el('project').hidden).toBe(true));
    const source = 'https://dehub.io/api/creator-motion-source?id=' + '1'.repeat(20);
    const originalFetch = fetcher.getMockImplementation();
    fetcher.mockImplementation(async (path, options) => path === source ? {
      ok: true, headers: { get: () => '5' }, blob: async () => new w.Blob(['video'], { type: 'video/mp4' }),
    } : originalFetch(path, options));
    w.document.dispatchEvent(new w.CustomEvent('maboroshi:native-clip', { detail: { id: '1'.repeat(20), url: 'https://d2ol7oe51mr4n9.cloudfront.net/content_user_id/source.mp4', name: 'Studio rap', seconds: 12 } }));
    await vi.waitFor(() => expect(el('source-local').textContent).toContain('Studio rap'));
    expect(el('source').required).toBe(false);
    const download = fetcher.mock.calls.find(([path]) => path === source);
    expect(download[1].credentials).toBe('omit'); expect(download[1].headers).toBeUndefined();
    expect(sent.some(x => x.type === 'maboroshi:pay')).toBe(false);
  });
  it('rejects external media hosts and leaves an existing project intact', async () => {
    await connected(); fetcher.mockClear();
    w.document.dispatchEvent(new w.CustomEvent('maboroshi:native-clip', { detail: { id: '1'.repeat(20), url: 'https://untrusted.example/source.mp4', name: 'Clip', seconds: 12 } }));
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled(); expect(el('project').hidden).toBe(false);
  });
  it('offers 180 unique directions and recovers from an empty search', () => {
    const presets = w.MABOROSHI_PRESETS;
    expect(presets).toHaveLength(180);
    expect(new Set(presets.map(p => p.id)).size).toBe(180);
    expect(new Set(presets.map(p => p.prompt)).size).toBe(180);
    expect(new Set(presets.map(p => p.group)).size).toBe(20);
    el('preset-search').value = 'plushie'; el('preset-search').dispatchEvent(new w.Event('input'));
    expect(el('preset-list').children).toHaveLength(1);
    el('preset-search').value = 'no-such-look'; el('preset-search').dispatchEvent(new w.Event('input'));
    expect(el('preset-count').textContent).toBe('0 of 180 presets');
    el('preset-reset-search').click(); expect(el('preset-list').children).toHaveLength(180);
  });
  it('applies a direction without sending a generation or changing selected files', async () => {
    await connected(); chooseReference();
    el('preset-list').querySelector('button').click(); el('preset-apply').click();
    expect(el('prompt').value).toContain('Soft felt');
    expect(el('reference').files[0].name).toBe('character.png');
    expect(el('preset-applied').hidden).toBe(false);
    expect(el('character-options').open).toBe(true);
    expect(sent.some(x => x.type === 'maboroshi:pay')).toBe(false);
    expect(fetcher.mock.calls.some(([path]) => path.endsWith('/references'))).toBe(false);
  });
  it('lets guests browse without modifying or submitting a project', () => {
    el('preset-list').querySelector('button').click();
    expect(el('preset-apply').disabled).toBe(true);
    expect(el('preset-guidance').textContent).toContain('Sign in');
  });
  it('connects all six visual cards to real presets without charging', () => {
    expect(el('featured-looks').children).toHaveLength(6);
    for (const button of el('featured-looks').children) {
      button.click();
      expect(el('preset-browser').open).toBe(true);
      expect(el('preset-name').textContent).toBe(button.textContent);
      expect(el('preset-apply').disabled).toBe(true);
    }
    expect(sent.some(x => x.type === 'maboroshi:pay')).toBe(false);
  });
  it('keeps a linked look selected through sign-in without restoring a different project', async () => {
    await vi.waitFor(() => expect(sent.some(x => x.type === 'maboroshi:ready')).toBe(true));
    w.history.replaceState({}, '', '?preset=liquid-chrome');
    // Recreate the page so the incoming URL is read at initial load.
    dom.window.close();
    fetcher.mockClear(); sent = [];
    dom = new JSDOM(html, { url: 'https://live.dehub.io/maboroshi/?preset=liquid-chrome', runScripts: 'outside-only' });
    w = dom.window;
    w.HTMLMediaElement.prototype.load = vi.fn(); w.HTMLMediaElement.prototype.pause = vi.fn();
    w.fetch = fetcher; w.ReactNativeWebView = { postMessage: data => sent.push(JSON.parse(data)) };
    w.localStorage.setItem(`maboroshi:last:${wallet}`, id);
    w.eval(presetsScript); w.eval(script);
    expect(el('preset-name').textContent).toBe('Liquid chrome');
    session();
    await vi.waitFor(() => expect(el('preset-apply').disabled).toBe(false));
    expect(el('project').hidden).toBe(true);
    expect(el('preset-name').textContent).toBe('Liquid chrome');
    expect(fetcher.mock.calls.some(([path]) => path === `jobs/${id}`)).toBe(false);
  });
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
    await vi.waitFor(() => expect(el('project-status').textContent).toBe('Payment cancelled. Your project is saved.'));
    expect(el('error').hidden).toBe(true);
    expect(el('progress').dataset.notice).toBe('true');
    expect(el('prepare').disabled).toBe(false);
  });
  it('shows explicit cancellation as one neutral status and keeps real failures as errors', async () => {
    await connected(); el('prepare').click();
    await vi.waitFor(() => expect(sent.some(x => x.type === 'maboroshi:pay')).toBe(true));
    const requestId = sent.find(x => x.type === 'maboroshi:pay').requestId;
    w.document.dispatchEvent(new w.CustomEvent('maboroshi:native-payment-result', { detail: { requestId, cancelled: true } }));
    await vi.waitFor(() => expect(el('progress').dataset.notice).toBe('true'));
    expect(el('error').hidden).toBe(true);
    expect(el('project-status').getAttribute('role')).toBe('status');
    expect(el('next-step').textContent).toContain('Next: prepare');
    expect(el('source-preview-section').hidden).toBe(false);
    el('prepare').click();
    expect(el('progress').dataset.notice).toBe('false');
    await vi.waitFor(() => expect(sent.filter(x => x.type === 'maboroshi:pay')).toHaveLength(2));
    w.document.dispatchEvent(new w.CustomEvent('maboroshi:native-payment-result', { detail: { requestId, error: 'Payment could not be confirmed.' } }));
    await vi.waitFor(() => expect(el('error').hidden).toBe(false));
    expect(el('error').textContent).toBe('Payment could not be confirmed.');
    expect(el('error').getAttribute('role')).toBe('alert');
    expect(el('project-status').textContent).toBe('Source saved.');
    expect(fetcher.mock.calls.some(([path]) => /\/(prepare|draft|hd)$/.test(path))).toBe(false);
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
