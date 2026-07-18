/**
 * DeHub Builder — a faithful port of the Rilable app-builder UI
 * (github.com/rbrown101010/rilable, MIT) rebuilt as a DeHub surface.
 *
 * Four screens, same as the iPhone app: HOME (bloom gradient, greeting,
 * platform toggle, big composer), the YOUR-BUILDS drawer (glossy spheres +
 * status dots), CHAT (build cards with Details/Preview, suggestion chips),
 * and PREVIEW (full-screen app with floating controls). Full-page surface —
 * the app shell slides away via SurfaceTransition, like /docs.
 *
 * Always dark by design (like the fork), so every color is an arbitrary-value
 * class the light-theme remap never touches.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  ArrowRight,
  ArrowUp,
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Copy,
  FileText,
  Globe,
  House,
  Link as LinkIcon,
  Loader2,
  Menu,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Share,
  Smartphone,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { AuthGate } from '@/components/app/AuthGate';
import { useAuth } from '@/contexts/AuthContext';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import dehubIcon from '@/assets/dehub-logo-compact.png';
import {
  BUSY_STATUSES,
  builderShareUrl,
  createBuilderProject,
  fetchBuilderAllowance,
  getBuilderProject,
  listBuilderProjects,
  removeBuilderProject,
  sendBuilderMessage,
  type BuilderAllowance,
  type BuilderMessage,
  type BuilderModel,
  type BuilderProject,
} from '@/lib/builder/api';
import { loadBuilderAppHtml, BUILDER_IFRAME_SANDBOX } from '@/lib/builder/render';

// ---------------------------------------------------------------------------
// Rilable theme, translated (Theme.swift → hex)
// ---------------------------------------------------------------------------

const SURFACE = 'bg-[#1c1c1e]';
const SURFACE_LIGHT = 'bg-[#2c2c2e]';
const TEXT_DIM = 'text-[#949499]';
const STROKE = 'border-[rgba(255,255,255,0.09)]';

/** The Lovable home-screen bloom: black melting into blue, pink, then orange. */
const BLOOM_BG: React.CSSProperties = {
  background: [
    'radial-gradient(90% 30% at 50% 102%, rgba(255,107,33,0.9), transparent 72%)',
    'radial-gradient(130% 44% at 50% 90%, rgba(240,59,143,0.62), transparent 70%)',
    'radial-gradient(160% 64% at 50% 63%, rgba(28,77,250,0.52), transparent 74%)',
    '#000',
  ].join(','),
};

/** Glossy drawer spheres — palette sampled from the fork's screenshots. */
const SPHERES: Array<[string, string]> = [
  ['#d9f36f', '#78ad18'],
  ['#7ef07a', '#1fae41'],
  ['#72dff8', '#1c8bd8'],
  ['#f87ad2', '#d3189b'],
  ['#8e7bf8', '#4526d8'],
  ['#78f8c8', '#18ae8b'],
  ['#f8b478', '#d86a18'],
];

function sphereStyle(id: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const [light, dark] = SPHERES[hash % SPHERES.length];
  return {
    background: [
      'radial-gradient(circle at 32% 26%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 30%)',
      `radial-gradient(circle at 40% 35%, ${light} 0%, ${dark} 78%)`,
    ].join(','),
    boxShadow: `0 6px 18px -6px ${dark}aa`,
  };
}

function statusMeta(p: BuilderProject): { label: string; dot: string; pulse?: boolean } {
  if (BUSY_STATUSES.has(p.status)) return { label: 'Working…', dot: '#ffb34d', pulse: true };
  if (p.status === 'error') return { label: 'Failed', dot: '#f56161' };
  return { label: 'Live', dot: '#4ad98c' };
}

const MODEL_LABELS: Record<BuilderModel, string> = { best: 'DeHub Pro', fast: 'DeHub Fast' };

const CHIPS = ['Polish the design', 'Implement search', 'Add more features'];

type View = 'home' | 'chat' | 'preview';

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

function CircleButton({
  onClick,
  title,
  children,
  className,
  disabled,
}: {
  onClick?: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        'w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95',
        'bg-[rgba(255,255,255,0.08)] text-[#fff] hover:bg-[rgba(255,255,255,0.14)]',
        disabled && 'opacity-35 pointer-events-none',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Composer used on both home and chat — the fork's rounded card with +, model menu and send. */
function Composer({
  value,
  onChange,
  onSend,
  placeholder,
  disabled,
  sending,
  model,
  onModel,
  autoFocus,
  big,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  placeholder: string;
  disabled?: boolean;
  sending?: boolean;
  model: BuilderModel;
  onModel: (m: BuilderModel) => void;
  autoFocus?: boolean;
  big?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className={cn('rounded-[28px] border backdrop-blur-xl p-4', 'bg-[rgba(20,20,22,0.88)]', STROKE)}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        rows={big ? 2 : 1}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className={cn(
          'w-full bg-transparent resize-none outline-none text-[#fff] placeholder:text-[#7a7a80]',
          big ? 'text-[17px] min-h-[56px]' : 'text-[16px]',
          disabled && 'opacity-50',
        )}
      />
      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={() => onChange('')}
          title="Clear"
          className="w-9 h-9 rounded-full bg-[rgba(255,255,255,0.08)] text-[#fff] flex items-center justify-center hover:bg-[rgba(255,255,255,0.14)] transition-colors"
        >
          <Plus className="w-5 h-5" />
        </button>
        <div className="flex-1 flex justify-center relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[16px] font-medium text-[#e8e8ea] px-3 py-1.5 rounded-full hover:bg-[rgba(255,255,255,0.06)] transition-colors"
          >
            {MODEL_LABELS[model]}
            <ChevronDown className="w-4 h-4 text-[#949499]" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className={cn('absolute bottom-full mb-2 z-50 rounded-2xl border p-1.5 min-w-[190px]', 'bg-[#1c1c1e]', STROKE)}>
                {(Object.keys(MODEL_LABELS) as BuilderModel[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => {
                      onModel(key);
                      setMenuOpen(false);
                    }}
                    className={cn(
                      'w-full text-left px-3.5 py-2.5 rounded-xl text-[15px] font-medium transition-colors',
                      key === model ? 'bg-[rgba(255,255,255,0.1)] text-[#fff]' : 'text-[#c9c9ce] hover:bg-[rgba(255,255,255,0.05)]',
                    )}
                  >
                    {MODEL_LABELS[key]}
                    <span className={cn('block text-[12px] font-normal', TEXT_DIM)}>
                      {key === 'best' ? 'Smartest builds' : 'Quick edits'}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button
          onClick={onSend}
          disabled={disabled || sending || !value.trim()}
          title="Send"
          className={cn(
            'w-11 h-11 rounded-full bg-[#fff] text-[#000] flex items-center justify-center transition-all active:scale-95',
            (disabled || sending || !value.trim()) && 'opacity-35',
          )}
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowUp className="w-5 h-5" strokeWidth={2.5} />}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BuilderPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth() as {
    isAuthenticated: boolean;
    user: { username?: string | null; displayName?: string | null } | null;
  };

  const [view, setView] = useState<View>('home');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [iframeNonce, setIframeNonce] = useState(0);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [msgMenuOpen, setMsgMenuOpen] = useState<string | null>(null);
  const [model, setModelState] = useState<BuilderModel>(() =>
    localStorage.getItem('dehub_builder_model') === 'fast' ? 'fast' : 'best',
  );
  const chatEndRef = useRef<HTMLDivElement>(null);

  const setModel = (m: BuilderModel) => {
    setModelState(m);
    localStorage.setItem('dehub_builder_model', m);
  };

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
    enabled: isAuthenticated,
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
  const live = project?.status === 'live';

  const shareUrl = useMemo(() => (selectedId ? builderShareUrl(selectedId) : ''), [selectedId]);

  // The generated app renders from a sandboxed srcdoc (Supabase serves the raw
  // file as text/plain, so a direct src never renders). Fetch + wrap on load and
  // whenever a new version ships.
  const [appSrcDoc, setAppSrcDoc] = useState<string | null>(null);
  const [appLoadError, setAppLoadError] = useState(false);
  const liveVersion = live ? project!.version : 0;
  useEffect(() => {
    if (!selectedId || liveVersion <= 0) {
      setAppSrcDoc(null);
      return;
    }
    let cancelled = false;
    setAppLoadError(false);
    loadBuilderAppHtml(selectedId, liveVersion)
      .then((html) => !cancelled && setAppSrcDoc(html))
      .catch(() => !cancelled && setAppLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [selectedId, liveVersion, iframeNonce]);

  // Refresh the drawer list when a new version goes live.
  useEffect(() => {
    if (liveVersion > 0) queryClient.invalidateQueries({ queryKey: ['builder-projects'] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveVersion]);

  useEffect(() => {
    if (view === 'chat') chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, busy, view]);

  const setAllowance = (allowance: BuilderAllowance) =>
    queryClient.setQueryData(['builder-allowance'], allowance);

  const openProject = useCallback((id: string) => {
    setSelectedId(id);
    setView('chat');
    setDrawerOpen(false);
    setDetailsOpen(false);
    setChatInput('');
  }, []);

  const handleCreate = async () => {
    const request = prompt.trim();
    if (!request || creating) return;
    setCreating(true);
    try {
      const res = await createBuilderProject(request, model);
      setAllowance(res.allowance);
      setPrompt('');
      queryClient.invalidateQueries({ queryKey: ['builder-projects'] });
      openProject(res.projectId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the build');
    } finally {
      setCreating(false);
    }
  };

  const sendToProject = async (content: string) => {
    if (!content.trim() || !selectedId || sending || busy) return;
    setSending(true);
    try {
      const res = await sendBuilderMessage(selectedId, content.trim(), model);
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
      queryClient.invalidateQueries({ queryKey: ['builder-projects'] });
      if (selectedId === id) {
        setSelectedId(null);
        setView('home');
      }
      toast.success('Build deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the build');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('App link copied — anyone can open it');
    } catch {
      toast.error('Could not copy the link');
    }
  };

  const shareLink = async () => {
    if (navigator.share && project) {
      try {
        await navigator.share({ title: project.name, url: shareUrl });
        return;
      } catch {
        /* fall through to copy */
      }
    }
    copyLink();
  };

  const openInTab = () => window.open(shareUrl, '_blank', 'noopener');

  const firstName = (user?.displayName || user?.username || 'legend').replace(/^@/, '').split(' ')[0];
  const allowance = allowanceQuery.data;
  const buildsLeft = allowance ? Math.max(0, allowance.limit - allowance.used) : null;

  if (!isAuthenticated) {
    return (
      <div className="relative z-[1] min-h-[100dvh] bg-[#000]" data-builder-surface>
        <button
          onClick={() => navigate('/app')}
          className="absolute top-4 right-4 z-10 w-11 h-11 rounded-full bg-[rgba(255,255,255,0.08)] text-[#fff] flex items-center justify-center"
          title="Back to DeHub"
        >
          <X className="w-5 h-5" />
        </button>
        <AuthGate description="Log in to build apps" />
      </div>
    );
  }

  // ── HOME ────────────────────────────────────────────────────────────────
  const home = (
    <div className="min-h-[100dvh] flex flex-col" style={BLOOM_BG}>
      <div className="flex items-center justify-between p-4 sm:p-5">
        <CircleButton onClick={() => setDrawerOpen(true)} title="Your builds">
          <Menu className="w-5 h-5" />
        </CircleButton>
        <div className="flex items-center gap-2.5">
          <img src={dehubIcon} alt="" className="w-7 h-7 object-contain" />
          <span className="text-[22px] font-extrabold tracking-tight text-[#fff]">Builder</span>
        </div>
        <CircleButton onClick={() => navigate('/app')} title="Back to DeHub">
          <X className="w-5 h-5" />
        </CircleButton>
      </div>

      <div className="flex-1 flex flex-col justify-center w-full max-w-lg mx-auto px-5 pb-16">
        <button
          onClick={() => navigate('/stake')}
          className={cn(
            'mx-auto flex items-center gap-2.5 rounded-full border px-5 py-2.5 transition-colors',
            'bg-[rgba(10,10,12,0.55)] hover:bg-[rgba(30,30,34,0.65)] backdrop-blur-md',
            STROKE,
          )}
          title="Stake DHB to raise your daily build allowance"
        >
          <Sparkles className="w-4 h-4 text-[#f0b3ff]" />
          <span className="text-[15px] font-semibold text-[#fff]">
            {buildsLeft === null ? 'Builds' : `${buildsLeft} build${buildsLeft === 1 ? '' : 's'} left`}
            <span className={cn('font-normal', TEXT_DIM)}> · {allowance?.tierName ?? '…'}</span>
          </span>
          <ArrowRight className="w-4 h-4 text-[#fff]" />
        </button>

        <h1 className="text-center text-[34px] sm:text-[40px] font-extrabold tracking-tight text-[#fff] mt-7 leading-tight">
          Got an idea, {firstName}?
        </h1>

        <div className="mx-auto mt-7 rounded-full bg-[rgba(22,22,24,0.7)] backdrop-blur-md p-1 flex items-center">
          <button className="flex items-center gap-2 rounded-full bg-[#fff] text-[#000] px-6 py-2.5 text-[16px] font-bold">
            <Globe className="w-4 h-4" />
            Web
          </button>
          <button
            onClick={() => toast('📱 iOS builds are coming soon')}
            className={cn('flex items-center gap-2 rounded-full px-6 py-2.5 text-[16px] font-bold', TEXT_DIM)}
          >
            <Smartphone className="w-4 h-4" />
            Mobile
          </button>
        </div>

        <div className="mt-4">
          <Composer
            value={prompt}
            onChange={setPrompt}
            onSend={handleCreate}
            placeholder="Ask Builder to build anything…"
            sending={creating}
            model={model}
            onModel={setModel}
            big
          />
        </div>
      </div>

      <div className={cn('pb-6 flex items-center justify-center gap-2 text-[13px]', TEXT_DIM)}>
        <img src={dehubIcon} alt="" className="w-3.5 h-3.5 object-contain opacity-70" />
        Works with the DeHub gateway
      </div>
    </div>
  );

  // ── DRAWER ──────────────────────────────────────────────────────────────
  const drawer = (
    <AnimatePresence>
      {drawerOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-[rgba(0,0,0,0.6)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDrawerOpen(false)}
          />
          <motion.div
            className="fixed left-0 top-0 bottom-0 z-50 w-[86%] max-w-[360px] bg-[#121214] rounded-r-[28px] flex flex-col p-5"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-3 pt-2">
              <img src={dehubIcon} alt="" className="w-8 h-8 object-contain" />
              <span className="text-[26px] font-extrabold tracking-tight text-[#fff]">Your builds</span>
            </div>

            <button
              onClick={() => {
                setDrawerOpen(false);
                setSelectedId(null);
                setView('home');
              }}
              className="flex items-center gap-4 mt-6 group"
            >
              <span className="w-11 h-11 rounded-full bg-[#fff] text-[#000] flex items-center justify-center group-active:scale-95 transition-transform">
                <Plus className="w-5 h-5" strokeWidth={2.5} />
              </span>
              <span className="text-[19px] font-semibold text-[#fff]">New build</span>
            </button>

            <div className={cn('border-t my-5', STROKE)} />

            <div className="flex-1 overflow-y-auto -mx-2 px-2">
              {(projectsQuery.data?.length ?? 0) === 0 && (
                <p className={cn('text-center text-[15px] mt-8', TEXT_DIM)}>No builds yet.</p>
              )}
              {projectsQuery.data?.map((p) => {
                const s = statusMeta(p);
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-4 py-2.5 cursor-pointer group"
                    onClick={() => openProject(p.id)}
                  >
                    <div
                      className="w-12 h-12 rounded-full shrink-0 flex items-center justify-center text-[15px]"
                      style={sphereStyle(p.id)}
                    >
                      <span className="drop-shadow-sm">{p.emoji}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[17px] font-bold text-[#fff] truncate">{p.name}</p>
                      <p className="flex items-center gap-1.5 text-[14px]">
                        <span
                          className={cn('w-2 h-2 rounded-full inline-block', s.pulse && 'animate-pulse')}
                          style={{ background: s.dot }}
                        />
                        <span className={TEXT_DIM}>{s.label}</span>
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(p.id, p.name);
                      }}
                      title="Delete build"
                      className="p-2 text-[#5a5a5e] hover:text-[#f56161] opacity-0 group-hover:opacity-100 max-lg:opacity-60 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-[#5a5a5e] shrink-0" />
                  </div>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  // ── CHAT ────────────────────────────────────────────────────────────────
  const renderAgentMessage = (m: BuilderMessage) => {
    const isSuccess = m.content.startsWith('✅');
    const isError = m.content.startsWith('❌');
    if (isSuccess && project) {
      const updated = /^✅ Updated/.test(m.content);
      const summary = m.content.replace(/^✅ [^!]*!\s*/, '');
      return (
        <div key={m.id} className="my-4">
          <div
            className="rounded-[24px] border border-[#3f7aff] bg-[rgba(10,12,20,0.9)] p-5"
            style={{ boxShadow: '0 0 28px rgba(63,122,255,0.35), inset 0 0 22px rgba(63,122,255,0.08)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-[21px] font-bold text-[#fff] leading-snug">
                {updated ? `Updated ${project.name}` : `Built ${project.name}`}
              </p>
              <Bookmark className="w-5 h-5 text-[#c9c9ce] shrink-0 mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button
                onClick={() => {
                  setOpenFile(null);
                  setDetailsOpen(true);
                }}
                className={cn('rounded-2xl py-3.5 text-[16px] font-semibold text-[#fff] transition-colors', SURFACE, 'hover:bg-[#2c2c2e]')}
              >
                Details
              </button>
              <button
                onClick={() => setView('preview')}
                className={cn('rounded-2xl py-3.5 text-[16px] font-semibold text-[#fff] transition-colors', SURFACE, 'hover:bg-[#2c2c2e]')}
              >
                Preview
              </button>
            </div>
          </div>
          {summary && <p className="text-[16px] text-[#e8e8ea] leading-relaxed mt-4 px-1">{summary}</p>}
          <div className="flex items-center gap-4 mt-3 px-1 relative">
            <button
              title="Copy"
              onClick={() => {
                navigator.clipboard.writeText(summary || m.content).catch(() => {});
                toast.success('Copied');
              }}
              className="text-[#949499] hover:text-[#fff] transition-colors"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              title="More"
              onClick={() => setMsgMenuOpen((v) => (v === m.id ? null : m.id))}
              className="text-[#949499] hover:text-[#fff] transition-colors"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {msgMenuOpen === m.id && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMsgMenuOpen(null)} />
                <div className={cn('absolute left-0 top-7 z-50 rounded-2xl border p-1.5 min-w-[210px]', 'bg-[#1c1c1e]', STROKE)}>
                  {[
                    { label: 'Copy link', icon: LinkIcon, run: copyLink },
                    { label: 'Open in browser', icon: Compass, run: openInTab },
                    { label: 'Rebuild from scratch', icon: RefreshCw, run: () => sendToProject('Rebuild this app from scratch with the same idea, but better.') },
                    { label: 'Delete build', icon: Trash2, run: () => handleDelete(project.id, project.name), danger: true },
                  ].map(({ label, icon: Icon, run, danger }) => (
                    <button
                      key={label}
                      onClick={() => {
                        setMsgMenuOpen(null);
                        run();
                      }}
                      className={cn(
                        'w-full flex items-center gap-2.5 text-left px-3.5 py-2.5 rounded-xl text-[15px] font-medium transition-colors hover:bg-[rgba(255,255,255,0.06)]',
                        danger ? 'text-[#f56161]' : 'text-[#e8e8ea]',
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      );
    }
    if (isError) {
      return (
        <div key={m.id} className="my-4">
          <div className="rounded-[24px] border border-[rgba(245,97,97,0.5)] bg-[rgba(24,10,12,0.85)] p-5">
            <p className="text-[17px] font-bold text-[#f56161]">Build failed</p>
            <p className={cn('text-[14px] mt-1.5 leading-relaxed break-words', TEXT_DIM)}>
              {m.content.replace(/^❌\s*/, '')}
            </p>
            <button
              onClick={() => sendToProject('Try again')}
              disabled={busy || sending}
              className={cn('mt-4 rounded-2xl px-6 py-3 text-[15px] font-semibold text-[#fff] transition-colors', SURFACE, 'hover:bg-[#2c2c2e]', (busy || sending) && 'opacity-40')}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return (
      <p key={m.id} className="text-[16px] text-[#e8e8ea] leading-relaxed my-3 px-1 whitespace-pre-wrap break-words">
        {m.content}
      </p>
    );
  };

  const chat = project && (
    <div className="min-h-[100dvh] flex flex-col bg-[#000]">
      <div className="flex items-center justify-between gap-3 p-4">
        <CircleButton onClick={() => setView('home')} title="Home">
          <House className="w-5 h-5" />
        </CircleButton>
        <div className="relative min-w-0">
          <button
            onClick={() => setSwitcherOpen((v) => !v)}
            className={cn('flex items-center gap-2 rounded-full px-5 py-2.5 max-w-[60vw]', SURFACE)}
          >
            <span className="text-[17px] font-semibold text-[#fff] truncate">{project.name}</span>
            <ChevronDown className="w-4 h-4 text-[#949499] shrink-0" />
          </button>
          {switcherOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSwitcherOpen(false)} />
              <div className={cn('absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 rounded-2xl border p-1.5 w-[260px] max-h-[50vh] overflow-y-auto', 'bg-[#1c1c1e]', STROKE)}>
                {projectsQuery.data?.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSwitcherOpen(false);
                      openProject(p.id);
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-xl transition-colors hover:bg-[rgba(255,255,255,0.06)]',
                      p.id === project.id && 'bg-[rgba(255,255,255,0.08)]',
                    )}
                  >
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] shrink-0" style={sphereStyle(p.id)}>
                      {p.emoji}
                    </span>
                    <span className="text-[15px] font-medium text-[#fff] truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <CircleButton onClick={() => setView('preview')} title="Preview" disabled={!live && files.length === 0}>
          <Play className="w-5 h-5" />
        </CircleButton>
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        <div className="max-w-2xl mx-auto w-full pb-4">
          <p className={cn('text-center text-[14px] my-2', TEXT_DIM)}>
            {format(new Date(project.created_at), "MMM d 'at' h:mm a")}
          </p>
          {projectQuery.isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-[#949499]" />
            </div>
          )}
          {messages.map((m) => {
            if (m.role === 'user') {
              return (
                <div key={m.id} className="flex flex-col items-end my-3">
                  <div className={cn('max-w-[85%] rounded-[22px] px-5 py-3.5 text-[17px] text-[#fff] whitespace-pre-wrap break-words', SURFACE_LIGHT)}>
                    {m.content}
                  </div>
                  <button
                    title="Copy"
                    onClick={() => {
                      navigator.clipboard.writeText(m.content).catch(() => {});
                      toast.success('Copied');
                    }}
                    className="mt-2 mr-1 text-[#949499] hover:text-[#fff] transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              );
            }
            if (m.role === 'agent') return renderAgentMessage(m);
            return (
              <p key={m.id} className={cn('text-[15px] my-2 px-1', TEXT_DIM)}>
                {m.content}
              </p>
            );
          })}
          {busy && (
            <div className="flex items-center gap-2.5 my-4 px-1">
              <Loader2 className="w-4 h-4 animate-spin text-[#3f7aff]" />
              <span className="text-[15px] text-[#c9c9ce] animate-pulse">
                {project.status_detail || 'Thinking'}
              </span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {live && !busy && (
        <div className="px-4 pb-2">
          <div className="max-w-2xl mx-auto w-full flex gap-2 overflow-x-auto scrollbar-hide">
            {CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => sendToProject(chip)}
                className={cn('rounded-full px-4 py-2.5 text-[15px] font-medium text-[#fff] whitespace-nowrap transition-colors', SURFACE, 'hover:bg-[#2c2c2e]')}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 pb-5 pt-1">
        <div className="max-w-2xl mx-auto w-full">
          <Composer
            value={chatInput}
            onChange={setChatInput}
            onSend={() => sendToProject(chatInput)}
            placeholder={busy ? 'Working…' : 'Ask Builder…'}
            disabled={busy}
            sending={sending}
            model={model}
            onModel={setModel}
          />
        </div>
      </div>
    </div>
  );

  // ── PREVIEW ─────────────────────────────────────────────────────────────
  const preview = project && (
    <div className="h-[100dvh] flex flex-col bg-[#000]">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-[17px] font-bold text-[#fff] truncate leading-tight">{project.name}</p>
          <p className={cn('text-[12px] truncate', TEXT_DIM)}>{shareUrl.replace(/^https?:\/\//, '')}</p>
        </div>
        <button
          onClick={() => setIframeNonce((n) => n + 1)}
          className={cn('rounded-full px-4 py-2 text-[15px] font-semibold text-[#fff] transition-colors shrink-0', SURFACE_LIGHT, 'hover:bg-[#3a3a3d]')}
        >
          Reload
        </button>
        <button
          onClick={openInTab}
          className="rounded-full bg-[#fff] text-[#000] px-4 py-2 text-[15px] font-semibold shrink-0 active:scale-95 transition-transform"
        >
          Open
        </button>
      </div>

      {appLoadError ? (
        <div className="flex-1 grid place-items-center px-6 text-center">
          <div>
            <div className="text-3xl mb-2">😵</div>
            <p className="text-[#fff] text-sm font-medium">Couldn’t load the preview</p>
            <p className={cn('text-xs mt-1', TEXT_DIM)}>{project.error || 'Try reloading in a moment.'}</p>
          </div>
        </div>
      ) : !appSrcDoc ? (
        <div className="flex-1 grid place-items-center">
          <div className="flex items-center gap-2.5">
            <Loader2 className="w-5 h-5 animate-spin text-[#3f7aff]" />
            <span className={cn('text-[15px]', TEXT_DIM)}>Getting things ready…</span>
          </div>
        </div>
      ) : (
        <iframe
          key={`${selectedId}-${iframeNonce}`}
          srcDoc={appSrcDoc}
          title={project.name}
          className="flex-1 w-full bg-[#fff] rounded-[10px]"
          sandbox={BUILDER_IFRAME_SANDBOX}
        />
      )}

      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => setView('chat')}
          className={cn('flex items-center gap-2 rounded-full px-5 py-3 text-[16px] font-semibold text-[#fff] transition-colors', SURFACE, 'hover:bg-[#2c2c2e]')}
        >
          <ChevronLeft className="w-4 h-4" />
          Chat
        </button>
        <div className="flex items-center gap-3">
          <CircleButton onClick={() => setIframeNonce((n) => n + 1)} title="Reload" className="w-12 h-12 bg-[#1c1c1e]">
            <RefreshCw className="w-5 h-5" />
          </CircleButton>
          <CircleButton onClick={openInTab} title="Open in browser" className="w-12 h-12 bg-[#1c1c1e]">
            <Compass className="w-5 h-5" />
          </CircleButton>
          <CircleButton onClick={shareLink} title="Share" className="w-12 h-12 bg-[#1c1c1e]">
            <Share className="w-5 h-5" />
          </CircleButton>
        </div>
      </div>
    </div>
  );

  // ── DETAILS SHEET ───────────────────────────────────────────────────────
  const details = (
    <Drawer open={detailsOpen} onOpenChange={setDetailsOpen}>
      <DrawerContent className="bg-[#121214] border-t border-[rgba(255,255,255,0.09)]">
        <DrawerHeader>
          <DrawerTitle className="text-[#fff] text-[19px] font-bold">
            {project ? `${project.name} · Files` : 'Files'}
          </DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-8 max-h-[70vh] overflow-y-auto">
          <button
            onClick={copyLink}
            className={cn('w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 mb-3 transition-colors', SURFACE, 'hover:bg-[#2c2c2e]')}
          >
            <LinkIcon className="w-4 h-4 text-[#3f7aff] shrink-0" />
            <span className={cn('flex-1 text-left text-[13px] truncate', TEXT_DIM)}>{shareUrl}</span>
            <span className="text-[14px] font-semibold text-[#fff]">Copy</span>
          </button>
          {files.length === 0 && <p className={cn('text-center text-[15px] py-6', TEXT_DIM)}>No files yet</p>}
          {files.map((f) => {
            const open = openFile === f.path;
            const lines = f.content.split('\n').length;
            const ext = f.path.split('.').pop()?.toUpperCase() ?? 'FILE';
            return (
              <div key={f.path} className="mb-2">
                <button
                  onClick={() => setOpenFile(open ? null : f.path)}
                  className="w-full flex items-center gap-3.5 py-3 px-1"
                >
                  <FileText className="w-5 h-5 text-[#949499] shrink-0" />
                  <span className="flex-1 text-left">
                    <span className="block text-[16px] font-semibold text-[#fff] font-mono">{f.path}</span>
                    <span className={cn('block text-[13px]', TEXT_DIM)}>
                      {ext} · {lines} lines
                    </span>
                  </span>
                  <ChevronRight className={cn('w-4 h-4 text-[#5a5a5e] transition-transform', open && 'rotate-90')} />
                </button>
                {open && (
                  <pre className="rounded-2xl bg-[#0a0a0c] text-[#c9c9ce] text-[12px] font-mono leading-relaxed p-4 overflow-auto max-h-[45vh]">
                    {f.content}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );

  return (
    <div className="relative z-[1] min-h-[100dvh] bg-[#000]" data-builder-surface>
      <SEOHead
        title="Builder — Build Apps with AI on DeHub"
        description="Describe an app and DeHub Builder creates it live: AI-written, DeHub-hosted mini apps you can share with anyone."
        url="https://dehub.io/app/builder"
      />
      {view === 'home' && home}
      {view === 'chat' &&
        (chat || (
          <div className="min-h-[100dvh] grid place-items-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#3f7aff]" />
          </div>
        ))}
      {view === 'preview' &&
        (preview || (
          <div className="min-h-[100dvh] grid place-items-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#3f7aff]" />
          </div>
        ))}
      {drawer}
      {details}
    </div>
  );
}
