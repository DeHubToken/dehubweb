import { useEffect, useRef, useState } from 'react';
import type { GenerationJob } from '@/store/generationStore';
import { useGenerationStore } from '@/store/generationStore';
import { saveGenerationPreview } from '@/lib/creator/cloudLibrary';

/** One renderer at a time, then a small private still shared by web and native. */
export function MeshThumbnailQueue({ jobs, wallet }: { jobs: GenerationJob[]; wallet: string | null }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [attempted, setAttempted] = useState<Set<string>>(() => new Set());
  useEffect(() => setAttempted(new Set()), [wallet]);
  const job = jobs.find((item) => item.kind === 'model3d' && item.status === 'done' && item.url && !item.posterUrl &&
    (!wallet || item.cloudSaved) &&
    (!item.exportFormat || ['glb', 'gltf'].includes(item.exportFormat)) && !attempted.has(item.id));
  useEffect(() => {
    if (!job) return;
    let active = true;
    const finish = () => setAttempted((previous) => new Set(previous).add(job.id));
    const timer = window.setTimeout(finish, 45_000);
    const receive = async (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== window.location.origin || event.data?.type !== 'creator-mesh-preview') return;
      if (event.data.ready) { frame.current?.contentWindow?.postMessage({ id: job.id, url: job.url }, window.location.origin); return; }
      if (event.data.id !== job.id) return;
      const dataUrl = event.data.dataUrl;
      if (typeof dataUrl === 'string' && dataUrl.length < 800_000 && /^data:image\/(webp|png|jpeg);base64,/.test(dataUrl)) {
        let posterUrl = dataUrl;
        if (wallet && job.cloudSaved) {
          try { posterUrl = await saveGenerationPreview(wallet, job.id, await (await fetch(dataUrl)).blob()); } catch { /* A local still remains usable while offline. */ }
        }
        if (active) useGenerationStore.setState((state) => ({ jobs: state.jobs.map((item) => item.id === job.id ? { ...item, posterUrl } : item) }));
      }
      if (active) finish();
    };
    window.addEventListener('message', receive);
    return () => { active = false; window.clearTimeout(timer); window.removeEventListener('message', receive); };
  }, [job?.id, job?.url, job?.cloudSaved, wallet]);
  if (!job) return null;
  return <iframe ref={frame} key={job.id} src="/creator-mesh-preview.html" title="3D" aria-hidden tabIndex={-1}
    style={{ position: 'fixed', left: -1000, top: 0, width: 256, height: 256, border: 0, pointerEvents: 'none' }} />;
}
