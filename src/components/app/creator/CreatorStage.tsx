/**
 * Token Stage pieces for /creator
 * ===============================
 * The hero's wall of community work, the "Pick a medium" tiles and the tools
 * bento. Each surface is liquid glass and every icon is the active theme's own
 * artwork, so the page belongs to whichever theme is on.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ThemedIcon, type ThemeIconKey } from '@/components/app/war/WarHudIcon';
import { DHB_USD_PEG, formatDhb } from '@/hooks/use-ai-quote';
import { IMAGE_MODELS, getImageCostUsd } from '@/constants/image-models.constants';
import { VIDEO_MODELS, getVideoCostUsd } from '@/constants/video-models.constants';
import { MODEL3D_MODELS, getModel3dCostUsd } from '@/constants/model3d-models.constants';
import dehubCoin from '@/assets/dehub-coin.png';
import { cn } from '@/lib/utils';

export type GalleryItem = { id: string; image_url: string | null; video_url: string | null; created_at: string };

/**
 * One request for the community gallery, shared by the hero wall and the
 * gallery section further down, so the page never asks twice.
 */
let galleryRequest: Promise<GalleryItem[]> | null = null;
export function loadCreatorGallery(): Promise<GalleryItem[]> {
  if (!galleryRequest) {
    galleryRequest = (async () => {
      const { data, error } = await supabase.rpc('get_creator_gallery', { p_limit: 90 });
      if (error) {
        console.error('[creator gallery] rpc error', error);
        galleryRequest = null;
        return [];
      }
      return (data ?? []) as GalleryItem[];
    })();
  }
  return galleryRequest;
}

// Supabase Storage public-object URLs go through the image resizer, so the
// wall and grid download small thumbs instead of full-size originals.
export function thumbUrl(url: string, width = 480): string {
  if (!url) return url;
  try {
    if (url.includes('/storage/v1/object/public/')) {
      const resized = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
      const sep = resized.includes('?') ? '&' : '?';
      return `${resized}${sep}width=${width}&quality=65&resize=cover`;
    }
  } catch {
    /* fall through */
  }
  return url;
}

/**
 * The hero's backdrop: a tilted wall of recent community stills, dimmed and
 * faded into the page. Decorative, so it is hidden from assistive tech and
 * simply stays empty if the gallery cannot load.
 */
export function CreatorHeroWall() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  useEffect(() => {
    let cancelled = false;
    void loadCreatorGallery().then((all) => {
      if (!cancelled) setItems(all.filter((i) => i.image_url).slice(0, 15));
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[600px] overflow-hidden sm:h-[640px]"
      // Faded out by a mask rather than painted over, so it melts into
      // whatever each theme draws behind the page.
      style={{ WebkitMaskImage: 'linear-gradient(to bottom, #000 45%, transparent)', maskImage: 'linear-gradient(to bottom, #000 45%, transparent)' }}
    >
      {items.length > 0 && (
        <div className="absolute -inset-x-16 -top-10 grid rotate-[-4deg] grid-cols-3 gap-3 opacity-50 sm:grid-cols-5">
          {items.map((item, i) => (
            <div
              key={item.id}
              className={cn('aspect-[3/4] overflow-hidden rounded-2xl bg-white/5', i % 2 === 1 && '-translate-y-10', i >= 9 && 'hidden sm:block')}
            >
              <img
                src={thumbUrl(item.image_url!, 320)}
                alt=""
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                className="h-full w-full object-cover"
                draggable={false}
              />
            </div>
          ))}
        </div>
      )}
      {/* Dims the wall so the headline and composer stay readable. */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 35%, rgba(9,10,11,0.45), rgba(9,10,11,0.8) 70%)' }} />
    </div>
  );
}

/** Cheapest run of each medium, in DHB at the display peg. */
function useStartingPrices() {
  return useMemo(() => {
    const toDhb = (usd: number) => Math.ceil(usd / DHB_USD_PEG);
    const image = Math.min(...Object.values(IMAGE_MODELS).map((m) => getImageCostUsd(m)));
    const video = Math.min(...Object.values(VIDEO_MODELS).map((m) => getVideoCostUsd(m, m.minDuration)));
    const model3d = Math.min(...Object.values(MODEL3D_MODELS).map((m) => getModel3dCostUsd(m, 'none')));
    return { image: toDhb(image), video: toDhb(video), model3d: toDhb(model3d) };
  }, []);
}

type Medium = 'image' | 'video' | 'audio' | '3d' | 'agents';

/**
 * Five big tiles, one per medium, each with its theme icon and what it starts
 * at. Picking one switches the composer above and puts the cursor in it.
 */
export function MediumDoors() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const prices = useStartingPrices();
  const [active, setActive] = useState<Medium>('video');

  useEffect(() => {
    const onMode = (e: Event) => setActive((e as CustomEvent<Medium>).detail);
    window.addEventListener('creator:mode-changed', onMode);
    return () => window.removeEventListener('creator:mode-changed', onMode);
  }, []);

  const doors: { id: Medium; icon: ThemeIconKey; label: string; price: string | null; note?: string }[] = [
    { id: 'image', icon: 'images', label: t('creator.navImage'), price: formatDhb(prices.image) },
    { id: 'video', icon: 'videos', label: t('creator.navVideo'), price: formatDhb(prices.video) },
    { id: 'audio', icon: 'audio', label: t('creator.navAudio'), price: null, note: t('creator.doorAudioNote') },
    { id: '3d', icon: 'fractions', label: t('creator.door3d'), price: formatDhb(prices.model3d) },
    { id: 'agents', icon: 'assistant', label: t('creator.navAgents'), price: null, note: t('creator.doorAgentsNote') },
  ];

  const pick = (id: Medium) => {
    if (id === 'agents') {
      navigate('/app/assistant#preset=chat');
      return;
    }
    window.dispatchEvent(new CustomEvent('creator:mode', { detail: id }));
  };

  return (
    <section className="px-3 pb-8 pt-4 sm:px-4">
      <h2 className="mb-4 font-exo text-[22px] font-black tracking-tight text-white sm:text-[28px]">{t('creator.pickMedium')}</h2>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 lg:gap-3">
        {doors.map((door) => (
          <button
            key={door.id}
            type="button"
            onClick={() => pick(door.id)}
            aria-pressed={door.id !== 'agents' ? active === door.id : undefined}
            className={cn(
              'group flex min-h-[132px] flex-col justify-between gap-3 rounded-[22px] border bg-white/[0.06] p-4 text-left backdrop-blur-2xl backdrop-saturate-150 transition hover:-translate-y-0.5 hover:bg-white/[0.1] sm:min-h-[190px] sm:p-5',
              active === door.id
                ? 'border-white/80 shadow-[0_18px_40px_-20px_var(--cr-glow)]'
                : 'border-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]',
              door.id === 'agents' && 'col-span-2 sm:col-span-1',
            )}
          >
            <ThemedIcon icon={door.icon} className="h-12 w-12 object-contain transition-transform group-hover:scale-105 sm:h-[72px] sm:w-[72px]" />
            <span>
              <span className="block font-exo text-[16px] font-black leading-none text-white sm:text-[19px]">{door.label}</span>
              <span className="mt-2 flex items-center gap-1.5 text-[12.5px] text-white/60">
                {door.price ? (
                  <>
                    <img src={dehubCoin} alt="" className="h-3.5 w-3.5" />
                    {t('creator.fromDhb', { amount: door.price })}
                  </>
                ) : door.note}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * The tools bento: the editor as the big tile, then topping up DHB, agents,
 * Originals and the two assistant connectors.
 */
export function CreatorBento() {
  const { t } = useTranslation();
  const tile = 'group relative flex flex-col justify-between gap-4 overflow-hidden rounded-[22px] border border-white/12 bg-white/[0.06] p-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-2xl backdrop-saturate-150 transition hover:-translate-y-0.5 hover:bg-white/[0.1]';
  const title = 'block font-exo text-[17px] font-black leading-tight text-white sm:text-[20px]';
  const copy = 'mt-1.5 block text-[13px] leading-snug text-white/60';
  const arrow = <ArrowUpRight aria-hidden className="absolute right-4 top-4 h-4 w-4 text-white/35 transition-colors group-hover:text-white" />;

  return (
    <section className="grid grid-cols-2 gap-2.5 px-3 pb-8 sm:px-4 lg:grid-cols-4 lg:gap-3">
      <Link to="/editor" className={cn(tile, 'col-span-2 min-h-[180px] lg:row-span-2 lg:min-h-[320px]')}>
        {arrow}
        <ThemedIcon icon="tv" className="h-14 w-14 object-contain sm:h-20 sm:w-20" />
        <span>
          <span className={title}>{t('creator.bentoEditorTitle')}</span>
          <span className={copy}>{t('creator.bentoEditorCopy')}</span>
        </span>
      </Link>
      <Link to="/buy" className={cn(tile, 'min-h-[150px]')}>
        {arrow}
        <ThemedIcon icon="buy" className="h-11 w-11 object-contain" />
        <span>
          <span className={title}>{t('creator.bentoTopUpTitle')}</span>
          <span className={copy}>{t('creator.bentoTopUpCopy')}</span>
        </span>
      </Link>
      <Link to="/app/agents" className={cn(tile, 'min-h-[150px]')}>
        {arrow}
        <ThemedIcon icon="assistant" className="h-11 w-11 object-contain" />
        <span>
          <span className={title}>{t('creator.navAgents')}</span>
          <span className={copy}>{t('creator.toolAgentFlowsDesc')}</span>
        </span>
      </Link>
      <Link to="/connect/chatgpt" className={cn(tile, 'min-h-[150px]')}>
        {arrow}
        <ThemedIcon icon="command" className="h-11 w-11 object-contain" />
        <span>
          <span className={title}>{t('creator.insideChatgpt')}</span>
          <span className={copy}>{t('creator.readChatgptGuide')}</span>
        </span>
      </Link>
      <Link to="/connect/claude" className={cn(tile, 'min-h-[150px]')}>
        {arrow}
        <ThemedIcon icon="features" className="h-11 w-11 object-contain" />
        <span>
          <span className={title}>{t('creator.insideClaude')}</span>
          <span className={copy}>{t('creator.readClaudeGuide')}</span>
        </span>
      </Link>
    </section>
  );
}
