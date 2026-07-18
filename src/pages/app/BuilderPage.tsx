/**
 * DeHub Builder — build live web apps from a prompt, right inside DeHub.
 *
 * Ported from the open-source Rilable builder (github.com/rbrown101010/rilable):
 * describe an app → the AI writes it → DeHub hosts it at a public URL → preview
 * and iterate in a build chat. Part of the Creator system: each generation
 * consumes 1 build from a daily allowance tied to the DHB staking badge tier
 * (see src/lib/builder/allowance.ts; enforced server-side in builder-api).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Blocks,
  Code2,
  ExternalLink,
  Globe,
  Link as LinkIcon,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { AuthGate } from '@/components/app/AuthGate';
import { useAuth } from '@/contexts/AuthContext';
import {
  BUSY_STATUSES,
  builderPreviewUrl,
  createBuilderProject,
  fetchBuilderAllowance,
  getBuilderProject,
  listBuilderProjects,
  removeBuilderProject,
  sendBuilderMessage,
  type BuilderAllowance,
  type BuilderProject,
} from '@/lib/builder/api';

const SUGGESTIONS = [
  'A habit tracker with streaks and confetti',
  'A retro snake game',
  'A pomodoro focus timer with sounds',
  'A tip-split calculator for group dinners',
  'A birthday countdown page with fireworks',
];

function timeAgo(iso: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatusPill({ project }: { project: BuilderProject }) {
  const busy = BUSY_STATUSES.has(project.status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-medium',
        project.status === 'live' && 'bg-emerald-500/15 text-emerald-400',
        project.status === 'error' && 'bg-red-500/15 text-red-400',
        busy && 'bg-amber-500/15 text-amber-400',
      )}
    >
      {busy && <Loader2 className="w-3 h-3 animate-spin" />}
      {project.status === 'live' && <Globe className="w-3 h-3" />}
      {project.status_detail || project.status}
    </span>
  );
}

function AllowanceChip({ allowance }: { allowance: BuilderAllowance | undefined }) {
  if (!allowance) return null;
  const left = Math.max(0, allowance.limit - allowance.used);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-zinc-800/60 text-xs text-zinc-400"
      title={`${allowance.tierName} tier — ${allowance.limit} AI builds per day. Stake DHB to raise your allowance.`}
    >
      <Sparkles className="w-3.5 h-3.5" />
      <span className={cn('font-medium', left === 0 ? 'text-red-400' : 'text-white')}>{left}</span>
      builds left · {allowance.tierName}
    </span>
  );
}

export default function BuilderPage() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [mobilePane, setMobilePane] = useState<'chat' | 'preview'>('chat');
  const [showCode, setShowCode] = useState(false);
  const [codeFile, setCodeFile] = useState<string | null>(null);
  const [iframeNonce, setIframeNonce] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const allowanceQuery = useQuery({
    queryKey: ['builder-allowance'],
    queryFn: async () => (await fetchBuilderAllowance()).allowance,
    enabled: isAuthenticated,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const projectsQuery = useQuery({
    queryKey: ['builder-projects'],
    queryFn: async () => (await listBuilderProjects()).projects,
    enabled: isAuthenticated && !selectedId,
    staleTime: 15_000,
  });

  const projectQuery = useQuery({
    queryKey: ['builder-project', selectedId],
    queryFn: () => getBuilderProject(selectedId!),
    enabled: isAuthenticated && !!selectedId,
    refetchInterval: (query) => {
      const status = query.state.data?.project?.status;
      return status && BUSY_STATUSES.has(status) ? 2500 : false;
    },
  });

  const project = projectQuery.data?.project;
  const messages = projectQuery.data?.messages ?? [];
  const files = projectQuery.data?.files ?? [];
  const busy = !!project && BUSY_STATUSES.has(project.status);

  // Reload the preview when a new version goes live.
  const liveVersion = project?.status === 'live' ? project.version : 0;
  useEffect(() => {
    if (liveVersion > 0) setIframeNonce((n) => n + 1);
  }, [liveVersion]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, busy]);

  const setAllowance = (allowance: BuilderAllowance) =>
    queryClient.setQueryData(['builder-allowance'], allowance);

  const handleCreate = async (text?: string) => {
    const request = (text ?? prompt).trim();
    if (!request || creating) return;
    setCreating(true);
    try {
      const res = await createBuilderProject(request);
      setAllowance(res.allowance);
      setPrompt('');
      setMobilePane('chat');
      setShowCode(false);
      setSelectedId(res.projectId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the build');
    } finally {
      setCreating(false);
    }
  };

  const handleSend = async () => {
    const content = chatInput.trim();
    if (!content || !selectedId || sending || busy) return;
    setSending(true);
    try {
      const res = await sendBuilderMessage(selectedId, content);
      setAllowance(res.allowance);
      setChatInput('');
      await projectQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send that');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? Its public link will stop working.`)) return;
    try {
      await removeBuilderProject(id);
      if (selectedId === id) setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ['builder-projects'] });
      toast.success('App deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the app');
    }
  };

  const previewUrl = useMemo(
    () => (selectedId ? builderPreviewUrl(selectedId, project?.version) : ''),
    [selectedId, project?.version],
  );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(previewUrl);
      toast.success('App link copied — anyone can open it');
    } catch {
      toast.error('Could not copy the link');
    }
  };

  if (!isAuthenticated) {
    return <AuthGate description="Log in to build apps" />;
  }

  return (
    <div className="min-h-screen" data-builder-page>
      <SEOHead
        title="Builder — Build Apps with AI on DeHub"
        description="Describe an app and DeHub Builder creates it live: AI-written, DeHub-hosted mini web apps you can share with anyone."
        url="https://dehub.io/app/builder"
      />

      {/* Sticky header */}
      <div className="sticky top-11 lg:top-0 bg-black z-40 px-2 pt-1 pb-2 sm:px-3 sm:pt-1 sm:pb-3 lg:pt-2">
        <div data-page-bento className="bg-zinc-900 rounded-2xl p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {selectedId && (
                <button
                  onClick={() => {
                    setSelectedId(null);
                    setShowCode(false);
                    queryClient.invalidateQueries({ queryKey: ['builder-projects'] });
                  }}
                  className="p-1.5 rounded-xl text-zinc-400 hover:text-white transition-colors shrink-0"
                  title="All apps"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <h2 className="font-bold text-white flex items-center gap-2 min-w-0">
                <Blocks className="w-6 h-6 shrink-0" />
                {selectedId && project ? (
                  <span className="truncate">
                    {project.emoji} {project.name}
                  </span>
                ) : (
                  'Builder'
                )}
              </h2>
              {selectedId && project && <StatusPill project={project} />}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <AllowanceChip allowance={allowanceQuery.data} />
              {selectedId && (
                <button
                  onClick={() => setSelectedId(null)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/60 hover:bg-zinc-700/60 text-white text-sm font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">New app</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {!selectedId ? (
        /* ── Home: composer + project grid ─────────────────────────── */
        <div className="px-2 sm:px-3 pb-24 max-w-5xl mx-auto">
          <div data-page-bento className="bg-zinc-900 rounded-2xl p-5 sm:p-8 mt-2 text-center">
            <div className="text-4xl mb-3">🛠️</div>
            <h1 className="text-white text-xl sm:text-2xl font-bold">Build something</h1>
            <p className="text-zinc-500 text-sm mt-1 max-w-md mx-auto">
              Describe an app. The AI writes it, DeHub hosts it, and you get a live link to
              share — no code needed.
            </p>
            <div className="mt-5 max-w-xl mx-auto">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
                rows={3}
                placeholder="What do you want to build?"
                className="w-full resize-none rounded-xl bg-zinc-800/60 text-white placeholder:text-zinc-500 p-4 text-sm outline-none focus:ring-2 focus:ring-white/20"
              />
              <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleCreate(s)}
                    disabled={creating}
                    className="px-3 py-1.5 rounded-xl bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 hover:text-white text-xs transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <button
                onClick={() => handleCreate()}
                disabled={creating || !prompt.trim()}
                className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Build it
              </button>
            </div>
          </div>

          {/* Project grid */}
          {projectsQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            </div>
          ) : (projectsQuery.data?.length ?? 0) > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3 mt-3">
              {projectsQuery.data!.map((p) => (
                <div
                  key={p.id}
                  data-page-bento
                  className="bg-zinc-900 rounded-2xl p-4 text-left hover:bg-zinc-800/80 transition-colors cursor-pointer group"
                  onClick={() => {
                    setSelectedId(p.id);
                    setMobilePane('chat');
                    setShowCode(false);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-3xl">{p.emoji}</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(p.id, p.name);
                      }}
                      className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                      title="Delete app"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <h3 className="text-white font-semibold text-sm mt-2 truncate">{p.name}</h3>
                  <p className="text-zinc-500 text-xs mt-0.5 line-clamp-2">{p.prompt}</p>
                  <div className="flex items-center justify-between mt-3">
                    <StatusPill project={p} />
                    <span className="text-zinc-600 text-[11px]">{timeAgo(p.updated_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        /* ── Project: chat + live preview ──────────────────────────── */
        <div className="px-2 sm:px-3 pb-24">
          {/* Mobile pane toggle */}
          <div className="flex lg:hidden gap-1 p-1 rounded-xl bg-zinc-900 mb-2">
            {(['chat', 'preview'] as const).map((pane) => (
              <button
                key={pane}
                onClick={() => setMobilePane(pane)}
                className={cn(
                  'flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors',
                  mobilePane === pane ? 'bg-zinc-700/70 text-white' : 'text-zinc-500',
                )}
              >
                {pane === 'chat' ? <MessageSquare className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                {pane === 'chat' ? 'Chat' : 'Preview'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,2fr)_3fr] gap-2 sm:gap-3">
            {/* Chat panel */}
            <div
              data-page-bento
              className={cn(
                'bg-zinc-900 rounded-2xl flex-col h-[calc(100vh-190px)] lg:h-[calc(100vh-120px)]',
                mobilePane === 'chat' ? 'flex' : 'hidden lg:flex',
              )}
            >
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {projectQuery.isLoading && (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                  </div>
                )}
                {messages.map((m) =>
                  m.role === 'user' ? (
                    <div key={m.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-700/70 text-white text-sm px-3.5 py-2 whitespace-pre-wrap break-words">
                        {m.content}
                      </div>
                    </div>
                  ) : m.role === 'agent' ? (
                    <div key={m.id} className="flex">
                      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-zinc-800/70 text-white text-sm px-3.5 py-2 whitespace-pre-wrap break-words">
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <div key={m.id} className="text-zinc-500 text-xs px-1.5 py-0.5">
                      {m.content}
                    </div>
                  ),
                )}
                {busy && (
                  <div className="flex items-center gap-2 text-zinc-400 text-xs px-1.5 py-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {project?.status_detail || 'Working…'}
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="p-2 border-t border-white/5">
                <div className="flex items-end gap-2">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    rows={1}
                    placeholder={busy ? 'Building…' : 'Describe a change…'}
                    disabled={busy}
                    className="flex-1 resize-none rounded-xl bg-zinc-800/60 text-white placeholder:text-zinc-500 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-50"
                  />
                  <button
                    onClick={handleSend}
                    disabled={busy || sending || !chatInput.trim()}
                    className="p-2.5 rounded-xl bg-white text-black hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    title="Send"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Preview panel */}
            <div
              data-page-bento
              className={cn(
                'bg-zinc-900 rounded-2xl flex-col overflow-hidden h-[calc(100vh-190px)] lg:h-[calc(100vh-120px)]',
                mobilePane === 'preview' ? 'flex' : 'hidden lg:flex',
              )}
            >
              <div className="flex items-center justify-between gap-2 p-2 border-b border-white/5">
                <span className="text-zinc-500 text-xs px-1.5 truncate">
                  {project?.status === 'live' ? 'Live — anyone with the link can open it' : 'Preview'}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowCode((v) => !v)}
                    className={cn(
                      'p-1.5 rounded-lg transition-colors',
                      showCode ? 'text-white bg-zinc-700/70' : 'text-zinc-400 hover:text-white',
                    )}
                    title="View code"
                  >
                    <Code2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setIframeNonce((n) => n + 1)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white transition-colors"
                    title="Reload preview"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={copyLink}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white transition-colors"
                    title="Copy app link"
                  >
                    <LinkIcon className="w-4 h-4" />
                  </button>
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white transition-colors"
                    title="Open in a new tab"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {showCode ? (
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="flex gap-1 p-2 overflow-x-auto scrollbar-hide">
                    {files.map((f) => (
                      <button
                        key={f.path}
                        onClick={() => setCodeFile(f.path)}
                        className={cn(
                          'px-3 py-1 rounded-lg text-xs font-mono whitespace-nowrap transition-colors',
                          (codeFile ?? files[0]?.path) === f.path
                            ? 'bg-zinc-700/70 text-white'
                            : 'text-zinc-500 hover:text-white',
                        )}
                      >
                        {f.path}
                      </button>
                    ))}
                  </div>
                  <pre className="flex-1 min-h-0 overflow-auto text-xs text-zinc-300 bg-black/40 p-3 font-mono leading-relaxed">
                    {files.find((f) => f.path === (codeFile ?? files[0]?.path))?.content ??
                      'No files yet.'}
                  </pre>
                </div>
              ) : project?.status === 'error' && !files.length ? (
                <div className="flex-1 grid place-items-center p-6 text-center">
                  <div>
                    <div className="text-3xl mb-2">😵</div>
                    <p className="text-white text-sm font-medium">The build failed</p>
                    <p className="text-zinc-500 text-xs mt-1 max-w-xs break-words">{project.error}</p>
                    <p className="text-zinc-500 text-xs mt-2">
                      Send a message in the chat to try again.
                    </p>
                  </div>
                </div>
              ) : (
                <iframe
                  key={`${selectedId}-${iframeNonce}`}
                  src={previewUrl}
                  title={project?.name ?? 'App preview'}
                  className="flex-1 w-full bg-white"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
