import { translateCopy as _translateCopy } from '@/i18n/copy';

export interface MotionVariant { url: string; poster: string }
export interface MotionClip {
  id: string; name: string; category: string; tags: string;
  url: string; poster: string; seconds: number; width: number; height: number;
  variants: MotionVariant[];
}
export interface MotionCatalog { captured: string; total?: number; clips: MotionClip[] }

const catalogUrl = '/creator-clips/catalog.json';
let catalogRequest: Promise<MotionCatalog> | undefined;
let featuredRequest: Promise<MotionCatalog> | undefined;
export function loadFeaturedMotionClips(): Promise<MotionCatalog> {
  if (!featuredRequest) featuredRequest = fetch('/creator-clips/featured.json').then(async response => {
    if (!response.ok) throw new Error('Motion library could not load.');
    return await response.json() as MotionCatalog;
  }).catch(error => { featuredRequest = undefined; throw error; });
  return featuredRequest;
}
export function loadMotionCatalog(): Promise<MotionCatalog> {
  if (!catalogRequest) catalogRequest = fetch(catalogUrl).then(async response => {
    if (!response.ok) throw new Error('Motion library could not load.');
    return await response.json() as MotionCatalog;
  }).catch(error => { catalogRequest = undefined; throw error; });
  return catalogRequest;
}
export async function findMotionClip(id: string): Promise<MotionClip | undefined> {
  return (await loadFeaturedMotionClips()).clips.find(clip => clip.id === id)
    ?? (await loadMotionCatalog()).clips.find(clip => clip.id === id);
}
export function motionModel(clip: MotionClip, workflow: 'swap' | 'motion' = 'swap') {
  return workflow === 'motion' || clip.seconds > 15 ? 'kling-3-motion' : 'kling-o3-edit';
}
export function motionAspect(clip: MotionClip) { return clip.width / clip.height > 1.3 ? '16:9' : clip.height / clip.width > 1.3 ? '9:16' : '1:1'; }
export async function downloadMotionSource(id: string): Promise<File> {
  const response = await fetch(`/api/creator-motion-source?id=${encodeURIComponent(id)}`, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok || Number(response.headers.get('Content-Length')) > 100 * 1024 * 1024) throw new Error(_translateCopy("copy.0d752fdfe929", { defaultValue: "This source clip is unavailable or exceeds 100 MB." }));
  const blob = await response.blob();
  if (blob.size > 100 * 1024 * 1024) throw new Error(_translateCopy("copy.c1beb7c2b7af", { defaultValue: "Choose a source clip smaller than 100 MB." }));
  return new File([blob], `source-${id}.mp4`, { type: 'video/mp4' });
}
export function searchMotionClips(clips: MotionClip[], query: string, category = 'All') {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return clips.filter(clip => (category === 'All' || clip.category === category)
    && terms.every(term => `${clip.name} ${clip.category} ${clip.tags}`.toLocaleLowerCase().includes(term)));
}
