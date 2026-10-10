'use strict';
const $ = (id) => document.getElementById(id);
let token = '', account = '', current = null, ready = false, allowPayments = true, timer, selectedInput = '', selectedResult = '', requestVersion = 0, referencesChanged = false;
const busy = () => current && ['queued', 'running'].includes(current.state);
const money = (micros) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(micros / 1e6);
const message = (text) => { $('error').textContent = text || ''; $('error').hidden = !text; };
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...options.headers, 'x-dehub-token': token }, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(typeof data.detail === 'string' ? data.detail : 'Maboroshi could not complete this request.');
  return data;
}
function clearProject() {
  clearTimeout(timer); requestVersion++; current = null; selectedInput = ''; selectedResult = '';
  for (const id of ['preview', 'result']) { $(id).pause(); $(id).removeAttribute('src'); $(id).load(); }
  $('project').hidden = true; $('source-section').hidden = false;
  $('references-form').reset(); $('reviewed').checked = false; $('draft-reviewed').checked = false;
  referencesChanged = false;
}
async function list() {
  const data = await api('jobs');
  $('jobs').replaceChildren(new Option('New project', ''));
  for (const job of data.jobs) {
    const date = new Date(job.created * 1000).toLocaleString();
    $('jobs').add(new Option(`${date} · ${job.mode.replaceAll('_', ' ')} · ${job.state}`, job.id));
  }
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
    // Refreshing status must not restart a creator's full-clip review.
    if (player.dataset.file !== `${current.id}/${file}`) {
      player.src = url; player.dataset.file = `${current.id}/${file}`;
    }
    link.href = url; link.download = `maboroshi-${file.replaceAll('/', '-')}`;
    for (const button of tabs.children) button.setAttribute('aria-pressed', String(button.dataset.file === file));
  }
  for (const [file, label] of entries) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.dataset.file = file; button.onclick = () => pick(file); tabs.append(button);
  }
  if (selected) pick(selected);
}
function render() {
  if (!current) return;
  $('project').hidden = false; $('source-section').hidden = true;
  $('project-status').textContent = current.status;
  $('prepare-section').hidden = current.state !== 'uploaded';
  const input = Object.entries({ 'seedance-input.mp4': 'Prepared input', 'upload.mp4': 'Original', 'depth.mp4': 'Depth', 'mask.mp4': 'Mask' }).filter(([file]) => current.files[file]);
  $('review-section').hidden = !current.files['seedance-input.mp4'];
  if (!$('review-section').hidden) showVideo('input', input);
  $('review-status').textContent = current.review.note || 'Review the full prepared input.';
  $('approve').disabled = busy() || current.state !== 'prepared' || !$('reviewed').checked;
  $('reject').disabled = busy() || current.state !== 'prepared';
  $('draft-section').hidden = current.state !== 'prepared';
  $('reference-status').textContent = current.hasReference ? `References saved. ${current.referenceKind === 'video' ? 'Omni video reference' : 'Edit image reference'}.` : 'Choose and save your references before generating.';
  $('reference').required = !current.hasReference;
  $('resolved').hidden = !current.resolvedPrompt;
  $('resolved-prompt').textContent = current.resolvedPrompt;
  const outputs = [['final-preview.mp4', 'Draft'], ['hd/final-preview.mp4', '1080p']].filter(([file]) => current.files[file]);
  $('export-section').hidden = !outputs.length;
  if (outputs.length) showVideo('result', outputs);
  $('hd-review').hidden = !!current.files['hd/final-preview.mp4'];
  $('duration-note').hidden = !current.durationAdjustment;
  $('duration-note').textContent = current.durationAdjustment ? `The last frame was held for ${Number(current.durationAdjustment.seconds).toFixed(2)} seconds to preserve the complete original soundtrack.` : '';
  for (const [stage, label] of [['prepare', 'Prepare clip'], ['draft', 'Create draft'], ['hd', 'Generate 1080p']]) {
    const cost = current.quotes[stage];
    $(stage).textContent = cost ? `${label} · ${money(cost)}` : `${label} · unavailable`;
    $(stage).hidden = !allowPayments;
    $(stage).disabled = !ready || !allowPayments || busy() || !cost ||
      (stage === 'draft' && (!current.review.approved || !current.hasReference || referencesChanged)) ||
      (stage === 'hd' && (current.state !== 'draft' || !$('draft-reviewed').checked));
  }
  if (!allowPayments) { $('prepare-section').hidden = true; $('draft-section').hidden = true; $('hd-review').hidden = true; }
}
async function load(ident) {
  clearTimeout(timer);
  const version = ++requestVersion;
  const data = await api(`jobs/${ident}`);
  if (version !== requestVersion) return;
  const changed = current?.id !== data.id;
  current = data;
  if (changed) {
    selectedInput = ''; selectedResult = ''; $('reviewed').checked = false; $('draft-reviewed').checked = false;
    for (const id of ['preview', 'result']) { $(id).removeAttribute('data-file'); }
    if (data.prompt) $('prompt').value = data.prompt;
  }
  render();
  if (busy() && !document.hidden) timer = setTimeout(() => load(ident).catch((error) => message(error.message)), 5000);
}
async function authenticate(data) {
  if (typeof data.token !== 'string' || typeof data.wallet !== 'string') return;
  if (data.token === token && data.wallet === account) return;
  clearProject(); token = data.token; account = data.wallet; allowPayments = data.allowPayments !== false;
  $('jobs').replaceChildren(new Option('New project', ''));
  $('upload').disabled = !token; message('');
  if (!token) { $('connection').textContent = 'Sign in to DeHub to save and run a Maboroshi project.'; return; }
  try {
    await list();
    $('connection').textContent = !allowPayments ? 'Your saved project previews and downloads are available in this app.' : !ready ? 'Processing is temporarily unavailable. Your projects stay saved and nothing will be charged.' : 'Use your DeHub credits. Each processing step shows its price before you start.';
    if (!allowPayments) { $('prepare-section').hidden = true; $('draft-section').hidden = true; $('hd-review').hidden = true; }
  } catch (error) { $('upload').disabled = true; message(error.message); }
}
window.addEventListener('message', (event) => {
  if (event.source !== window.parent || event.origin !== 'https://dehub.io' || event.data?.type !== 'maboroshi:session') return;
  void authenticate(event.data);
});
// Native injects this event only after verifying the WebView's exact origin/path.
document.addEventListener('maboroshi:native-session', (event) => { void authenticate(event.detail); });
function announce() {
  if (window.parent !== window) window.parent.postMessage({ type: 'maboroshi:ready' }, 'https://dehub.io');
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'maboroshi:ready' }));
}
for (const id of ['preview-download', 'result-download']) $(id).onclick = (event) => {
  if (window.ReactNativeWebView) {
    event.preventDefault();
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'maboroshi:download', url: $(id).href }));
  }
};
$('source-form').onsubmit = async (event) => {
  event.preventDefault(); if (!token) return; message(''); $('upload').disabled = true;
  try {
    const file = $('source').files[0]; if (!file || file.size > 100 * 1024 * 1024) throw Error('Choose a video smaller than 100 MB.');
    current = await api('jobs', { method: 'POST', body: new FormData(event.target) }); render(); await list();
  } catch (error) { message(error.message); } finally { $('upload').disabled = !token; }
};
$('references-form').onsubmit = async (event) => {
  event.preventDefault(); if (!current) return; message(''); $('save-references').disabled = true;
  try {
    for (const id of ['reference', 'second']) if ($(id).files[0]?.size > 100 * 1024 * 1024) throw Error('Each reference must be smaller than 100 MB.');
    current = await api(`jobs/${current.id}/references`, { method: 'POST', body: new FormData(event.target) }); referencesChanged = false; render();
  } catch (error) { message(error.message); } finally { $('save-references').disabled = false; }
};
$('references-form').oninput = () => { referencesChanged = true; render(); };
for (const stage of ['prepare', 'draft', 'hd']) $(stage).onclick = async () => {
  if (!current) return; message(''); $(stage).disabled = true;
  try { const body = new FormData(); body.set('price_micros', current.quotes[stage]); await api(`jobs/${current.id}/${stage}`, { method: 'POST', body }); await load(current.id); }
  catch (error) { message(error.message); render(); }
};
for (const approved of [true, false]) $(approved ? 'approve' : 'reject').onclick = async () => {
  message(''); const body = new FormData(); body.set('approved', String(approved)); body.set('fingerprint', current.review.fingerprint);
  try { current = await api(`jobs/${current.id}/review`, { method: 'POST', body }); render(); }
  catch (error) { message(error.message); }
};
$('reviewed').onchange = render; $('draft-reviewed').onchange = render;
$('jobs').onchange = () => { message(''); if ($('jobs').value) void load($('jobs').value).catch((error) => message(error.message)); else clearProject(); };
$('refresh').onclick = async () => { message(''); try { await list(); if (current) { for (const id of ['preview', 'result']) $(id).removeAttribute('data-file'); await load(current.id); } } catch (error) { message(error.message); } };
document.addEventListener('visibilitychange', () => { clearTimeout(timer); if (!document.hidden && busy()) void load(current.id).catch((error) => message(error.message)); });
fetch('health').then((response) => response.json()).then((data) => { ready = data.ready; $('connection').textContent = 'Sign in to DeHub to save and run a Maboroshi project.'; announce(); }).catch(() => { message('Maboroshi is temporarily unavailable. Reload to reconnect.'); announce(); });
