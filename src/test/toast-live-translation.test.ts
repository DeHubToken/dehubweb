import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shown: { msg: unknown; opts: any }[] = [];
const active = new Set<string | number>();
let next = 0;
const make = () => vi.fn((msg: unknown, opts?: { id?: string | number }) => {
  const id = opts?.id ?? `t${++next}`;
  shown.push({ msg, opts });
  active.add(id);
  return id;
});
vi.mock('sonner', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toast: any = vi.fn();
  for (const m of ['success', 'error', 'info', 'warning', 'loading', 'message']) toast[m] = make();
  toast.getToasts = () => [...active].map((id) => ({ id }));
  return { toast };
});

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));

const lang = { current: 'es' };
vi.mock('@/i18n', () => ({
  default: {
    get language() { return lang.current; },
    exists: (key: string) => key === 'toasts.saved',
    t: () => 'Guardado',
  },
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('error toasts reach the reader in their language', async () => {
  const { toast } = await import('sonner');
  const { needsLiveTranslation } = await import('@/lib/toast-i18n-interceptor');

  beforeEach(() => {
    shown.length = 0;
    active.clear();
    invoke.mockReset();
    lang.current = 'es';
  });

  it('replaces a server error with its translation, in place', async () => {
    invoke.mockResolvedValue({ data: { translatedText: 'Saldo insuficiente' }, error: null });
    const id = toast.error('Insufficient balance for this tip');
    await flush();
    expect(invoke).toHaveBeenCalledWith('translate-text', { body: { text: 'Insufficient balance for this tip', targetLang: 'es' } });
    expect(shown.at(-1)).toEqual({ msg: 'Saldo insuficiente', opts: { id } });
  });

  it('leaves a dismissed toast alone', async () => {
    invoke.mockResolvedValue({ data: { translatedText: 'Fallo de red' }, error: null });
    const id = toast.error('Network request failed badly');
    active.delete(id);
    await flush();
    expect(shown).toHaveLength(1);
  });

  it('does nothing for English readers, static translations or text already in the language', async () => {
    lang.current = 'en';
    toast.error('Insufficient balance for this tip');
    lang.current = 'es';
    toast.error('Saved');
    invoke.mockResolvedValue({ data: { sameLanguage: true }, error: null });
    toast.error('No se pudo guardar el perfil');
    await flush();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(shown).toHaveLength(3);
    expect(shown[1].msg).toBe('Guardado');
  });

  it('skips codes and numbers', () => {
    expect(needsLiveTranslation('500')).toBe(false);
    expect(needsLiveTranslation('E_42')).toBe(false);
    expect(needsLiveTranslation('Could not save')).toBe(true);
  });
});
