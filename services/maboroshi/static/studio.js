'use strict';
const $ = (id) => document.getElementById(id);
const remakeMode = new URLSearchParams(location.search).get('workflow') === 'remake';
let token = '', account = '', current = null, ready = false, allowPayments = false, timer;
let selectedInput = '', selectedResult = '', requestVersion = 0, sessionVersion = 0;
let referencesChanged = false, working = false, pendingPayment = null, paymentNotice = '';
const localMedia = new Map();
let selectedSourceFile = null, selectedClipId = '', clipImport = null;
let libraryBridge = false, libraryPending = null;
function renderLibraryDelivery() {
  for (const id of ['result-save-library', 'remake-save-library']) {
    $(id).hidden = !libraryBridge;
    $(id).disabled = !token || !!libraryPending || locked() || busy() || (id === 'remake-save-library' && current?.state !== 'edit_complete');
  }
}
async function saveToLibrary(remake) {
  if (!libraryBridge || !token || !current || libraryPending || locked() || busy()) return;
  const version = sessionVersion, ident = current.id;
  const requestId = crypto.randomUUID();
  libraryPending = { requestId, projectId: ident };
  renderLibraryDelivery();
  $('library-save-status').textContent = 'Preparing your saved output…';
  try {
    // Refresh expiring media links from the authenticated saved project.
    await load(ident);
    if (version !== sessionVersion || current?.id !== ident) return;
    const url = remake ? current.state === 'edit_complete' && current.files['remake-result.mp4'] : current.files[selectedResult];
    if (!url) throw Error('This output is not ready. Your saved project is retained.');
    const input = { type: 'maboroshi:save', requestId, wallet: account, projectId: ident, url,
      version: remake ? current.remake.shots.map(shot => shot.id).join('.') : '0', createdAt: current.created * 1000 };
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(input));
    else window.parent.postMessage(input, 'https://dehub.io');
    $('library-save-status').textContent = 'Saving to your private library…';
    setTimeout(() => {
      if (version === sessionVersion && libraryPending?.requestId === requestId) {
        libraryPending = null; render();
        $('library-save-status').textContent = 'Save confirmation was interrupted. Your project is retained; retry saving without another generation charge.';
      }
    }, 120000);
  } catch (error) {
    if (version === sessionVersion) { libraryPending = null; render(); $('library-save-status').textContent = error.message; }
  }
}
function librarySaveResult(data) {
  if (!libraryPending || data?.requestId !== libraryPending.requestId) return;
  const sameProject = current?.id === libraryPending.projectId;
  libraryPending = null; render();
  if (sameProject) $('library-save-status').textContent = data.error ? 'Could not save. Your project is retained. Try again.' : 'Saved to your private generation library. Open Creator to add it to your timeline.';
}
document.addEventListener('maboroshi:native-save-result', event => librarySaveResult(event.detail));
$('result-save-library').onclick = () => void saveToLibrary(false);
$('remake-save-library').onclick = () => void saveToLibrary(true);
const presets = window.MABOROSHI_PRESETS || [];
const linkedPreset = presets.find(preset => preset.id === new URLSearchParams(location.search).get('preset')) || null;
let selectedPreset = linkedPreset;
function renderPresets() {
  const search = $('preset-search').value.trim().toLocaleLowerCase(), group = $('preset-group').value;
  const featured = window.MABOROSHI_FEATURED || [];
  const rank = preset => featured.includes(preset.id) ? featured.indexOf(preset.id) : featured.length;
  const matches = presets.filter(preset => (!group || preset.group === group) &&
    `${preset.name} ${preset.group} ${preset.direction}`.toLocaleLowerCase().includes(search)).sort((a, b) => rank(a) - rank(b));
  $('preset-count').textContent = `${matches.length} of ${presets.length} presets`;
  $('preset-reset-search').hidden = !search && !group;
  $('preset-list').replaceChildren();
  for (const preset of matches) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'preset-card secondary';
    button.setAttribute('aria-pressed', String(selectedPreset?.id === preset.id));
    const name = document.createElement('strong'), category = document.createElement('small');
    name.textContent = preset.name; category.textContent = preset.group; button.append(name, category);
    button.onclick = () => { selectedPreset = preset; renderPresetDetail(); for (const card of $('preset-list').children) card.setAttribute('aria-pressed', String(card === button)); };
    $('preset-list').append(button);
  }
}
function renderPresetDetail() {
  $('preset-detail').hidden = !selectedPreset;
  $('preset-name').textContent = selectedPreset?.name || '';
  $('preset-direction').textContent = selectedPreset?.direction || '';
  $('preset-apply').disabled = !selectedPreset || !editable() || locked();
  $('preset-guidance').textContent = !token ? 'Sign in to DeHub to use a preset.' : !allowPayments ? 'This app supports saved previews and downloads.' : !editable() ? 'Start a new project to try another look.' : 'Replaces the direction below. Your files stay selected. You can edit the wording before saving.';
}
const busy = () => current && ['queued', 'running'].includes(current.state);
const locked = () => working || !!pendingPayment || !!libraryPending;
const editable = () => allowPayments && (!current || ['uploaded', 'prepared'].includes(current.state));
const money = (micros) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(micros / 1e6);
const stateLabel = (state) => ({ uploaded: 'Ready to prepare', prepared: 'Ready to review', queued: 'Queued', running: 'Processing', draft: 'Preview ready', complete: 'Video ready', failed: 'Needs attention', attention: 'Needs attention' })[state] || 'Saved';
const message = (text) => { paymentNotice = ''; $('error').textContent = text || ''; $('error').hidden = !text; };
const remember = (id) => { try { localStorage.setItem(`maboroshi:${remakeMode ? 'remake' : 'last'}:${account}`, id || ''); } catch { /* Storage may be unavailable in an embedded browser. */ } };
const remembered = () => { try { return localStorage.getItem(`maboroshi:${remakeMode ? 'remake' : 'last'}:${account}`); } catch { return ''; } };
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
  libraryPending = null; $('library-save-status').textContent = '';
  clipImport?.abort(); clipImport = null; selectedSourceFile = null; selectedClipId = ''; $('source').required = true;
  if (pendingPayment) { pendingPayment.reject(Error('The active project changed.')); pendingPayment = null; }
  clearTimeout(timer); requestVersion++; current = null; selectedInput = ''; selectedResult = ''; paymentNotice = '';
  for (const id of ['preview', 'result', 'source-preview']) { $(id).pause(); $(id).removeAttribute('src'); $(id).removeAttribute('data-file'); $(id).load(); }
  for (const id of ['source', 'reference', 'second']) releaseLocal(id);
  for (const id of ['source-local', 'reference-preview', 'second-preview']) clearMedia(id);
  $('source-form').reset(); $('references-form').reset(); $('reviewed').checked = false; $('draft-reviewed').checked = false;
  if (remakeMode) $('renderer').value = 'kling';
  if (typeof resetRemake === 'function') resetRemake();
  $('character-options').open = false; referencesChanged = false; render();
  selectedPreset = linkedPreset; $('preset-applied').hidden = true; $('preset-browser').open = !!linkedPreset; renderPresets(); renderPresetDetail();
}
async function list(restore = false) {
  const version = sessionVersion, data = await api('jobs');
  if (version !== sessionVersion) return;
  $('jobs').replaceChildren(new Option('New project', ''));
  for (const job of data.jobs) {
    if (remakeMode !== (job.workflow === 'remake')) continue;
    const date = new Date(job.created * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    $('jobs').add(new Option(`${job.subject || 'Video'} · ${date} · ${stateLabel(job.state)}`, job.id));
  }
  const last = restore && !linkedPreset ? remembered() : '';
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
  if (current.remake) return current.remake.building ? 'Resume the saved shot plan below. No generation has started.' : current.state === 'edit_complete' ? 'Your assembled edit is ready to download.' : 'Generate the saved shots below. Each has its own price; assemble when every shot is ready.';
  if (current.state === 'uploaded') return 'Next: prepare the clip, then review the motion before generating.';
  if (current.state === 'prepared') return current.renderer === 'kling' ? current.review.approved ? 'Source approved. Choose your character and generate the complete Kling video.' : 'Next: watch and approve your entire original source clip.' : current.review.approved ? 'Clip approved. Choose your character and generate a preview.' : 'Next: watch the entire prepared clip and approve its alignment.';
  if (current.state === 'draft') return 'Next: watch or download the preview. Choose 1080p only if you want an HD version.';
  return 'Your video is ready to download. Your original and preview remain saved.';
}
function render() {
  renderLibraryDelivery();
  renderPresetDetail();
  const kling = (current ? current.renderer || 'seedance' : $('renderer').value) === 'kling';
  $('preparation-options').hidden = kling;
  $('renderer-help').textContent = kling ? 'Kling: 3–15 second MP4/MOV at 720p or higher, with image references. One paid render; original soundtrack preserved.' : 'Seedance Premium: 2–30 seconds, image or video references. Paid preparation and preview, with optional 1080p completion.';
  $('reference').accept = kling ? 'image/png,image/jpeg,image/webp' : 'image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm';
  $('review-guidance').textContent = kling ? 'Watch the full original clip and confirm the subject, motion and soundtrack. Kling uses this source directly.' : 'Check edges, hair, hands, background spill and face alignment through every cut. Listen to the pitched vocals.';
  $('review-label').textContent = kling ? 'I reviewed the whole original clip and want to use it for this edit.' : 'I reviewed the whole prepared clip and its alignment is correct.';
  $('render-hint').textContent = kling ? 'One complete render. No preparation or separate HD charge.' : 'HD is a separate choice after you watch the preview.';
  $('export-guidance').textContent = kling ? 'Your complete original soundtrack is restored. Download your finished Kling video.' : 'Your full original soundtrack is restored. You can download the preview as it is, or approve HD within six days.';
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
  const step = !current || current.state === 'uploaded' ? 'choose' : current.remake || ['draft', 'complete'].includes(current.state) || current.stage === 'hd' || current.stage === 'draft' ? 'export' : 'prepare';
  for (const name of ['choose', 'prepare', 'export']) { if (name === step) $(`step-${name}`).setAttribute('aria-current', 'step'); else $(`step-${name}`).removeAttribute('aria-current'); }
  if (typeof renderRemake === 'function') renderRemake();
  if (!current) return;
  $('project-status').textContent = pendingPayment ? 'Waiting for payment confirmation' : working ? 'Saving your changes…' : paymentNotice || current.status;
  $('progress').dataset.notice = String(!!paymentNotice && !working && !pendingPayment);
  $('next-step').textContent = nextStep(); $('progress').dataset.attention = String(['attention', 'failed'].includes(current.state));
  const source = $('source-preview');
  if (current.files['upload.mp4'] && source.dataset.file !== current.id) { source.src = current.files['upload.mp4']; source.dataset.file = current.id; }
  $('source-download').href = current.files['upload.mp4'] || ''; $('source-download').download = 'maboroshi-original.mp4';
  $('source-meta').textContent = `${Number(current.seconds).toFixed(1)} seconds · ${kling ? 'Kling' : 'Seedance Premium'} · Replacing: ${current.subject}`;
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
  const outputs = [['final-preview.mp4', kling ? 'Kling result' : 'Preview'], ['hd/final-preview.mp4', '1080p']].filter(([file]) => current.files[file]);
  $('export-section').hidden = !outputs.length;
  if (outputs.length) showVideo('result', outputs);
  $('hd-review').hidden = current.state !== 'draft' || !allowPayments;
  $('duration-note').hidden = !current.durationAdjustment;
  $('duration-note').textContent = current.durationAdjustment ? `The last frame was held for ${Number(current.durationAdjustment.seconds).toFixed(2)} seconds to preserve the complete original soundtrack.` : '';
  for (const [stage, label, state] of [['prepare', 'Prepare clip', 'uploaded'], ['draft', 'Generate preview', 'prepared'], ['hd', 'Generate 1080p', 'draft']]) {
    const cost = current.quotes[stage];
    const title = kling && stage === 'draft' ? 'Generate Kling video' : label;
    $(stage).textContent = cost ? `${title} · ${money(cost)}` : `${title} · temporarily unavailable`;
    $(stage).hidden = !allowPayments || current.state !== state || (kling && stage !== 'draft');
    $(stage).disabled = !ready || !allowPayments || locked() || busy() || !cost || current.state !== state ||
      (stage === 'draft' && (!current.review.approved || !hasReference)) || (stage === 'hd' && !$('draft-reviewed').checked);
  }
  if (remakeMode || current.remake) $('draft-section').hidden = true;
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
    $('preset-applied').hidden = true;
    $('character-options').open = !!data.references?.second;
  }
  remember(data.id); render();
  if ((busy() || current.remake?.shots.some(shot => ['queued', 'running'].includes(shot.state))) && !document.hidden) timer = setTimeout(() => load(ident).catch(error => message(error.message)), 5000);
}
async function authenticate(data) {
  if (typeof data.token !== 'string' || typeof data.wallet !== 'string') return;
  const permitted = data.allowPayments !== false && data.paymentBridge === 1;
  libraryBridge = data.libraryBridge === 1;
  renderLibraryDelivery();
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
  if (event.data?.type === 'maboroshi:save-result') librarySaveResult(event.data);
  if (event.data?.type === 'maboroshi:clip') void chooseCatalogClip(event.data.clip);
});
// Native injects events only after verifying the exact WebView origin and path.
document.addEventListener('maboroshi:native-session', event => { void authenticate(event.detail); });
document.addEventListener('maboroshi:native-payment-result', event => { paymentResult(event.detail); });
document.addEventListener('maboroshi:native-clip', event => { void chooseCatalogClip(event.detail); });
async function chooseCatalogClip(clip) {
  if (!clip || !/^[a-f0-9]{20}$/.test(clip.id || '') || typeof clip.url !== 'string' || typeof clip.name !== 'string' || !(clip.seconds >= 3 && clip.seconds <= 30)) return;
  let url;
  try { url = new URL(clip.url); } catch { return; }
  if (url.protocol !== 'https:' || url.username || url.password || !['d2ol7oe51mr4n9.cloudfront.net', 'cdn.higgsfield.ai', 'd8j0ntlcm91z4.cloudfront.net', 'static.higgsfield.ai', 'jeanphilai.com', 'media.pixverse.ai'].includes(url.hostname)) return;
  if (selectedClipId === clip.id) return;
  if (clipImport) return;
  if (current || locked()) { message('Start a new project before choosing another source clip. Your saved project stays available.'); return; }
  const version = sessionVersion, controller = new AbortController(); clipImport = controller;
  working = true; message(''); render();
  try {
    const response = await fetch(`https://dehub.io/api/creator-motion-source?id=${encodeURIComponent(clip.id)}`, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal });
    if (!response.ok || Number(response.headers.get('Content-Length')) > 100 * 1024 * 1024) throw Error('This source clip is unavailable or exceeds 100 MB. Choose another clip.');
    const blob = await response.blob();
    if (blob.size > 100 * 1024 * 1024) throw Error('Choose a source clip smaller than 100 MB.');
    if (version !== sessionVersion || current || controller.signal.aborted) return;
    releaseLocal('source');
    selectedSourceFile = new File([blob], `source-${clip.id}.mp4`, { type: 'video/mp4' });
    selectedClipId = clip.id; $('source').value = ''; $('source').required = false;
    localMedia.set('source', { url: URL.createObjectURL(selectedSourceFile), kind: 'video', name: clip.name });
    mediaPreview('source-local', localMedia.get('source'));
    $('source-section').scrollIntoView({ block: 'start', behavior: 'smooth' });
  } catch (error) { if (version === sessionVersion && error.name !== 'AbortError') message(error.message); }
  finally { if (clipImport === controller) { clipImport = null; working = false; render(); } }
}
function paymentResult(data) {
  if (!pendingPayment || data?.requestId !== pendingPayment.requestId) return;
  const pending = pendingPayment; pendingPayment = null;
  // Older web/native hosts identify their explicit Cancel action by this text.
  if (data.cancelled === true || data.error === 'Payment cancelled.') { pending.resolve({ cancelled: true }); return; }
  if (typeof data.error === 'string' && data.error) pending.reject(Error(data.error)); else pending.resolve();
}
function requestPayment(stage, ident = current?.id) {
  if (!current || !allowPayments || pendingPayment) throw Error('Payment is unavailable in this session.');
  const input = { type: 'maboroshi:pay', requestId: crypto.randomUUID(), id: ident, stage };
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
  if (id === 'source') { selectedSourceFile = null; selectedClipId = ''; $('source').required = true; }
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
  const file = selectedSourceFile || $('source').files[0];
  if (!file || file.size > 100 * 1024 * 1024) { message('Choose a video smaller than 100 MB.'); return; }
  const body = new FormData(event.target), version = sessionVersion; body.set('video', file);
  if (remakeMode) { body.set('workflow', 'remake'); body.set('renderer', 'kling'); }
  message(''); working = true; render();
  try {
    const data = await api('jobs', { method: 'POST', body });
    if (version !== sessionVersion) return;
    current = data; remember(data.id); selectedSourceFile = null; selectedClipId = ''; releaseLocal('source'); clearMedia('source-local');
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
$('preset-search').oninput = renderPresets;
$('preset-group').onchange = renderPresets;
$('preset-reset-search').onclick = () => { $('preset-search').value = ''; $('preset-group').value = ''; renderPresets(); $('preset-search').focus(); };
$('preset-apply').onclick = () => {
  if (!selectedPreset || !editable() || locked()) return;
  $('prompt').value = selectedPreset.prompt; referencesChanged = true;
  $('preset-applied').textContent = `${selectedPreset.name} selected. Add a matching character reference, or edit the direction below.`;
  $('preset-applied').hidden = false; $('preset-browser').open = false; $('character-options').open = true;
  render(); $('reference').focus();
};
$('preset-total').textContent = `(${presets.length})`;
$('preset-browser').open = !!linkedPreset;
for (const group of new Set(presets.map(preset => preset.group))) $('preset-group').add(new Option(group, group));
renderPresets(); renderPresetDetail();
const featuredRail = $('featured-looks');
for (const [index, id] of (window.MABOROSHI_FEATURED || []).entries()) {
  const preset = presets.find(item => item.id === id);
  if (!preset) continue;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'featured-look';
  const art = document.createElement('span'); art.className = 'look-art'; art.setAttribute('aria-hidden', 'true');
  art.style.backgroundPosition = `${(index % 3) * 50}% ${Math.floor(index / 3) * 100}%`;
  const name = document.createElement('strong'); name.textContent = preset.name; button.append(art, name);
  button.onclick = () => { selectedPreset = preset; $('preset-browser').open = true; renderPresets(); renderPresetDetail(); $('preset-detail').scrollIntoView({ block: 'nearest' }); $('preset-apply').focus(); };
  featuredRail.append(button);
}
for (const stage of ['prepare', 'draft', 'hd']) $(stage).onclick = async () => {
  if (!current || !allowPayments || locked()) return;
  const ident = current.id, version = sessionVersion; message(''); working = true; render();
  try {
    if (stage !== 'hd') await saveReferences();
    if (version !== sessionVersion || current?.id !== ident) return;
    const result = await requestPayment(stage);
    if (version === sessionVersion && current?.id === ident) {
      if (result?.cancelled) paymentNotice = 'Payment cancelled. Your project is saved.';
      else await load(ident);
    }
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
  if (!(referencesChanged || (!current && ($('source').files.length || selectedSourceFile)))) return true;
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
$('renderer').onchange = render;
$('jobs').onchange = () => { void switchProject($('jobs').value); };
$('new-project').onclick = () => { void switchProject(''); };
$('refresh').onclick = async () => {
  if (locked()) return; message('');
  try { await list(); if (current) { for (const id of ['preview', 'result', 'source-preview']) $(id).removeAttribute('data-file'); await load(current.id); } }
  catch (error) { message(error.message); }
};
window.addEventListener('beforeunload', event => { if (referencesChanged || (!current && ($('source').files.length || selectedSourceFile))) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { clearTimeout(timer); if (!document.hidden && busy()) void load(current.id).catch(error => message(error.message)); });
fetch('health').then(response => response.json()).then(data => { ready = data.ready; $('connection').textContent = 'Sign in to DeHub to save and continue a project.'; render(); announce(); }).catch(() => { message('Maboroshi is temporarily unavailable. Reload to reconnect.'); announce(); });
