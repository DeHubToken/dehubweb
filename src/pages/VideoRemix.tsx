import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { buildRemixStudioHtml, type RemixStudioConfig } from '@/lib/editor/remixStudioHtml';
import { useEditorQuota } from '@/hooks/use-editor-quota';
import { importOneFile } from '@/lib/editor/importFiles';
import { useEditorStore } from '@/store/editorStore';
import { saveProject, setLastProjectId } from '@/lib/editor/projectStore';
import { writeEditorRecovery } from '@/lib/editor/draftRecovery';
import { useAccountDraftKey } from '@/hooks/use-draft-state';
import { DEFAULT_SETTINGS, type ProjectSnapshot } from '@/lib/editor/types';
import { getNFTInfo } from '@/lib/api/dehub';
import { videoNeedsAccess } from '@/lib/api/dehub/video-access';
import { checkReactionSource, tokenIdFromPostUrl } from '@/lib/api/remix-links';

const REMIX_MODES = ['green-screen', 'collab', 'sound', 'cut', 'react'];
/** Reactions run long: up to ten minutes, handed over as a Blob rather than a data URL. */
const REACT_MAX_SECONDS = 601;
const REACT_MAX_BYTES = 160 * 1024 * 1024;

async function checkSource(sourceUrl: string, mode: string) {
  const post = await getNFTInfo(decodeURIComponent(new URL(sourceUrl).pathname.split('/').pop()!));
  const extra = post as typeof post & { plansDetails?: unknown[]; plans?: unknown[]; deleted?: boolean };
  if (!post || post.postType !== 'video' || post.isHidden || extra.deleted || post.is_live || post.status === 'live'
    || post.stream?.isActive || post.spoilerText || (post.contentRating && post.contentRating !== 'safe')
    || (post.quotePolicy && post.quotePolicy !== 'public' && !post.isOwner)
    || videoNeedsAccess({ visibility: post.visibility, isPPV: post.is_ppv || post.streamInfo?.isPayPerView,
      isLocked: post.is_locked || post.streamInfo?.isLockContent,
      lockedPrice: post.locked_price ?? post.streamInfo?.lockContentAmount,
      subscriberPlans: extra.plansDetails ?? extra.plans })) throw new Error('This video is unavailable for remixing.');
  // The creator's "Allow reactions" switch lives with the remix links; the server says no for them.
  if (mode === 'react') {
    const tokenId = tokenIdFromPostUrl(sourceUrl);
    const verdict = tokenId ? await checkReactionSource(tokenId) : { allowed: false, reason: null };
    if (!verdict.allowed) throw new Error(verdict.reason || 'This video is unavailable for reactions.');
  }
}

export default function VideoRemix() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const quota = useEditorQuota();
  const scope = useAccountDraftKey('editor:recovery') ?? 'guest|editor:recovery';
  const frame = useRef<HTMLIFrameElement>(null);
  const busy = useRef(false);
  const [error, setError] = useState('');
  const [available, setAvailable] = useState(false);
  const config = useMemo<RemixStudioConfig | null>(() => {
    if (!state || !REMIX_MODES.includes(state.mode)
      || typeof state.videoUrl !== 'string' || !state.videoUrl.startsWith('https://')
      || typeof state.sourceUrl !== 'string' || !/^https:\/\/dehub\.io\/app\/post\/[^/?#]+$/.test(state.sourceUrl)) return null;
    return { mode: state.mode, videoUrl: state.videoUrl, sourceUrl: state.sourceUrl,
      title: String(state.title || 'Video').slice(0, 200), creator: typeof state.creator === 'string' ? state.creator.slice(0, 100) : undefined,
      bridgeKey: crypto.randomUUID() };
  }, [state]);
  const html = useMemo(() => config ? buildRemixStudioHtml(config) : '', [config]);
  useEffect(() => {
    let cancelled = false;
    setAvailable(false);
    if (config) void checkSource(config.sourceUrl, config.mode).then(() => { if (!cancelled) setAvailable(true); })
      .catch(failure => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Could not open this video.'); });
    return () => { cancelled = true; };
  }, [config]);
  useEffect(() => {
    const target = frame.current?.contentWindow;
    return () => { if (config) target?.postMessage({ key: config.bridgeKey, type: 'dispose' }, '*'); };
  }, [config, available, quota.walletAddress]);
  useEffect(() => {
    let closed = false;
    const captureWallet = quota.walletAddress;
    const onMessage = async (event: MessageEvent) => {
      if (!config || event.source !== frame.current?.contentWindow || event.data?.key !== config.bridgeKey) return;
      const data = event.data;
      if (data.type === 'cancel') { navigate(-1); return; }
      if (data.type !== 'recorded' || busy.current) return;
      busy.current = true;
      try {
        await checkSource(config.sourceUrl, config.mode);
        if (closed) return;
        const react = config.mode === 'react';
        const sized = react
          ? (data.width === 720 && data.height === 1280) || (data.width === 1280 && data.height === 720)
          : data.width === 720 && [720, 1280].includes(data.height);
        const handedBlob = react && data.blob instanceof Blob && /^video\/(webm|mp4)/.test(data.blob.type);
        if ((!handedBlob && (typeof data.dataUrl !== 'string' || data.dataUrl.length > (react ? REACT_MAX_BYTES * 1.4 : 34 * 1024 * 1024)
          || !/^data:video\/(webm|mp4);base64,[A-Za-z0-9+/]+=*$/.test(data.dataUrl)))
          || !Number.isFinite(data.duration) || data.duration <= .25 || data.duration > (react ? REACT_MAX_SECONDS : 61)
          || !sized) throw new Error('Invalid recording. Please try another take.');
        const blob: Blob = handedBlob ? data.blob : await (await fetch(data.dataUrl)).blob();
        if (blob.size > (react ? REACT_MAX_BYTES : 25 * 1024 * 1024)) throw new Error('Recording is too large. Please use a shorter take.');
        const file = new File([blob], `remix-${Date.now()}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`, { type: blob.type });
        const mediaId = await importOneFile(file, { wallet: captureWallet, badgeBalance: quota.badgeBalance,
          username: quota.username, duration: data.duration });
        if (closed) return;
        if (!mediaId) throw new Error('Could not save the recording. Your take is ready to retry.');
        const previous = useEditorStore.getState().toSnapshot();
        if (previous.clips.length) await saveProject(previous);
        const project: ProjectSnapshot = {
          id: crypto.randomUUID(), title: `${config.mode}: ${config.title}`, updatedAt: Date.now(),
          settings: { ...DEFAULT_SETTINGS, width: data.width, height: data.height,
            aspectPreset: data.width > data.height ? '16:9' : data.height === 720 ? '1:1' : '9:16',
            remixSource: { url: config.sourceUrl, creator: config.creator, title: config.title, mode: config.mode } },
          tracks: [{ id: 'remix', kind: 'video', name: 'Remix', muted: false, hidden: false }],
          clips: [{ id: crypto.randomUUID(), trackId: 'remix', kind: 'video', mediaId, start: 0,
            trimIn: 0, duration: data.duration, sourceDuration: data.duration, label: `${react ? 'Reaction' : 'Remix'}: ${config.title}`, href: config.sourceUrl }],
        };
        await saveProject(project);
        if (closed) return;
        writeEditorRecovery(scope, project); setLastProjectId(project.id); useEditorStore.getState().loadSnapshot(project);
        navigate('/editor');
      } catch (failure) {
        if (!closed) {
          const message = failure instanceof Error ? failure.message : 'Could not save this take.';
          setError(message); frame.current?.contentWindow?.postMessage({ key: config.bridgeKey, type: 'save-failed', error: message }, '*');
        }
      } finally { busy.current = false; }
    };
    window.addEventListener('message', onMessage);
    return () => { closed = true; window.removeEventListener('message', onMessage); };
  }, [config, navigate, quota.walletAddress, quota.badgeBalance, quota.username, scope]);
  if (!config) return <main className="p-8 text-white"><h1>{t('videoRemix.menu', { defaultValue: 'Remix' })}</h1>
    <p>{t('videoRemix.selectSource', { defaultValue: 'Open a video’s options and choose Remix to start.' })}</p>
    <button onClick={() => navigate('/app')}>{t('common.back', { defaultValue: 'Back' })}</button></main>;
  return <main className="fixed inset-0 z-[100] bg-black">
    {error && <p role="alert" className="absolute bottom-0 z-10 bg-black p-2 text-red-200">{error}</p>}
    {available ? <iframe key={`${config.bridgeKey}:${quota.walletAddress ?? 'guest'}`} ref={frame} title="Remix studio" srcDoc={html}
      allow="camera; microphone; autoplay" className="h-full w-full border-0" />
      : <div className="p-8 text-white"><p>{error || 'Opening video…'}</p><button onClick={() => navigate(-1)}>Back</button></div>}
  </main>;
}
