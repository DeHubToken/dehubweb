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
import { applyOps, askAgent, askSceneAgent, type AgentMessage } from '@/lib/editor/agent';
import { highlightChatRequest, highlightVisualScope, type HighlightChatResult } from '@/lib/editor/highlightChat';
import { useHighlightChat } from '@/lib/editor/useHighlightChat';
import { getMedia } from '@/lib/editor/mediaStore';
import { processVisualFrames } from '@/lib/editor/processVisualFrames';
import { analyseVisualHighlights } from '@/lib/editor/visualHighlightApi';
import { transcribeClipWords } from '@/lib/editor/captions';
import { createHighlightEdit } from '@/lib/editor/applyHighlights';
import { shotTime } from '@/lib/editor/shots';
import { assemblyRequest } from '@/lib/editor/assembly';
import { useAssembly } from '@/lib/editor/useAssembly';
import { createAssemblyEdit } from '@/lib/editor/applyAssembly';
import AssemblyReview from '../AssemblyReview';
import AssemblyMediaPreview from '../AssemblyMediaPreview';
import type { MediaClip } from '@/lib/editor/types';

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
  const [visualConsent, setVisualConsent] = useState<string | null>(null);
  const visualScope = useEditorStore(s => highlightVisualScope(s.toSnapshot(), s.selectedClipIds));
  const useVisual = visualConsent === visualScope;
  useEffect(() => { setVisualConsent(null); }, [visualScope]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const previewEnd = useRef<number | null>(null);
  const [highlightState, highlights] = useHighlightChat({
    current: () => useEditorStore.getState().toSnapshot(),
    plan: askSceneAgent,
    visual: {
      sample: async (clip, windows, signal, progress) => {
        useEditorStore.getState().setIsPlaying(false);
        const stored = await getMedia(clip.mediaId);
        if (!stored) throw new Error('media unavailable');
        return processVisualFrames(stored.blob, clip, windows, signal, progress);
      },
      analyse: analyseVisualHighlights,
    },
    transcribe: async (clip, progress, signal) => {
      const media = useEditorStore.getState().media.find(m => m.id === clip.mediaId);
      if (!media) throw new Error('media unavailable');
      useEditorStore.getState().setIsPlaying(false);
      return transcribeClipWords(clip, media.url, p => progress(p.stage === 'download' ? 'download' : 'transcribe', p.stage === 'download' ? p.loaded / Math.max(1, p.total) : p.done / Math.max(1, p.total)), signal);
    },
    create: (original, clipId, ranges, signal) => createHighlightEdit(original, clipId, ranges, t('editor.highlights.projectTitle', { title: original.title }), signal),
  });
  const [libraryPreview, setLibraryPreview] = useState<MediaClip | null>(null);
  const [assemblyState, assembly] = useAssembly({
    current: () => useEditorStore.getState().toSnapshot(),
    library: () => useEditorStore.getState().media.filter(media => !!media.url),
    create: (original, plan, signal, library) => createAssemblyEdit(original, plan, `${original.title} — ${t('editor.video.video')}`, signal, library),
  });
  const assemblyChanged = useEditorStore(s => assemblyState.sourceId !== null && !assembly.matchesSource(s.toSnapshot()));
  const assemblyMedia = useEditorStore(s => s.media);
  const closeAssembly = () => { setLibraryPreview(null); previewEnd.current = null; useEditorStore.getState().setIsPlaying(false); assembly.reset(); };
  useEffect(() => { if (assemblyChanged || !assemblyState.sourceId) setLibraryPreview(null); }, [assemblyChanged, assemblyState.sourceId]);
  const sourceChanged = useEditorStore(s => highlightState.clipId !== null && !highlights.matchesSource(s.toSnapshot()));
  const working = busy || highlightState.busy || assemblyState.busy;
  const recordHighlights = useCallback((result: HighlightChatResult) => {
    if (result.status === 'cancelled') return;
    const errors = { selectVideo: 'editor.highlights.chatSelectVideo', changed: 'editor.highlights.changed', limit: 'editor.highlights.chatLimit', captionsMissing: 'editor.highlights.chatCaptionsMissing', failed: 'editor.highlights.reviewFailed' };
    const content = result.status === 'error' ? t(errors[result.error]) : result.status === 'created' ? t('editor.highlights.created') : result.status === 'reviewed' ? t('editor.highlights.reviewResult', result) : result.count ? t('editor.highlights.chatFound', result) : t(highlights.state.visual ? 'follow.noResults' : 'editor.highlights.none');
    push({ id: nextId(), role: 'assistant', content, error: result.status === 'error' });
  }, [highlights, push, t]);
  const closeHighlights = () => { previewEnd.current = null; useEditorStore.getState().setIsPlaying(false); highlights.reset(); };
  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe(state => {
      if (previewEnd.current !== null && state.currentTime >= previewEnd.current) {
        const end = previewEnd.current; previewEnd.current = null;
        state.setIsPlaying(false); state.setCurrentTime(end);
      }
    });
    return () => { unsubscribe(); if (previewEnd.current !== null) useEditorStore.getState().setIsPlaying(false); previewEnd.current = null; };
  }, []);

  const suggestions = [
    t('editor.agent.suggestPoster'),
    t('editor.agent.suggestTitle'),
    t('editor.agent.suggestFilter'),
    t('editor.agent.suggestStory'),
    t('editor.agent.suggestBackground'),
    t('editor.highlights.chatSuggest'),
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
    if (!prompt || busy || highlights.state.busy || assembly.state.busy) return;
    setDraft('');
    push({ id: nextId(), role: 'user', content: prompt });
    const draftRequest = assemblyRequest(prompt);
    if (draftRequest || assembly.state.sourceId) {
      previewEnd.current = null; useEditorStore.getState().setIsPlaying(false);
      if (draftRequest) { highlights.reset(); assembly.start(draftRequest, useEditorStore.getState().selectedClipIds, useEditorStore.getState().media.filter(media => !!media.url)); }
      const reviewed = draftRequest || assembly.review(prompt);
      push({ id: nextId(), role: 'assistant', content: t(reviewed ? 'easyTrade.reviewTitle' : 'editor.agent.nothingToDo') });
      inputRef.current?.focus(); return;
    }
    const request = highlightChatRequest(prompt);
    if (request || highlights.reviewing) {
      previewEnd.current = null; useEditorStore.getState().setIsPlaying(false);
      recordHighlights(request ? await highlights.start({ ...request, useVisual, visualScope, focus: request.focus || (useVisual ? prompt.slice(0, 240) : "") }, useEditorStore.getState().selectedClipIds) : await highlights.review(prompt));
      inputRef.current?.focus();
      return;
    }
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
      if (!ops.length) content = t('editor.agent.nothingToDo');
      if (report?.generate && !report.applied && !reply) content = t('editor.agent.openGenerator');
      if (report?.failed) content = `${report.applied ? t('editor.agent.done') + ' ' : ''}${t('editor.agent.failed')}`;
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
  }, [useVisual, visualScope, busy, highlightState.busy, assemblyState.busy, assembly, highlights, recordHighlights, push, setBusy, quota.walletAddress, t]);

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
            onOpenGenerator={() => {
              if (!e.report?.generate) return;
              useEditorUiStore.getState().setGeneratePrefill(e.report.generate);
              setPanel('generate');
            }}
          />
        ))}

        {highlightState.clipId && <section aria-label={t('editor.highlights.reviewTitle')} className="space-y-2 rounded-xl border border-white/15 p-2.5">
          <p className="text-xs font-medium text-white">{t('editor.highlights.reviewTitle')}</p>
          <p className="text-[11px] text-white/60">{t('editor.highlights.chatHint')}</p>
          {sourceChanged && <p className="text-[11px] text-white/70">{t('editor.highlights.changed')}</p>}
          {highlightState.progress && <p role="status" className="text-[11px] text-white/60">{t(highlightState.progress.stage === 'download' ? 'editor.captions.downloading' : highlightState.progress.stage === 'transcribe' ? 'editor.captions.working' : highlightState.progress.stage === 'create' ? 'common.loading' : 'editor.highlights.ranking', { percent: Math.round(highlightState.progress.fraction * 100) })}</p>}
          {highlightState.ranges?.map((range, i) => <div key={`${range.start}-${range.end}`} className="space-y-1 border-t border-white/10 pt-2">
            <label className="flex items-center gap-2 text-[11px] text-white"><input type="checkbox" aria-label={`${i + 1}: ${shotTime(range.start)}–${shotTime(range.end)}`} checked={highlightState.chosen.includes(i)} disabled={working || sourceChanged} onChange={() => highlights.toggle(i)} />{i + 1}. {shotTime(range.start)}–{shotTime(range.end)}</label>
            <p className="line-clamp-3 text-[11px] text-white/60">{range.text}</p>
            <button type="button" disabled={working || sourceChanged} className="text-[11px] text-white/70 disabled:opacity-40" onClick={() => { const preview = highlights.preview(i); if (!preview) return; const s = useEditorStore.getState(); previewEnd.current = preview.end; s.setCurrentTime(preview.start); s.setIsPlaying(true); }}>{t('editor.shots.preview')}</button>
          </div>)}
          <div className="flex flex-wrap gap-2">
            {highlightState.undo && <button type="button" disabled={working || sourceChanged} onClick={() => highlights.undo()} className="rounded border border-white/15 px-2 py-1 text-[11px] text-white/70 disabled:opacity-40">{t('editor.highlights.undoSelection')}</button>}
            {!!highlightState.ranges?.length && <button type="button" disabled={working || sourceChanged || !highlightState.chosen.length} onClick={() => { previewEnd.current = null; useEditorStore.getState().setIsPlaying(false); void highlights.create().then(recordHighlights); }} className="rounded bg-white px-2 py-1 text-[11px] text-black disabled:opacity-40">{t('editor.highlights.create')} ({highlightState.chosen.length})</button>}
            <button type="button" onClick={closeHighlights} className="rounded border border-white/15 px-2 py-1 text-[11px] text-white/70">{t(highlightState.busy ? 'common.cancel' : 'editor.highlights.chatExit')}</button>
          </div>
        </section>}

        <AssemblyMediaPreview clip={libraryPreview} onClose={() => setLibraryPreview(null)} />
        <AssemblyReview state={assemblyState} session={assembly} changed={assemblyChanged} names={Object.fromEntries(assemblyMedia.map(m => [m.id, m.name]))}
          onPreview={index => { const range = assembly.preview(index); if (!range) return; if (range.libraryClip) { setLibraryPreview(range.libraryClip); return; } previewEnd.current = range.end; useEditorStore.getState().selectClip(range.id); useEditorStore.getState().setCurrentTime(range.start); useEditorStore.getState().setIsPlaying(true); }}
          onCreate={() => { previewEnd.current = null; useEditorStore.getState().setIsPlaying(false); void assembly.create().then(saved => { if (saved) push({ id: nextId(), role: 'assistant', content: t('common.done') }); }); }} onClose={closeAssembly} />
        {working && (
          <div className="flex items-center gap-2 px-1 text-[11px] text-white/50">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('editor.agent.working')}
          </div>
        )}
      </div>

      <form
        className="shrink-0 border-t border-white/10 p-2"
        onSubmit={(e) => { e.preventDefault(); void send(draft); }}
      >
        {!highlights.reviewing && !assemblyState.sourceId && <fieldset className="mb-2 space-y-1 px-1" disabled={working}>
          <legend className="text-[10px] text-white/50">{t('editor.highlights.title')}</legend>
          <label className="flex items-center gap-2 text-[11px] text-white/75"><input type="checkbox" checked={useVisual} onChange={event => setVisualConsent(event.target.checked ? visualScope : null)} />{t('editor.highlights.visual')}</label>
          {useVisual && <p className="text-[10px] leading-relaxed text-white/50">{t('editor.highlights.visualPrivacy')}</p>}
        </fieldset>}
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
            placeholder={t(highlights.reviewing ? 'editor.highlights.reviewPlaceholder' : 'editor.agent.placeholder')}
            aria-label={t(highlights.reviewing ? 'editor.highlights.reviewPlaceholder' : 'editor.agent.placeholder')}
            maxLength={highlights.reviewing ? 800 : undefined}
            className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent px-1.5 py-1 text-[12px] text-white placeholder:text-white/35 focus:outline-none"
          />
          <button
            type="submit"
            disabled={working || !draft.trim()}
            aria-label={t('editor.agent.send')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-black transition disabled:opacity-30"
          >
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
        <div className="mt-1 flex items-center justify-between px-1 text-[10px] text-white/35">
          <span>{t('editor.agent.hint')}</span>
          {entries.length > 0 && (
            <button type="button" onClick={() => { closeHighlights(); closeAssembly(); setVisualConsent(null); clear(); }} className="flex items-center gap-1 hover:text-white/70">
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
