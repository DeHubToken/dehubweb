'use strict';
let remakeRendered = '', remakeDrafts = new Map();
function resetRemake() {
  remakeRendered = ''; remakeDrafts.clear(); $('remake-cuts').value = '';
}
function remakeButton(label, action) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
  button.disabled = !allowPayments || locked() || busy(); button.onclick = action; return button;
}
async function remakeAction(action) {
  if (!current || !allowPayments || locked() || busy()) return;
  const ident = current.id, version = sessionVersion;
  message(''); working = true; render();
  try {
    const result = await action(ident);
    if (version !== sessionVersion || current?.id !== ident) return;
    if (result?.id) current = result;
    await load(ident);
  } catch (error) { if (version === sessionVersion) message(error.message); }
  finally { if (version === sessionVersion) { working = false; remakeRendered = ''; render(); } }
}
function renderRemake() {
  const enabled = remakeMode || !!current?.remake;
  $('remake-section').hidden = !enabled || !current;
  if (!enabled) return;
  $('renderer').value = 'kling'; $('renderer').closest('label').hidden = true;
  document.querySelector('h1').textContent = 'Remake';
  document.querySelector('header > p').textContent = 'Their rhythm. Your story.';
  document.querySelector('.look-showcase').hidden = true;
  $('remake-plan').disabled = !current || locked() || !allowPayments || !current.review.approved || !(current.hasReference || $('reference').files[0]);
  $('remake-scan').disabled = !current || locked() || !allowPayments || !!current.remake;
  $('remake-cuts').disabled = locked() || !allowPayments;
  $('remake-planner').hidden = !!current?.remake && !current.remake.building;
  $('remake-plan-note').textContent = current?.review.approved ? 'Planning saves the current references and cut list. Generation is priced separately for each shot.' : 'Save image references and approve the reference clip above first.';
  if (!current?.remake) { $('remake-shots').replaceChildren(); $('remake-summary').textContent = ''; $('remake-assemble').hidden = true; $('remake-output').hidden = true; return; }
  const plan = current.remake;
  if (plan.building) {
    $('remake-cuts').value = plan.cuts.join(', '); $('remake-cuts').disabled = true;
    $('remake-plan').textContent = 'Resume saved shot plan · no generation charge';
    $('remake-plan').disabled = locked() || !allowPayments;
  }
  const complete = plan.shots.every(shot => shot.state === 'complete');
  $('remake-summary').textContent = plan.building ? 'Shot planning was interrupted. Your saved segments are retained; this project needs recovery before generation.' :
    `${plan.shots.filter(shot => shot.state === 'complete').length} of ${plan.shots.length} shots ready. ${money(plan.shots.filter(shot => shot.state === 'prepared').reduce((sum, shot) => sum + shot.priceMicros, 0))} for the currently ungenerated shots. Revisions require a separate confirmation.`;
  $('remake-assemble').hidden = plan.building || !allowPayments || current.state === 'edit_complete';
  $('remake-assemble').disabled = !complete || locked() || busy();
  const assembled = current.files['remake-result.mp4'];
  $('remake-output').hidden = !assembled;
  if (assembled) {
    $('remake-output-title').textContent = current.state === 'edit_complete' ? 'Your finished edit' : 'Previous assembled edit · assemble again after completing revisions';
    const key = `${current.id}:${current.state}:${plan.shots.map(shot => shot.id).join(',')}`;
    if ($('remake-result').dataset.version !== key) { $('remake-result').src = assembled; $('remake-result').dataset.version = key; }
    $('remake-download').href = assembled;
  }
  // Refresh state and prices without destroying a prompt the creator is editing.
  const signature = JSON.stringify([current.id, plan.shots.map(shot => [shot.id, shot.state, shot.status, shot.results.map(result => result.id)]), locked(), allowPayments, current.state]);
  if (signature === remakeRendered) return;
  remakeRendered = signature; $('remake-shots').replaceChildren();
  for (const shot of plan.shots) {
    const card = document.createElement('details'); card.className = 'remake-shot'; card.open = shot.index === 0;
    const title = document.createElement('summary');
    title.textContent = `Shot ${shot.index + 1} · ${(shot.start / NumberFraction(plan.fps)).toFixed(2)}–${(shot.end / NumberFraction(plan.fps)).toFixed(2)}s · ${stateLabel(shot.state)}`;
    const status = document.createElement('p'); status.className = 'hint'; status.textContent = shot.status;
    const media = document.createElement('div'); media.className = 'creative-grid';
    const reference = document.createElement('video'); reference.src = shot.source; reference.controls = true; reference.playsInline = true; reference.preload = 'none'; reference.setAttribute('aria-label', `Reference shot ${shot.index + 1}`); media.append(reference);
    if (shot.results.length) {
      const result = document.createElement('video'); result.src = shot.results[0].url; result.controls = true; result.playsInline = true; result.preload = 'none'; result.setAttribute('aria-label', `Generated shot ${shot.index + 1}`); media.append(result);
      if (shot.results.length > 1) {
        const versions = document.createElement('select'); versions.setAttribute('aria-label', `Preview versions of shot ${shot.index + 1}`);
        for (const saved of shot.results) versions.add(new Option(`Version ${shot.versions.indexOf(saved.id) + 1}${saved.id === shot.id ? ' · selected for assembly' : ''}`, saved.id));
        versions.onchange = () => { result.src = shot.results.find(saved => saved.id === versions.value).url; };
        media.append(versions, remakeButton('Use previewed version · no generation charge', () => void remakeAction(ident => {
          const body = new FormData(); body.set('shot', String(shot.index)); body.set('version', versions.value);
          return api(`jobs/${ident}/remake/select`, { method: 'POST', body });
        })));
      }
    }
    card.append(title, status, media);
    if (shot.state === 'prepared' && !plan.building) {
      const quote = document.createElement('p'); quote.className = 'hint';
      quote.textContent = `${shot.seconds.toFixed(2)} seconds in the edit · ${shot.billableSeconds} billable seconds. Short shots use a held final frame to meet the model's 3-second minimum; assembly removes that padding.`;
      card.append(quote, remakeButton(`Generate shot ${shot.index + 1} · ${money(shot.priceMicros)}`, () => void remakeAction(async () => { const result = await requestPayment('draft', shot.id); if (result?.cancelled) paymentNotice = 'Payment cancelled. Your shot is saved.'; })));
    }
    if (['complete', 'failed'].includes(shot.state) && shot.versions.length < 5) {
      const label = document.createElement('label'); label.textContent = 'Revise this shot';
      const prompt = document.createElement('textarea'); prompt.maxLength = 6000; prompt.rows = 4;
      prompt.value = remakeDrafts.get(shot.id) || shot.prompt; prompt.disabled = locked() || busy() || !allowPayments;
      prompt.oninput = () => remakeDrafts.set(shot.id, prompt.value); label.append(prompt);
      const button = remakeButton('Save revision · review its generation price next', () => void remakeAction(ident => {
        const body = new FormData(); body.set('shot', String(shot.index)); body.set('prompt', prompt.value);
        return api(`jobs/${ident}/remake/revise`, { method: 'POST', body });
      }));
      card.append(label, button);
    }
    if (shot.state === 'attention' || shot.state === 'failed') {
      const note = document.createElement('p'); note.className = 'hint'; note.textContent = 'The submission and payment records are saved. Refresh to collect an in-flight render; an uncertain submission will not be sent again.'; card.append(note);
    }
    if (shot.canCollect) card.append(remakeButton('Collect submitted shot · no new generation', () => void remakeAction(ident => {
      const body = new FormData(); body.set('shot', String(shot.index));
      return api(`jobs/${ident}/remake/collect`, { method: 'POST', body });
    })));
    $('remake-shots').append(card);
  }
}
function NumberFraction(value) { const [numerator, denominator = '1'] = String(value).split('/'); return Number(numerator) / Number(denominator); }
$('remake-scan').onclick = () => void remakeAction(async ident => {
  const version = sessionVersion;
  const result = await api(`jobs/${ident}/remake/scan`, { method: 'POST' });
  if (version !== sessionVersion || current?.id !== ident) return;
  $('remake-cuts').value = result.cuts.join(', ');
  if (result.cuts.length >= result.maxShots) throw Error(`Detected ${result.cuts.length + 1} shots. Edit the cuts to keep at most ${result.maxShots} shots before saving.`);
});
$('remake-plan').onclick = () => void remakeAction(async ident => {
  const value = $('remake-cuts').value.trim();
  const cuts = value ? value.split(',').map(part => part.trim() ? Number(part.trim()) : NaN) : [];
  if (cuts.some(at => !Number.isFinite(at))) throw Error('Enter cut times as numbers separated by commas.');
  await saveReferences();
  const body = new FormData(); body.set('cuts', JSON.stringify(cuts));
  return api(`jobs/${ident}/remake/plan`, { method: 'POST', body });
});
$('remake-assemble').onclick = () => void remakeAction(ident => api(`jobs/${ident}/remake/assemble`, { method: 'POST' }));
$('remake-download').onclick = event => {
  if (window.ReactNativeWebView) { event.preventDefault(); window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'maboroshi:download', url: $('remake-download').href })); }
};
if (remakeMode) $('renderer').value = 'kling';
render();
