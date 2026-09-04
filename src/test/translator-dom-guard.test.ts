/**
 * The page must survive a browser translating it underneath React.
 *
 * These reproduce what Chrome/Edge/Safari's built-in translate actually does —
 * lift a text node out of its parent into a `<font>` wrapper — and assert that
 * the DOM calls React makes next no longer throw. Before the guard, both threw
 * NotFoundError, which unmounted whatever page the user was on; on /creator
 * that stranded a run a DHB transfer had already paid for.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { guardDomAgainstTranslator, protectVerbatimText } from '@/i18n/translator-dom-guard';

/** What a translator does: swap a text node for a <font> holding it. */
function translate(host: HTMLElement): Text {
  const original = host.firstChild as Text;
  const font = document.createElement('font');
  host.appendChild(font);
  font.appendChild(original); // the node React still has a handle on
  return original;
}

beforeAll(() => {
  guardDomAgainstTranslator();
});

describe('translator DOM guard', () => {
  it('does not throw when React removes a node the translator re-parented', () => {
    const host = document.createElement('div');
    host.textContent = 'Generate video';
    document.body.appendChild(host);

    const stolen = translate(host);
    expect(stolen.parentNode).not.toBe(host);

    // React's unmount path. Unguarded this is NotFoundError.
    expect(() => host.removeChild(stolen)).not.toThrow();
  });

  it('returns the child, as removeChild is contracted to', () => {
    const host = document.createElement('div');
    host.textContent = 'Pay 1890 DHB';
    document.body.appendChild(host);

    const stolen = translate(host);
    expect(host.removeChild(stolen)).toBe(stolen);
  });

  it('does not throw when React inserts before a re-parented anchor', () => {
    const host = document.createElement('div');
    host.textContent = 'Running';
    document.body.appendChild(host);

    const anchor = translate(host);
    const fresh = document.createElement('span');

    expect(() => host.insertBefore(fresh, anchor)).not.toThrow();
    // Appended rather than dropped: the node still has to reach the document.
    expect(fresh.parentNode).toBe(host);
  });

  it('still performs a normal removeChild', () => {
    const host = document.createElement('div');
    const child = document.createElement('span');
    host.appendChild(child);
    document.body.appendChild(host);

    expect(host.removeChild(child)).toBe(child);
    expect(host.contains(child)).toBe(false);
  });

  it('still performs a normal insertBefore, keeping order', () => {
    const host = document.createElement('div');
    const first = document.createElement('i');
    const inserted = document.createElement('b');
    host.appendChild(first);
    document.body.appendChild(host);

    host.insertBefore(inserted, first);
    expect(host.firstChild).toBe(inserted);
    expect(inserted.nextSibling).toBe(first);
  });

  it('is idempotent, so the widget path re-installing it changes nothing', () => {
    const host = document.createElement('div');
    const child = document.createElement('span');
    host.appendChild(child);

    guardDomAgainstTranslator();
    guardDomAgainstTranslator();

    expect(host.removeChild(child)).toBe(child);
  });
});

describe('verbatim protection', () => {
  it('marks addresses and hashes so a translator leaves them alone', async () => {
    const address = document.createElement('span');
    address.className = 'font-mono';
    address.textContent = '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c';
    document.body.appendChild(address);

    protectVerbatimText();
    expect(address.classList.contains('notranslate')).toBe(true);

    // And the ones React mounts after the observer is running.
    const later = document.createElement('code');
    later.textContent = '0x90cb10175053957155436411cefbac6d972cd477';
    document.body.appendChild(later);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(later.classList.contains('notranslate')).toBe(true);
  });
});
