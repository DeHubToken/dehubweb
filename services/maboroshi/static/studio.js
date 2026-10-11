'use strict';
const $ = (id) => document.getElementById(id);
let token = '', account = '', current = null, ready = false, allowPayments = false, timer;
let selectedInput = '', selectedResult = '', requestVersion = 0, sessionVersion = 0;
let referencesChanged = false, working = false, pendingPayment = null;
const localMedia = new Map();
const busy = () => current && ['queued', 'running'].includes(current.state);
const locked = () => working || !!pendingPayment;
const editable = () => allowPayments && (!current || ['uploaded', 'prepared'].includes(current.state));
const money = (micros) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(micros / 1e6);
const stateLabel = (state) => ({ uploaded: 'Ready to prepare', prepared: 'Ready to review', queued: 'Queued', running: 'Processing', draft: 'Preview ready', complete: 'HD ready', failed: 'Needs attention', attention: 'Needs attention' })[state] || 'Saved';
const message = (text) => { $('error').textContent = text || ''; $('error').hidden = !text; };
const remember = (id) => { try { localStorage.setItem(`maboroshi:last:${account}`, id || ''); } catch { /* Storage may be unavailable in an embedded browser. */ } };
const remembered = () => { try { return localStorage.getItem(`maboroshi:last:${account}`); } catch { return ''; } };
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...options.headers, 'x-dehub-token': token }, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(typeof data.detail === 'string' ? data.detail : 'Maboroshi could not complete this request.');
  return data;
}
function clearMedia(id) {
  const preview = $(id);
  for (const video of preview.querySelectorAll('video')) { video.pause(); video.removeAttribute('src'); video.load(); }
  preview.replaceChildren(); preview.hidden = true; delete preview.dataset.key;
}
function releaseLocal(id) {
  const saved = localMedia.get(id);
  if (saved) URL.revokeObjectURL(saved.url);
  localMedia.delete(id);
}
function mediaPreview(id, media) {
  if (!media?.url) { clearMedia(id); return; }
  const preview = $(id), key = media.key || media.url;
  if (preview.dataset.key === key) return;
  clearMedia(id);
  const element = document.createElement(media.kind === 'video' ? 'video' : 'img');
  if (media.kind === 'video') { element.controls = true; element.playsInline = true; element.preload = 'metadata'; }
  else element.alt = id === 'second-preview' ? 'Second character reference' : 'Selected character reference';
  element.src = media.url; preview.append(element);
  if (media.name) { const caption = document.createElement('p'); caption.textContent = media.name; preview.append(caption); }
  preview.hidden = false; preview.dataset.key = key;
}
function clearProject() {
  if (pendingPayment) { pendingPayment.reject(Error('The active project changed.')); pendingPayment = null; }
  clearTimeout(timer); requestVersion++; current = null; selectedInput = ''; selectedResult = '';
  for (const id of ['preview', 'result', 'source-preview']) { $(id).pause(); $(id).removeAttribute('src'); $(id).removeAttribute('data-file'); $(id).load(); }
  for (const id of ['source', 'reference', 'second']) releaseLocal(id);
  for (const id of ['source-local', 'reference-preview', 'second-preview']) clearMedia(id);
  $('source-form').reset(); $('references-form').reset(); $('reviewed').checked = false; $('draft-reviewed').checked = false;
  $('character-options').open = false; referencesChanged = false; render();
}
async function list(restore = false) {
  const version = sessionVersion, data = await api('jobs');
  if (version !== sessionVersion) return;
  $('jobs').replaceChildren(new Option('New project', ''));
  for (const job of data.jobs) {
    const date = new Date(job.created * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    $('jobs').add(new Option(`${job.subject || 'Video'} · ${date} · ${stateLabel(job.state)}`, job.id));
  }
  const last = restore ? remembered() : '';
  if (last && data.jobs.some(job => job.id === last)) await load(last);
  $('jobs').value = current?.id || '';
}
function showVideo(kind, entries) {
  const player = $(kind === 'input' ? 'preview' : 'result');
  const link = $(kind === 'input' ? 'preview-download' : 'result-download');
  const tabs = $(kind === 'input' ? 'preview-tabs' : 'result-tabs');
  let selected = kind === 'input' ? selectedInput : selectedResult;
  if (!entries.some(([file]) => file === selected)) selected = entries[0]?.[0] || '';
  tabs.replaceChildren();
  function pick(file) {
    if (kind === 'input') selectedInput = file; else selectedResult = file;
    const url = current.files[file];
    // Status refreshes must not interrupt a full-clip review.
    if (player.dataset.file !== `${current.id}/${file}`) { player.src = url; player.dataset.file = `${current.id}/${file}`; }
    link.href = url; link.download = `maboroshi-${file.replaceAll('/', '-')}`;
    for (const button of tabs.children) button.setAttribute('aria-pressed', String(button.dataset.file === file));
  }
  for (const [file, label] of entries) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.dataset.file = file; button.onclick = () => pick(file); tabs.append(button);
  }
  if (selected) pick(selected);
}
function nextStep() {
  if (pendingPayment) return 'Review the price in DeHub to continue. You can cancel the confirmation.';
  if (busy()) return 'You can leave this page. Your project and progress are saved; return here when it is ready.';
  if (current.state === 'attention') return 'Your saved files are available below. A previous submission needs review before any further paid attempt.';
  if (current.state === 'failed') return 'Your original and any completed previews are available below. Check the processing message before starting a new project.';
  if (current.state === 'uploaded') return 'Next: prepare the clip, then review the motion before generating.';
  if (current.state === 'prepared') return current.review.approved ? 'Clip approved. Choose your character and generate a preview.' : 'Next: watch the entire prepared clip and approve its alignment.';
  if (current.state === 'draft') return 'Next: watch or download the preview. Choose 1080p only if you want an HD version.';
  return 'Your video is ready to download. Your original and preview remain saved.';
}
function render() {
  $('project').hidden = !current; $('progress').hidden = !current;
  $('source-section').hidden = !!current; $('source-preview-section').hidden = !current?.files['upload.mp4'];
  $('jobs').disabled = locked(); $('new-project').disabled = locked(); $('refresh').disabled = locked();
  $('upload').disabled = !token || !allowPayments || locked(); $('upload').textContent = working && !current ? 'Saving your video…' : 'Save project';
  for (const field of $('source-form').querySelectorAll('input,select')) field.disabled = !token || !allowPayments || locked();
  $('reference-fields').disabled = !editable() || locked();
  $('save-references').hidden = !current || !referencesChanged || !editable();
  $('reference-status').textContent = referencesChanged ? 'Character changes will save when you continue.' : current?.hasReference ? 'Character saved to this project.' : 'Choose a reference now, or add one before generating your preview.';
  mediaPreview('reference-preview', localMedia.get('reference') || current?.references?.reference);
  mediaPreview('second-preview', localMedia.get('second') || current?.references?.second);
  const step = !current || current.state === 'uploaded' ? 'choose' : ['draft', 'complete'].includes(current.state) || current.stage === 'hd' || current.stage === 'draft' ? 'export' : 'prepare';
  for (const name of ['choose', 'prepare', 'export']) { if (name === step) $(`step-${name}`).setAttribute('aria-current', 'step'); else $(`step-${name}`).removeAttribute('aria-current'); }
  if (!current) return;
  $('project-status').textContent = pendingPayment ? 'Waiting for payment confirmation' : working ? 'Saving your changes…' : current.status;
  $('next-step').textContent = nextStep(); $('progress').dataset.attention = String(['attention', 'failed'].includes(current.state));
  const source = $('source-preview');
  if (current.files['upload.mp4'] && source.dataset.file !== current.id) { source.src = current.files['upload.mp4']; source.dataset.file = current.id; }
  $('source-download').href = current.files['upload.mp4'] || ''; $('source-download').download = 'maboroshi-original.mp4';
  $('source-meta').textContent = `${Number(current.seconds).toFixed(1)} seconds · Replacing: ${current.subject}`;
  $('prepare-section').hidden = current.state !== 'uploaded' || !allowPayments;
  const input = Object.entries({ 'seedance-input.mp4': 'Prepared clip', 'upload.mp4': 'Original', 'depth.mp4': 'Depth guide', 'mask.mp4': 'Subject mask' }).filter(([file]) => current.files[file]);
  $('review-section').hidden = !current.files['seedance-input.mp4'];
  if (!$('review-section').hidden) showVideo('input', input);
  $('input-review-actions').hidden = current.state !== 'prepared' || !allowPayments || current.review.approved;
  $('review-status').textContent = current.review.approved ? 'Clip approved. You can generate your character preview below.' : current.review.note || 'Watch the whole prepared clip before approving.';
  $('approve').disabled = locked() || busy() || current.state !== 'prepared' || !$('reviewed').checked;
  $('reject').disabled = locked() || busy() || current.state !== 'prepared';
  $('draft-section').hidden = current.state !== 'prepared' || !allowPayments;
  const hasReference = current.hasReference || !!$('reference').files[0];
  $('draft-guidance').textContent = !current.review.approved ? 'Approve the prepared clip above to continue.' : !hasReference ? 'Choose a character reference above to continue.' : 'Your clip is approved. Continue to review the preview price in DeHub.';
  $('resolved').hidden = !current.resolvedPrompt || referencesChanged; $('resolved-prompt').textContent = current.resolvedPrompt;
  const outputs = [['final-preview.mp4', 'Preview'], ['hd/final-preview.mp4', '1080p']].filter(([file]) => current.files[file]);
  $('export-section').hidden = !outputs.length;
  if (outputs.length) showVideo('result', outputs);
  $('hd-review').hidden = current.state !== 'draft' || !allowPayments;
  $('duration-note').hidden = !current.durationAdjustment;
  $('duration-note').textContent = current.durationAdjustment ? `The last frame was held for ${Number(current.durationAdjustment.seconds).toFixed(2)} seconds to preserve the complete original soundtrack.` : '';
  for (const [stage, label, state] of [['prepare', 'Prepare clip', 'uploaded'], ['draft', 'Generate preview', 'prepared'], ['hd', 'Generate 1080p', 'draft']]) {
    const cost = current.quotes[stage];
    $(stage).textContent = cost ? `${label} · ${money(cost)}` : `${label} · temporarily unavailable`;
    $(stage).hidden = !allowPayments || current.state !== state;
    $(stage).disabled = !ready || !allowPayments || locked() || busy() || !cost || current.state !== state ||
      (stage === 'draft' && (!current.review.approved || !hasReference)) || (stage === 'hd' && !$('draft-reviewed').checked);
  }
}
async function load(ident) {
  clearTimeout(timer); const version = ++requestVersion;
  const data = await api(`jobs/${ident}`);
  if (version !== requestVersion) return;
  const changed = current?.id !== data.id; current = data;
  if (changed) {
    selectedInput = ''; selectedResult = ''; $('reviewed').checked = false; $('draft-reviewed').checked = false;
    for (const id of ['preview', 'result', 'source-preview']) $(id).removeAttribute('data-file');
    if (data.prompt) $('prompt').value = data.prompt;
    $('character-options').open = !!data.references?.second;
  }
  remember(data.id); render();
  if (busy() && !document.hidden) timer = setTimeout(() => load(ident).catch(error => message(error.message)), 5000);
}
async function authenticate(data) {
  if (typeof data.token !== 'string' || typeof data.wallet !== 'string') return;
  const permitted = data.allowPayments !== false && data.paymentBridge === 1;
  if (data.token === token && data.wallet.toLowerCase() === account && permitted === allowPayments) return;
  const version = ++sessionVersion;
  clearProject(); working = false; token = data.token; account = data.wallet.toLowerCase(); allowPayments = false;
  $('jobs').replaceChildren(new Option('New project', '')); render(); message('');
  if (!token) { $('connection').textContent = 'Sign in to DeHub to save and continue a project.'; return; }
  try {
    const verified = await api('session');
    if (version !== sessionVersion) return;
    if (verified.wallet !== account) throw Error('The signed-in account does not match this project session. Sign in again.');
    allowPayments = permitted; await list(true);
    if (version !== sessionVersion) return;
    $('connection').textContent = !allowPayments ? 'Saved previews and downloads are available in this app.' : !ready ? 'Processing is temporarily unavailable. Your projects stay saved.' : 'Your projects are private to your DeHub account. Each paid step asks you to confirm.';
    render();
  } catch (error) { if (version === sessionVersion) { allowPayments = false; render(); message(error.message); } }
}
window.addEventListener('message', event => {
  if (event.source !== window.parent || event.origin !== 'https://dehub.io') return;
  if (event.data?.type === 'maboroshi:session') void authenticate(event.data);
  if (event.data?.type === 'maboroshi:payment-result') paymentResult(event.data);
});
// Native injects events only after verifying the exact WebView origin and path.
document.addEventListener('maboroshi:native-session', event => { void authenticate(event.detail); });
document.addEventListener('maboroshi:native-payment-result', event => { paymentResult(event.detail); });
function paymentResult(data) {
  if (!pendingPayment || data?.requestId !== pendingPayment.requestId) return;
  const pending = pendingPayment; pendingPayment = null;
  if (typeof data.error === 'string' && data.error) pending.reject(Error(data.error)); else pending.resolve();
}
function requestPayment(stage) {
  if (!current || !allowPayments || pendingPayment) throw Error('Payment is unavailable in this session.');
  const input = { type: 'maboroshi:pay', requestId: crypto.randomUUID(), id: current.id, stage };
  return new Promise((resolve, reject) => {
    pendingPayment = { requestId: input.requestId, resolve, reject }; render();
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(input));
    else window.parent.postMessage(input, 'https://dehub.io');
  });
}
function announce() {
  if (window.parent !== window) window.parent.postMessage({ type: 'maboroshi:ready' }, 'https://dehub.io');
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'maboroshi:ready' }));
}
for (const id of ['source-download', 'preview-download', 'result-download']) $(id).onclick = event => {
  if (window.ReactNativeWebView) { event.preventDefault(); window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'maboroshi:download', url: $(id).href })); }
};
for (const [id, target] of [['source', 'source-local'], ['reference', 'reference-preview'], ['second', 'second-preview']]) $(id).onchange = () => {
  releaseLocal(id); const file = $(id).files[0];
  if (file) localMedia.set(id, { url: URL.createObjectURL(file), kind: file.type.startsWith('video/') ? 'video' : 'image', name: file.name });
  mediaPreview(target, localMedia.get(id));
  if (id !== 'source') referencesChanged = true;
  render();
};
function referenceData() {
  if (!$('prompt').value.trim()) { $('character-options').open = true; $('prompt').focus(); throw Error('Describe the replacement before continuing.'); }
  for (const id of ['reference', 'second']) {
    const file = $(id).files[0];
    if (file && file.size > (file.type.startsWith('video/') ? 100 : 30) * 1024 * 1024) throw Error('Use images up to 30 MB or a reference video up to 100 MB.');
  }
  if (!current?.hasReference && !$('reference').files[0]) throw Error('Choose a character reference before saving character changes.');
  // Build explicitly so a disabled fieldset during an upload cannot omit files.
  const body = new FormData(); body.set('prompt', $('prompt').value);
  for (const id of ['reference', 'second']) if ($(id).files[0]) body.set(id, $(id).files[0]);
  return body;
}
async function saveReferences() {
  if (!referencesChanged) return;
  const ident = current.id, version = sessionVersion, body = referenceData();
  const data = await api(`jobs/${ident}/references`, { method: 'POST', body });
  if (version !== sessionVersion || current?.id !== ident) throw Error('The active project changed.');
  current = data; referencesChanged = false;
  for (const id of ['reference', 'second']) { $(id).value = ''; releaseLocal(id); }
}
$('source-form').onsubmit = async event => {
  event.preventDefault(); if (!token || !allowPayments || locked()) return;
  const file = $('source').files[0];
  if (!file || file.size > 100 * 1024 * 1024) { message('Choose a video smaller than 100 MB.'); return; }
  const body = new FormData(event.target), version = sessionVersion;
  message(''); working = true; render();
  try {
    const data = await api('jobs', { method: 'POST', body });
    if (version !== sessionVersion) return;
    current = data; remember(data.id); releaseLocal('source'); clearMedia('source-local');
    await list();
    if (version !== sessionVersion) return;
    if ($('reference').files[0]) await saveReferences();
  } catch (error) { if (version === sessionVersion) message(error.message); }
  finally { if (version === sessionVersion) { working = false; render(); } }
};
$('references-form').onsubmit = async event => {
  event.preventDefault(); if (!current || !editable() || locked()) return;
  const version = sessionVersion; message(''); working = true; render();
  try { await saveReferences(); } catch (error) { if (version === sessionVersion) message(error.message); }
  finally { if (version === sessionVersion) { working = false; render(); } }
};
$('references-form').oninput = () => { referencesChanged = true; render(); };
for (const stage of ['prepare', 'draft', 'hd']) $(stage).onclick = async () => {
  if (!current || !allowPayments || locked()) return;
  const ident = current.id, version = sessionVersion; message(''); working = true; render();
  try {
    if (stage !== 'hd') await saveReferences();
    if (version !== sessionVersion || current?.id !== ident) return;
    await requestPayment(stage);
    if (version === sessionVersion && current?.id === ident) await load(ident);
  } catch (error) { if (version === sessionVersion) message(error.message); }
  finally { if (version === sessionVersion) { working = false; render(); } }
};
for (const approved of [true, false]) $(approved ? 'approve' : 'reject').onclick = async () => {
  if (!current || locked()) return;
  const ident = current.id, version = sessionVersion, body = new FormData();
  body.set('approved', String(approved)); body.set('fingerprint', current.review.fingerprint);
  message(''); working = true; render();
  try { const data = await api(`jobs/${ident}/review`, { method: 'POST', body }); if (version === sessionVersion && current?.id === ident) current = data; }
  catch (error) { if (version === sessionVersion) message(error.message); }
  finally { if (version === sessionVersion) { working = false; render(); } }
};
async function canLeave() {
  if (!(referencesChanged || (!current && $('source').files.length))) return true;
  const dialog = $('discard-dialog');
  if (dialog.open) return false;
  return new Promise(resolve => {
    dialog.returnValue = 'keep';
    dialog.onclose = () => resolve(dialog.returnValue === 'discard');
    $('keep-editing').onclick = () => dialog.close('keep');
    $('discard-changes').onclick = () => dialog.close('discard');
    dialog.showModal();
  });
}
async function switchProject(ident) {
  const version = sessionVersion;
  if (locked() || !(await canLeave()) || version !== sessionVersion) { $('jobs').value = current?.id || ''; return; }
  message(''); clearProject(); remember(''); $('jobs').value = ident;
  if (ident) try { await load(ident); } catch (error) { message(error.message); }
}
$('reviewed').onchange = render; $('draft-reviewed').onchange = render;
$('jobs').onchange = () => { void switchProject($('jobs').value); };
$('new-project').onclick = () => { void switchProject(''); };
$('refresh').onclick = async () => {
  if (locked()) return; message('');
  try { await list(); if (current) { for (const id of ['preview', 'result', 'source-preview']) $(id).removeAttribute('data-file'); await load(current.id); } }
  catch (error) { message(error.message); }
};
window.addEventListener('beforeunload', event => { if (referencesChanged || (!current && $('source').files.length)) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { clearTimeout(timer); if (!document.hidden && busy()) void load(current.id).catch(error => message(error.message)); });
fetch('health').then(response => response.json()).then(data => { ready = data.ready; $('connection').textContent = 'Sign in to DeHub to save and continue a project.'; render(); announce(); }).catch(() => { message('Maboroshi is temporarily unavailable. Reload to reconnect.'); announce(); });
