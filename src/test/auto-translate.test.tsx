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

const POST = 'The staking programme opens on Monday and rewards are paid weekly.';
const TRANSLATED = 'El programa de staking abre el lunes y las recompensas se pagan semanalmente.';

async function renderTranslatable(text = POST) {
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
    await renderTranslatable();

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(TRANSLATED)).toBeInTheDocument());

    // The regression: the first (and only) request must carry 'es'. It used to
    // carry 'en' — the value the language hook happened to start at.
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('translate-text', { body: { text: POST, targetLang: 'es' } });
  });

  it('leaves the text alone when the post is already in the reader language', async () => {
    invoke.mockResolvedValue({ data: { translatedText: POST, sameLanguage: true }, error: null });
    await renderTranslatable();

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(screen.getByText(POST)).toBeInTheDocument();
  });

  it('does not translate when the call site opts out', async () => {
    const { TranslatableText } = await import('@/components/app/TranslatableText');
    render(<TranslatableText text={POST} as="p" auto={false} />);

    // Give the queue every chance to run.
    await new Promise((r) => setTimeout(r, 50));
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.getByText(POST)).toBeInTheDocument();
  });

  it('sends one request when several components show the same text', async () => {
    const { TranslatableText } = await import('@/components/app/TranslatableText');
    render(
      <>
        <TranslatableText text={POST} as="p" />
        <TranslatableText text={POST} as="p" />
        <TranslatableText text={POST} as="p" />
      </>,
    );

    await waitFor(() => expect(screen.getAllByText(TRANSLATED)).toHaveLength(3));
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('holds every request until the page has loaded', async () => {
    Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
    vi.resetModules();

    await renderTranslatable();
    await new Promise((r) => setTimeout(r, 50));

    // Nothing may go out while the page is still loading — auto-translation is
    // decoration and must not compete with the page it decorates.
    expect(invoke).not.toHaveBeenCalled();

    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
    window.dispatchEvent(new Event('load'));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith('translate-text', { body: { text: POST, targetLang: 'es' } });
  });
});
