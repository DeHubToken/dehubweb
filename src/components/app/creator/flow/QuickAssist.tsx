/**
 * Creator Flow — the ⌘K prompt assistant.
 * ========================================
 * Adapted from HeliosGen's QuickAssist (MIT) — see LICENSE-HeliosGen.
 * A small chat that only ever answers with prompts: give it an idea and it
 * hands back a better one, streamed token by token. Works signed out.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, RotateCcw, Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { ASSISTANT_MODELS, DEFAULT_ASSISTANT_MODEL, streamAssistant, type AssistantMessage, type AssistantModelId } from '@/lib/creator/flow/assistant';

interface Message extends AssistantMessage {
  streaming?: boolean;
}

const MODEL_KEY = 'dehub-creator-flow-assistant-model';

function loadModel(): AssistantModelId {
  try {
    const v = localStorage.getItem(MODEL_KEY);
    return ASSISTANT_MODELS.some((m) => m.id === v) ? (v as AssistantModelId) : DEFAULT_ASSISTANT_MODEL;
  } catch {
    return DEFAULT_ASSISTANT_MODEL;
  }
}

export default function QuickAssist({ onUsePrompt }: { onUsePrompt?: (text: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [model, setModel] = useState<AssistantModelId>(loadModel);
  const [modelOpen, setModelOpen] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        setModelOpen(false);
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-model-picker]')) setModelOpen(false);
      if (open && containerRef.current && !containerRef.current.contains(target)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  function reset() {
    abortRef.current?.abort();
    setMessages([]);
    setInput('');
    setStreaming(false);
  }

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      const next: Message[] = [...messages, { role: 'user', content: trimmed }];
      setMessages([...next, { role: 'assistant', content: '', streaming: true }]);
      setInput('');
      setStreaming(true);
      const idx = next.length;
      const abort = new AbortController();
      abortRef.current = abort;
      try {
        await streamAssistant({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          persona: 'craft',
          model,
          signal: abort.signal,
          onDelta: (_d, acc) => setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, content: acc } : m))),
        });
        setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, streaming: false } : m)));
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          const message = err instanceof Error ? err.message : t('creatorFlow.assistantFailed');
          setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, content: message, streaming: false } : m)));
        }
      } finally {
        setStreaming(false);
      }
    },
    [messages, streaming, model, t],
  );

  const isEmpty = messages.length === 0;
  const canSend = !!input.trim() && !streaming;

  return (
    <div ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-4 right-5 z-[1000] flex h-10 items-center gap-2 rounded-full border border-white/15 bg-zinc-950/90 pl-3 pr-4 text-[13px] font-medium text-white/90 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl transition hover:border-white/30 hover:bg-white/10"
        aria-expanded={open}
      >
        <Sparkles size={14} />
        <span>{t('creatorFlow.assistant')}</span>
        <kbd className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">⌘K</kbd>
      </button>

      {open && (
        <div
          className="cflow-fade-up fixed bottom-16 right-5 z-[1001] flex max-h-[600px] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-[0_32px_80px_rgba(0,0,0,0.7)] backdrop-blur-2xl"
          role="dialog"
          aria-label={t('creatorFlow.assistant')}
        >
          <div className="flex shrink-0 items-center border-b border-white/10 px-4 py-3">
            <Sparkles size={14} className="text-white" />
            <span className="ml-2 text-[14px] font-semibold text-white">{t('creatorFlow.assistant')}</span>
            <div className="ml-auto flex items-center gap-2">
              {!isEmpty && (
                <button type="button" onClick={reset} title={t('creatorFlow.newChat')} aria-label={t('creatorFlow.newChat')} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-white/50 transition hover:bg-white/10 hover:text-white">
                  <RotateCcw size={13} />
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} aria-label={t('creatorFlow.close')} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-white/50 transition hover:bg-white/10 hover:text-white">
                <X size={13} />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className={cn('flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto', isEmpty ? 'px-6 pb-4 pt-8' : 'p-4')}>
            {isEmpty ? (
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
                  <Sparkles size={20} className="text-white" />
                </div>
                <p className="text-[15px] font-semibold text-white">{t('creatorFlow.assistantEmptyTitle')}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/45">{t('creatorFlow.assistantEmptyHint')}</p>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={cn('flex flex-col', m.role === 'user' ? 'items-end' : 'items-start')}>
                  <div
                    className={cn(
                      'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl border px-3 py-2 text-[13px] leading-relaxed',
                      m.role === 'user' ? 'rounded-br-md border-white/25 bg-white/15 text-white' : 'rounded-bl-md border-white/10 bg-white/5 text-zinc-100',
                    )}
                  >
                    {m.content}
                    {m.streaming && (
                      m.content ? (
                        <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-white/70 align-text-bottom" />
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          {[0, 1, 2].map((d) => (
                            <span key={d} className="h-1 w-1 animate-pulse rounded-full bg-white/50" style={{ animationDelay: `${d * 0.2}s` }} />
                          ))}
                        </span>
                      )
                    )}
                  </div>
                  {m.role === 'assistant' && !m.streaming && m.content && onUsePrompt && (
                    <button
                      type="button"
                      onClick={() => onUsePrompt(m.content)}
                      className="mt-1 rounded-full border border-white/15 px-2 py-0.5 text-[10.5px] font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
                    >
                      {t('creatorFlow.useAsTextNode')}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="shrink-0 border-t border-white/10 p-3">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 py-2 pl-3 pr-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
                }}
                placeholder={t('creatorFlow.assistantPlaceholder')}
                rows={1}
                disabled={streaming}
                className="max-h-24 flex-1 resize-none bg-transparent text-[13.5px] leading-[22px] text-white outline-none placeholder:text-white/30"
              />
              <button
                type="button"
                onClick={() => void send(input)}
                disabled={!canSend}
                aria-label={t('creatorFlow.send')}
                className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition', canSend ? 'bg-white text-black' : 'bg-white/10 text-white/30')}
              >
                <ArrowRight size={14} strokeWidth={2.5} />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between px-0.5">
              <div data-model-picker="" className="relative">
                <button
                  type="button"
                  onClick={() => setModelOpen((o) => !o)}
                  className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/40 transition hover:bg-white/10 hover:text-white/70"
                >
                  {ASSISTANT_MODELS.find((m) => m.id === model)?.label}
                  <span aria-hidden>▴</span>
                </button>
                {modelOpen && (
                  <div className="cflow-fade-up absolute bottom-full left-0 mb-1.5 min-w-[190px] rounded-xl border border-white/10 bg-zinc-950/95 p-1 shadow-xl backdrop-blur-xl">
                    {ASSISTANT_MODELS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setModel(m.id);
                          try {
                            localStorage.setItem(MODEL_KEY, m.id);
                          } catch {
                            /* ignore */
                          }
                          setModelOpen(false);
                        }}
                        className={cn('flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[13px] transition', model === m.id ? 'bg-white/15 text-white' : 'text-zinc-300 hover:bg-white/10')}
                      >
                        <span>{m.label}</span>
                        <span className="ml-3 text-[10px] text-zinc-500">{t(m.descKey)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="flex items-center gap-2 text-[10px] tracking-wide text-white/25">
                <kbd className="rounded border border-white/10 bg-white/5 px-1 text-white/40">↵</kbd> {t('creatorFlow.send')}
                <span>·</span>
                <kbd className="rounded border border-white/10 bg-white/5 px-1 text-white/40">ESC</kbd> {t('creatorFlow.close')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
