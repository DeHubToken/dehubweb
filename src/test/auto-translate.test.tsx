/**
 * Auto-translation: what it asks for, and when.
 *
 * The bug these cover: `useUserLanguage` used to report 'en' on the first
 * render and correct itself in an effect. Auto-translate fired on that first
 * render, so the request went out asking for English — and the corrected
 * request that followed was rejected by a guard that read the in-flight flag
 * off stale render state. The result was that auto-translate did nothing at all
 * for anyone not reading in English, while still spending a round trip per post
 * on screen.
 *
 * Every test translates its OWN text, and that is load-bearing. The component
 * caches translations in memory and mirrors them to localStorage on a
 * coalescing 1s timer. `vi.resetModules()` drops the module but cannot cancel a
 * timer the abandoned copy already scheduled, so that write lands during a
 * LATER test — after its `localStorage.clear()` — and the next fresh import
 * reads it back at module scope. A test sharing text with an earlier one then
 * finds it already translated, sends no request, and fails on a count it should
 * have met. Which test lost depended on how long the ones before it took, which
 * is why this file failed roughly one run in twelve on main and took four
 * commits red with it. Distinct text per test makes a stale entry unable to
 * satisfy anybody.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const invoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

// The i18n bundle load is irrelevant here and pulls in the whole locale stack.
vi.mock('@/i18n', () => ({
  default: { language: 'en', changeLanguage: vi.fn() },
  loadLanguage: vi.fn().mockResolvedValue(true),
}));

/**
 * One post body per test. They only have to differ from each other — the
 * cache is keyed on the exact text — and be long enough in Latin script to
 * clear the short-post guard.
 */
const POSTS = {
  readerLanguage: 'The staking programme opens on Monday and rewards are paid weekly.',
  alreadyInLanguage: 'The governance vote closes on Friday and quorum is already met.',
  optedOut: 'The creator fund pays out on the first of the month, in DHB.',
  poisonedResponse: 'The badge ladder is recalculated nightly from the previous day.',
  sharedByThree: 'The stage recording is ready to watch about a minute after it ends.',
  heldUntilLoaded: 'The referral bonus lands once the invited account posts for the first time.',
};
const TRANSLATED = 'El programa de staking abre el lunes y las recompensas se pagan semanalmente.';

async function renderTranslatable(text: string) {
  const { TranslatableText } = await import('@/components/app/TranslatableText');
  return render(<TranslatableText text={text} as="p" />);
}

beforeEach(() => {
  vi.resetModules();
  invoke.mockReset();
  localStorage.clear();
  localStorage.setItem('user-preferred-language', 'es');
  invoke.mockResolvedValue({ data: { translatedText: TRANSLATED, detectedLanguage: { language: 'en' } }, error: null });
  // jsdom reports 'complete', which is what a real page reaches before any of
  // this is allowed to run. The deferral itself is asserted separately below.
  Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
});

afterEach(cleanup);

describe('auto-translate', () => {
  it("asks for the reader's language, not the default, and asks once", async () => {
    const post = POSTS.readerLanguage;
    await renderTranslatable(post);

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(TRANSLATED)).toBeInTheDocument());

    // The regression: the first (and only) request must carry 'es'. It used to
    // carry 'en' — the value the language hook happened to start at.
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('translate-text', { body: { text: post, targetLang: 'es' } });
  });

  it('leaves the text alone when the post is already in the reader language', async () => {
    const post = POSTS.alreadyInLanguage;
    invoke.mockResolvedValue({ data: { translatedText: post, sameLanguage: true }, error: null });
    await renderTranslatable(post);

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(screen.getByText(post)).toBeInTheDocument();
  });

  it('does not translate when the call site opts out', async () => {
    const { TranslatableText } = await import('@/components/app/TranslatableText');
    render(<TranslatableText text={POSTS.optedOut} as="p" auto={false} />);

    // Give the queue every chance to run.
    await new Promise((r) => setTimeout(r, 50));
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.getByText(POSTS.optedOut)).toBeInTheDocument();
  });

  it('does not auto-translate a short Latin post', async () => {
    await renderTranslatable('nice');

    // Give the queue every chance to run. A word of Latin script cannot be
    // told apart from the reader's own language, so asking is how a post ends
    // up "translated" into junk or into itself.
    await new Promise((r) => setTimeout(r, 50));
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.getByText('nice')).toBeInTheDocument();
  });

  it('still auto-translates a short post in another script', async () => {
    const JAPANESE = 'かわいい';
    invoke.mockResolvedValue({ data: { translatedText: 'cute', detectedLanguage: { language: 'ja' } }, error: null });
    await renderTranslatable(JAPANESE);

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith('translate-text', { body: { text: JAPANESE, targetLang: 'es' } });
  });

  it('discards a response that is an API error message, not a translation', async () => {
    const post = POSTS.poisonedResponse;
    invoke.mockResolvedValue({
      data: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY' },
      error: null,
    });
    await renderTranslatable(post);

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    // The prose must never render and must not be cached for later either —
    // a second mount asks again rather than replaying the poison.
    expect(screen.getByText(post)).toBeInTheDocument();
    // Nothing was cached, so a second mount asks again rather than replaying
    // the poison.
    await renderTranslatable(post);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
  });

  it('sends one request when several components show the same text', async () => {
    const post = POSTS.sharedByThree;
    const { TranslatableText } = await import('@/components/app/TranslatableText');
    render(
      <>
        <TranslatableText text={post} as="p" />
        <TranslatableText text={post} as="p" />
        <TranslatableText text={post} as="p" />
      </>,
    );

    await waitFor(() => expect(screen.getAllByText(TRANSLATED)).toHaveLength(3));
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('holds every request until the page has loaded', async () => {
    const post = POSTS.heldUntilLoaded;
    Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
    vi.resetModules();

    await renderTranslatable(post);
    await new Promise((r) => setTimeout(r, 50));

    // Nothing may go out while the page is still loading — auto-translation is
    // decoration and must not compete with the page it decorates.
    expect(invoke).not.toHaveBeenCalled();

    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
    window.dispatchEvent(new Event('load'));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith('translate-text', { body: { text: post, targetLang: 'es' } });
  });
});
