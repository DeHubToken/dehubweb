import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const html = readFileSync(resolve(__dirname, '../../public/trenchstar-game/index.html'), 'utf8');
const script = html.match(/<script>\s*(window\.TSBoot = [\s\S]*?)<\/script>/)?.[1];
const stages = ['engine', 'world', 'markets', 'trenches', 'paint', 'avatars', 'interface'];

function bootRoom() {
  const doc = document.implementation.createHTMLDocument();
  doc.body.className = 'booting';
  doc.body.innerHTML = '<div id="boot"><div id="bootPct"></div><div id="bootBar"><i></i></div><div id="bootStage"></div><div id="bootLines"></div><div id="bootFail"></div></div>';
  const win = new EventTarget() as EventTarget & {
    TSBoot: { stage: (key: string, fraction: number) => void; fail: (title: string, detail: string) => void };
  };
  if (!script) throw new Error('Chartopia boot script is missing');
  runInNewContext(script, {
    window: win, document: doc, Date, setTimeout, setInterval,
    performance: { getEntriesByType: () => [] },
  });
  return { doc, win, api: win.TSBoot, overlay: doc.getElementById('boot')! };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Chartopia launch reveal', () => {
  it.each(['markets', 'trenches', 'paint', 'interface'])('keeps the room covered while %s is unfinished, even after the old timeout', (pending) => {
    const { doc, api, overlay } = bootRoom();
    for (const stage of stages) if (stage !== pending) api.stage(stage, 1);
    vi.advanceTimersByTime(60_000);
    expect(doc.getElementById('bootPct')!.textContent).toBe('99%');
    expect(doc.body.classList.contains('booting')).toBe(true);
    expect(overlay.classList.contains('off')).toBe(false);

    api.stage(pending, 1);
    vi.advanceTimersByTime(1000);
    expect(doc.getElementById('bootPct')!.textContent).toBe('100%');
    expect(doc.body.classList.contains('booting')).toBe(false);
    expect(overlay.classList.contains('off')).toBe(true);
  });

  it('finishes the existing count before revealing a room that loaded quickly', () => {
    const { doc, api, overlay } = bootRoom();
    for (const stage of stages) api.stage(stage, 1);
    vi.advanceTimersByTime(100);
    expect(doc.body.classList.contains('booting')).toBe(true);
    expect(overlay.classList.contains('off')).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(doc.getElementById('bootPct')!.textContent).toBe('100%');
    expect(doc.body.classList.contains('booting')).toBe(false);
  });

  it('does not require optional avatar cache warming to finish', () => {
    const { doc, api } = bootRoom();
    for (const stage of stages) if (stage !== 'avatars') api.stage(stage, 1);
    vi.advanceTimersByTime(12_000);
    expect(doc.body.classList.contains('booting')).toBe(false);
  });

  it('keeps a fault visible if loading fails during the final reveal delay', () => {
    const { doc, api, overlay } = bootRoom();
    for (const stage of stages) api.stage(stage, 1);
    for (let tick = 0; tick < 200 && !overlay.classList.contains('done'); tick++) vi.advanceTimersByTime(32);
    expect(overlay.classList.contains('done')).toBe(true);
    api.fail('DESK CONTROLS DID NOT LOAD', 'Reload Chartopia to try again.');
    vi.advanceTimersByTime(1000);
    expect(doc.body.classList.contains('booting')).toBe(true);
    expect(overlay.classList.contains('failed')).toBe(true);
    expect(overlay.classList.contains('off')).toBe(false);
  });

  it('blocks game shortcuts until the room is revealed', () => {
    const { win, api } = bootRoom();
    const shortcut = vi.fn();
    win.addEventListener('keydown', shortcut);
    win.dispatchEvent(new Event('keydown'));
    expect(shortcut).not.toHaveBeenCalled();
    for (const stage of stages) api.stage(stage, 1);
    vi.advanceTimersByTime(5000);
    win.dispatchEvent(new Event('keydown'));
    expect(shortcut).toHaveBeenCalledOnce();
  });
});
