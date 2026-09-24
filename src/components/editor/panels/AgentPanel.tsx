/**
 * AI panel — describe the edit, the agent does it.
 *
 * The request goes to the editor-agent edge function with a text summary of
 * the page; the operations that come back are applied here as one undo step.
 * Paid generation is never started from chat: the agent pre-fills the Generate
 * panel and the user confirms there.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, Loader2, RotateCcw, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/editorStore';
import { useEditorUiStore } from '@/store/editorUiStore';
import { useEditorAgentStore, type AgentChatEntry } from '@/store/editorAgentStore';
import { useEditorQuota } from '@/hooks/use-editor-quota';
import { applyOps, askAgent, type AgentMessage } from '@/lib/editor/agent';

let entrySeq = 0;
const nextId = () => `a${Date.now().toString(36)}${(entrySeq++).toString(36)}`;

export function AgentPanel() {
  const { t } = useTranslation();
  const entries = useEditorAgentStore((s) => s.entries);
  const busy = useEditorAgentStore((s) => s.busy);
  const push = useEditorAgentStore((s) => s.push);
  const setBusy = useEditorAgentStore((s) => s.setBusy);
  const clear = useEditorAgentStore((s) => s.clear);
  const undo = useEditorStore((s) => s.undo);
  const setPanel = useEditorUiStore((s) => s.setPanel);
  const quota = useEditorQuota();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const suggestions = [
    t('editor.agent.suggestPoster'),
    t('editor.agent.suggestTitle'),
    t('editor.agent.suggestFilter'),
    t('editor.agent.suggestStory'),
    t('editor.agent.suggestBackground'),
  ];

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries.length, busy]);

  // Ctrl/Cmd+K (ShortcutsLayer) opens this panel and asks for focus.
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener('editor:focus-agent', focus);
    focus();
    return () => window.removeEventListener('editor:focus-agent', focus);
  }, []);

  const send = useCallback(async (text: string) => {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setDraft('');
    push({ id: nextId(), role: 'user', content: prompt });
    setBusy(true);
    try {
      const history: AgentMessage[] = [
        ...useEditorAgentStore.getState().entries
          .filter((e) => !e.error)
          .map(({ role, content }) => ({ role, content })),
      ];
      const { reply, ops } = await askAgent(history);
      const report = ops.length ? await applyOps(ops, { wallet: quota.walletAddress }) : undefined;
      let content = reply || (ops.length ? t('editor.agent.done') : t('editor.agent.nothingToDo'));
      if (report?.missingStock.length) {
        content += ` ${t('editor.agent.noStock', { query: report.missingStock.join(', ') })}`;
      }
      push({ id: nextId(), role: 'assistant', content, report });
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      push({
        id: nextId(),
        role: 'assistant',
        error: true,
        content: code === 'rate_limited' ? t('editor.agent.rateLimited') : t('editor.agent.failed'),
      });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }, [busy, push, setBusy, quota.walletAddress, t]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={logRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {entries.length === 0 && (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-white">
                <Sparkles className="h-3.5 w-3.5" /> {t('editor.agent.introTitle')}
              </div>
              <p className="text-[11px] leading-relaxed text-white/60">{t('editor.agent.introBody')}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-lg border border-white/10 px-2.5 py-2 text-left text-[11px] text-white/75 transition hover:bg-white/5 hover:text-white"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {entries.map((e) => (
          <ChatBubble
            key={e.id}
            entry={e}
            onUndo={undo}
            onOpenGenerator={() => setPanel('generate')}
          />
        ))}

        {busy && (
          <div className="flex items-center gap-2 px-1 text-[11px] text-white/50">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('editor.agent.working')}
          </div>
        )}
      </div>

      <form
        className="shrink-0 border-t border-white/10 p-2"
        onSubmit={(e) => { e.preventDefault(); void send(draft); }}
      >
        <div className="flex items-end gap-1.5 rounded-xl border border-white/15 bg-white/[0.04] p-1.5 focus-within:border-white/30">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(draft);
              }
            }}
            rows={2}
            placeholder={t('editor.agent.placeholder')}
            aria-label={t('editor.agent.placeholder')}
            className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent px-1.5 py-1 text-[12px] text-white placeholder:text-white/35 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label={t('editor.agent.send')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-black transition disabled:opacity-30"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
        <div className="mt-1 flex items-center justify-between px-1 text-[10px] text-white/35">
          <span>{t('editor.agent.hint')}</span>
          {entries.length > 0 && (
            <button type="button" onClick={clear} className="flex items-center gap-1 hover:text-white/70">
              <Trash2 className="h-3 w-3" /> {t('editor.agent.clear')}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function ChatBubble({
  entry,
  onUndo,
  onOpenGenerator,
}: {
  entry: AgentChatEntry;
  onUndo: () => void;
  onOpenGenerator: () => void;
}) {
  const { t } = useTranslation();
  const mine = entry.role === 'user';
  const r = entry.report;
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[92%] rounded-xl px-2.5 py-2 text-[12px] leading-relaxed',
          mine ? 'bg-white text-black' : 'border border-white/10 bg-white/[0.04] text-white/85',
          entry.error && 'border-red-400/30 text-red-200',
        )}
      >
        <p className="whitespace-pre-wrap">{entry.content}</p>
        {r && (r.applied > 0 || r.generate) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {r.applied > 0 && (
              <>
                <span className="text-[10px] text-white/45">{t('editor.agent.changes', { count: r.applied })}</span>
                <button
                  type="button"
                  onClick={onUndo}
                  className="flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <RotateCcw className="h-3 w-3" /> {t('editor.agent.undo')}
                </button>
              </>
            )}
            {r.generate && (
              <button
                type="button"
                onClick={onOpenGenerator}
                className="flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-black"
              >
                <Wand2 className="h-3 w-3" /> {t('editor.agent.openGenerator')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
